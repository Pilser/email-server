import { createMimeMessage } from 'mimetext';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { buildReferences, generateSnippet, resolveThreadId } from './threads';
import { broadcastToUsers } from '../hub';

export async function sendFromMailbox(
  env: Env,
  input: {
    mailboxId: string;
    to: { name?: string; address: string }[];
    cc?: { name?: string; address: string }[];
    bcc?: { name?: string; address: string }[];
    subject: string;
    text?: string;
    html?: string;
    inReplyTo?: string;
    references?: string;
    attachments?: { filename: string; mimeType: string; content: ArrayBuffer }[];
    quote?: { text: string; html: string };
  },
): Promise<{ messageId: string; threadId: string }> {
  const db = drizzle(env.DB);

  const mb = await db.query.mailbox.findFirst({
    where: eq(schema.mailbox.id, input.mailboxId),
    columns: { id: true, localPart: true, domainId: true, displayName: true, address: true, ownerId: true },
  });
  if (!mb) throw new Error('mailbox not found');

  const dom = await db.query.domain.findFirst({
    where: eq(schema.domain.id, mb.domainId),
    columns: { name: true },
  });
  if (!dom) throw new Error('domain missing');

  const fromAddr = mb.address;
  const fromName = mb.displayName ?? undefined;

  let text = input.text || '';
  let html = input.html || '';
  if (input.quote) {
    text = text ? `${text}\n${input.quote.text}` : input.quote.text;
    html = html ? `${html}\n${input.quote.html}` : input.quote.html;
  }

  const messageId = crypto.randomUUID();
  const messageIdHdr = `<${messageId}@${dom.name}>`;

  const allRecipients = [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])];
  const threadingRefs = buildReferences(input.references ?? null, input.inReplyTo ?? null);
  const threadId = await resolveThreadId(db, input.mailboxId, input.inReplyTo, threadingRefs);

  const msg = createMimeMessage();
  msg.setSender({ name: fromName ?? '', addr: fromAddr });
  msg.setRecipients(input.to.map((r) => ({ name: r.name ?? '', addr: r.address })));
  if (input.cc?.length) msg.setCc(input.cc.map((r) => ({ name: r.name ?? '', addr: r.address })));
  if (input.bcc?.length) msg.setBcc(input.bcc.map((r) => ({ name: r.name ?? '', addr: r.address })));
  msg.setSubject(input.subject);
  msg.setHeader('Message-ID', messageIdHdr);
  if (input.inReplyTo) msg.setHeader('In-Reply-To', input.inReplyTo);
  if (threadingRefs) msg.setHeader('References', threadingRefs);
  msg.addMessage({ contentType: 'text/plain', data: text || '' });
  if (html) msg.addMessage({ contentType: 'text/html', data: html });
  for (const att of input.attachments ?? []) {
    msg.addAttachment({
      contentType: att.mimeType,
      data: new Uint8Array(att.content),
      filename: att.filename,
      inline: false,
    });
  }
  const raw = msg.asRaw();

  const rawKey = `raw/${mb.id}/sent/${messageId}.eml`;
  const now = new Date();
  const snippet = generateSnippet(text);

  const fromField: string | { name: string; address: string } = fromName
    ? { name: fromName, address: fromAddr }
    : fromAddr;

  // Ensure thread row exists
  const existingThread = await db.query.thread.findFirst({
    where: eq(schema.thread.id, threadId),
    columns: { id: true },
  });
  if (!existingThread) {
    await db.insert(schema.thread).values({
      id: threadId,
      mailboxId: mb.id,
      subject: input.subject || null,
      messageCount: 0,
      unreadCount: 0,
      createdAt: now,
    });
  }

  // Persist to R2 + D1 before sending
  await Promise.all([
    env.BLOBS.put(rawKey, raw, { httpMetadata: { contentType: 'message/rfc822' } }),
    db.insert(schema.message).values({
      id: messageId,
      mailboxId: mb.id,
      threadId,
      messageId: messageIdHdr,
      inReplyTo: input.inReplyTo ?? null,
      references: threadingRefs,
      fromAddress: fromAddr,
      fromName: fromName ?? null,
      toAddress: input.to.map((r) => r.address).join(', '),
      subject: input.subject,
      bodyText: text || null,
      bodyHtml: html || null,
      rawKey,
      isOutbound: true,
      isRead: true,
      isSpam: false,
      sizeBytes: new TextEncoder().encode(raw).byteLength,
      receivedAt: now,
    }),
  ]);

  // Send via Cloudflare Email Service
  try {
    await env.EMAIL.send({
      from: fromField,
      to: input.to.map((a) => a.address),
      cc: input.cc?.length ? input.cc.map((a) => a.address) : undefined,
      bcc: input.bcc?.length ? input.bcc.map((a) => a.address) : undefined,
      subject: input.subject,
      text: text || '',
      html: html || '',
      headers: {
        ...(input.inReplyTo ? { 'In-Reply-To': input.inReplyTo } : {}),
        ...(threadingRefs ? { References: threadingRefs } : {}),
      },
    });
  } catch (err) {
    await Promise.all([
      env.BLOBS.delete(rawKey).catch(() => {}),
      db.delete(schema.message).where(eq(schema.message.id, messageId)).catch(() => {}),
    ]);
    throw err;
  }

  // Update thread participants, count, and lastMessageAt
  const existingThreadData = existingThread
    ? existingThread
    : await db.query.thread.findFirst({
        where: eq(schema.thread.id, threadId),
        columns: { participants: true, messageCount: true },
      });

  const existingParticipants = existingThreadData?.participants
    ? JSON.parse(existingThreadData.participants)
    : [];

  const participantMap = new Map<string, { name?: string; address: string }>();
  for (const p of [...existingParticipants, { name: fromName, address: fromAddr }, ...allRecipients]) {
    if (p?.address && !participantMap.has(p.address.toLowerCase())) {
      participantMap.set(p.address.toLowerCase(), p);
    }
  }

  await db
    .update(schema.thread)
    .set({
      subject: input.subject,
      snippet,
      participants: JSON.stringify([...participantMap.values()]),
      messageCount: (existingThreadData?.messageCount ?? 0) + 1,
      lastMessageAt: now,
    })
    .where(eq(schema.thread.id, threadId));

  if (mb.ownerId) {
    broadcastToUsers(env, [mb.ownerId], {
      type: 'message_sent',
      mailboxId: mb.id,
      messageId,
      threadId,
    });
  }

  return { messageId, threadId };
}
