import PostalMime from 'postal-mime';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema';
import { sanitizeFilename } from './sanitize';
import {
  resolveThreadId,
  generateMessageId,
  buildReferences,
  generateSnippet,
} from './threads';
import { broadcastToUsers } from '../hub';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function classifySpam(
  parsed: { headers?: Array<{ key: string; value: string }>; from?: { address?: string } },
  _domainName: string,
  _rawBuffer: ArrayBuffer,
): { isSpam: boolean; reason?: string } {
  let score = 0;
  const headers = parsed.headers || [];
  const getHeader = (name: string) => headers.find(h => h.key.toLowerCase() === name)?.value;

  const spamHeader = getHeader('x-spam-status');
  if (spamHeader?.toLowerCase().includes('yes')) score += 5;

  const spamFlag = getHeader('x-spam-flag');
  if (spamFlag?.toLowerCase() === 'yes') score += 3;

  const authResults = getHeader('authentication-results');
  if (authResults) {
    const lower = authResults.toLowerCase();
    if (lower.includes('spf=fail') || lower.includes('spf=softfail')) score += 2;
    if (lower.includes('dkim=fail')) score += 2;
  }

  const fromAddr = parsed.from?.address || '';
  const [localPart] = fromAddr.split('@');
  if (localPart && /^\d{6,}$/.test(localPart)) score += 1;

  return { isSpam: score >= 3, reason: score >= 3 ? `spam score: ${score}` : undefined };
}

export async function handleInbound(
  message: ForwardableEmailMessage,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const db = drizzle(env.DB);
  const now = new Date();

  const rawBuffer = await new Response(message.raw).arrayBuffer();

  const toAddress = message.to.toLowerCase();
  const atIndex = toAddress.lastIndexOf('@');
  if (atIndex === -1) return;
  const domainName = toAddress.slice(atIndex + 1);
  const fullLocalPart = toAddress.slice(0, atIndex);
  const plusIndex = fullLocalPart.indexOf('+');
  const baseLocalPart =
    plusIndex > 0 ? fullLocalPart.slice(0, plusIndex) : fullLocalPart;

  const [domainRow] = await db
    .select()
    .from(schema.domain)
    .where(
      and(
        eq(schema.domain.name, domainName),
        eq(schema.domain.status, 'active'),
      ),
    )
    .limit(1);
  if (!domainRow) return;

  const messageId = crypto.randomUUID();
  const year = now.slice(0, 4);
  const month = now.slice(5, 7);
  const rawKey = `raw/${domainName}/${year}/${month}/${messageId}.eml`;
  await env.BLOBS.put(rawKey, rawBuffer);

  const parsed = await PostalMime.parse(rawBuffer, {
    attachmentEncoding: 'arraybuffer',
    maxNestingDepth: 50,
    maxHeadersSize: 1_048_576,
  });

  let mailboxRows = await db
    .select()
    .from(schema.mailbox)
    .where(
      and(
        eq(schema.mailbox.domainId, domainRow.id),
        eq(schema.mailbox.localPart, fullLocalPart),
        eq(schema.mailbox.isActive, true),
      ),
    )
    .limit(1);

  let actualLocalPart = fullLocalPart;
  if (mailboxRows.length === 0 && fullLocalPart !== baseLocalPart) {
    mailboxRows = await db
      .select()
      .from(schema.mailbox)
      .where(
        and(
          eq(schema.mailbox.domainId, domainRow.id),
          eq(schema.mailbox.localPart, baseLocalPart),
          eq(schema.mailbox.isActive, true),
        ),
      )
      .limit(1);
    if (mailboxRows.length > 0) actualLocalPart = baseLocalPart;
  }

  if (mailboxRows.length === 0) return;
  const mailbox = mailboxRows[0];

  const rfcMessageId = parsed.messageId || generateMessageId(domainName);
  const inReplyTo = parsed.inReplyTo || null;
  const references = parsed.references || null;

  const threadId = await resolveThreadId(
    db,
    mailbox.id,
    inReplyTo,
    references,
  );

  const subject = parsed.subject || '(no subject)';
  const bodyText = parsed.text || null;
  const bodyHtml = parsed.html || null;
  const snippet = generateSnippet(bodyText || bodyHtml);

  const fromAddr = parsed.from?.address || message.from;
  const fromName = parsed.from?.name || null;
  const toAddr = parsed.to
    ?.map((a: { address: string }) => a.address)
    .join(', ') || toAddress;

  const participants = JSON.stringify([
    fromAddr,
    ...(parsed.to?.map((a: { address: string }) => a.address) || []),
    ...(parsed.cc?.map((a: { address: string }) => a.address) || []),
  ]);

  const [existingThread] = await db
    .select()
    .from(schema.thread)
    .where(eq(schema.thread.id, threadId))
    .limit(1);

  if (existingThread) {
    await db
      .update(schema.thread)
      .set({
        subject,
        snippet,
        participants,
        messageCount: existingThread.messageCount + 1,
        unreadCount: existingThread.unreadCount + 1,
        lastMessageAt: now,
      })
      .where(eq(schema.thread.id, threadId));
  } else {
    await db.insert(schema.thread).values({
      id: threadId,
      mailboxId: mailbox.id,
      subject,
      snippet,
      participants,
      messageCount: 1,
      unreadCount: 1,
      status: 'open',
      priority: 'normal',
      lastMessageAt: now,
      createdAt: now,
    });
  }

  const attachmentResults = await Promise.allSettled(
    (parsed.attachments || []).map(
      async (att: any, idx: number) => {
        if (att.content.byteLength > MAX_ATTACHMENT_BYTES) {
          return {
            filename: att.filename || null,
            mimeType: att.mimeType || 'application/octet-stream',
            sizeBytes: att.content.byteLength,
            r2Key: null as string | null,
            contentId: att.contentId || null,
            isInline: !!att.contentId,
            oversized: true,
          };
        }
        const sanitized = sanitizeFilename(att.filename);
        const paddedIndex = String(idx + 1).padStart(2, '0');
        const filename = sanitized
          ? `${paddedIndex}-${sanitized}`
          : paddedIndex;
        const r2Key = `attachments/${domainName}/${messageId}/${filename}`;
        await env.BLOBS.put(r2Key, att.content);
        return {
          filename: att.filename || null,
          mimeType: att.mimeType || 'application/octet-stream',
          sizeBytes: att.content.byteLength,
          r2Key,
          contentId: att.contentId || null,
          isInline: !!att.contentId,
          oversized: false,
        };
      },
    ),
  );

  const builtReferences = buildReferences(references, inReplyTo);

  const spamResult = classifySpam(parsed as any, domainName, rawBuffer);

  await db.insert(schema.message).values({
    id: messageId,
    mailboxId: mailbox.id,
    threadId,
    messageId: rfcMessageId,
    inReplyTo: inReplyTo || null,
    references: builtReferences,
    fromAddress: fromAddr,
    fromName,
    toAddress: toAddr,
    subject,
    bodyText,
    bodyHtml,
    rawKey,
    isOutbound: false,
    isRead: false,
    isSpam: spamResult.isSpam,
    sizeBytes: rawBuffer.byteLength,
    receivedAt: now,
  });

  for (const result of attachmentResults) {
    if (result.status === 'fulfilled' && !result.value.oversized) {
      const att = result.value;
      await db.insert(schema.attachment).values({
        id: crypto.randomUUID(),
        messageId,
        filename: att.filename,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        r2Key: att.r2Key,
        contentId: att.contentId,
        isInline: att.isInline,
        createdAt: now,
      });
    }
  }

  if (mailbox.ownerId) {
    ctx.waitUntil(
      broadcastToUsers(env, [mailbox.ownerId], {
        type: 'new_message',
        mailboxId: mailbox.id,
        messageId,
        threadId,
      }),
    );
  }
}
