import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, lt, asc } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/threads/:threadId/messages', async (c) => {
  const db = drizzle(c.env.DB);
  const threadId = c.req.param('threadId');
  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : undefined;
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);

  const conditions = [
    eq(schema.message.threadId, threadId),
    eq(schema.message.deletedAt, null),
  ];

  if (cursor) {
    conditions.push(lt(schema.message.receivedAt, cursor));
  }

  const rows = await db
    .select()
    .from(schema.message)
    .where(and(...conditions))
    .orderBy(asc(schema.message.receivedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const messages = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? messages[messages.length - 1].receivedAt?.getTime() ?? null : null;

  const attachmentRows = await db
    .select()
    .from(schema.attachment)
    .where(
      and(
        ...messages.map((m) => eq(schema.attachment.messageId, m.id)),
      ),
    );

  const attachmentsByMessage: Record<string, typeof attachmentRows> = {};
  for (const att of attachmentRows) {
    if (!attachmentsByMessage[att.messageId]) attachmentsByMessage[att.messageId] = [];
    attachmentsByMessage[att.messageId].push(att);
  }

  return c.json({
    messages: messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      fromAddress: m.fromAddress,
      fromName: m.fromName,
      toAddress: m.toAddress,
      subject: m.subject,
      bodyText: m.bodyText,
      bodyHtml: m.bodyHtml,
      isRead: m.isRead,
      isSpam: m.isSpam,
      sizeBytes: m.sizeBytes,
      receivedAt: m.receivedAt,
      messageId: m.messageId,
      inReplyTo: m.inReplyTo,
      attachments: (attachmentsByMessage[m.id] || []).map((a) => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        isInline: a.isInline,
      })),
    })),
    nextCursor,
  });
});

router.get('/messages/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.id, id))
    .limit(1);

  if (!row) return c.json({ error: 'Message not found' }, 404);

  if (!row.isRead) {
    await db
      .update(schema.message)
      .set({ isRead: true })
      .where(eq(schema.message.id, id));
    row.isRead = true;
  }

  const attRows = await db
    .select()
    .from(schema.attachment)
    .where(eq(schema.attachment.messageId, id));

  return c.json({
    id: row.id,
    threadId: row.threadId,
    mailboxId: row.mailboxId,
    messageId: row.messageId,
    inReplyTo: row.inReplyTo,
    references: row.references,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    toAddress: row.toAddress,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    rawKey: row.rawKey,
    isOutbound: row.isOutbound,
    isRead: row.isRead,
    isSpam: row.isSpam,
    sizeBytes: row.sizeBytes,
    receivedAt: row.receivedAt,
    attachments: attRows.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      r2Key: a.r2Key,
      contentId: a.contentId,
      isInline: a.isInline,
    })),
  });
});

router.patch('/messages/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json<{
    isRead?: boolean;
    isSpam?: boolean;
  }>();

  const updateData: Record<string, unknown> = {};
  if (body.isRead !== undefined) updateData.isRead = body.isRead;
  if (body.isSpam !== undefined) updateData.isSpam = body.isSpam;

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  await db
    .update(schema.message)
    .set(updateData)
    .where(eq(schema.message.id, id));

  const [row] = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.id, id))
    .limit(1);

  if (!row) return c.json({ error: 'Message not found' }, 404);

  return c.json({
    id: row.id,
    threadId: row.threadId,
    mailboxId: row.mailboxId,
    messageId: row.messageId,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    toAddress: row.toAddress,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    isRead: row.isRead,
    isSpam: row.isSpam,
    sizeBytes: row.sizeBytes,
    receivedAt: row.receivedAt,
  });
});

router.delete('/messages/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const now = new Date();
  await db
    .update(schema.message)
    .set({ deletedAt: now })
    .where(eq(schema.message.id, id));

  return c.json({ success: true });
});

export default router;
