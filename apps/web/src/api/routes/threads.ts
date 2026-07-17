import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, lt, desc, isNotNull } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const mailboxId = c.req.query('mailboxId');
  const folder = c.req.query('folder') || 'inbox';
  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : undefined;
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);

  if (!mailboxId) return c.json({ error: 'mailboxId is required' }, 400);

  const conditions = [eq(schema.thread.mailboxId, mailboxId)];

  if (folder === 'trash') {
    conditions.push(isNotNull(schema.thread.deletedAt));
  } else {
    conditions.push(eq(schema.thread.deletedAt, null));
  }

  if (cursor) {
    conditions.push(lt(schema.thread.lastMessageAt, cursor));
  }

  const rows = await db
    .select()
    .from(schema.thread)
    .where(and(...conditions))
    .orderBy(desc(schema.thread.lastMessageAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const threads = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? threads[threads.length - 1].lastMessageAt?.getTime() ?? null : null;

  return c.json({
    threads: threads.map((t) => ({
      id: t.id,
      subject: t.subject,
      snippet: t.snippet,
      participants: t.participants ? JSON.parse(t.participants) : [],
      messageCount: t.messageCount,
      unreadCount: t.unreadCount,
      status: t.status,
      priority: t.priority,
      lastMessageAt: t.lastMessageAt,
      createdAt: t.createdAt,
    })),
    nextCursor,
  });
});

router.get('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const [row] = await db
    .select()
    .from(schema.thread)
    .where(eq(schema.thread.id, id))
    .limit(1);

  if (!row) return c.json({ error: 'Thread not found' }, 404);

  return c.json({
    id: row.id,
    mailboxId: row.mailboxId,
    subject: row.subject,
    snippet: row.snippet,
    participants: row.participants ? JSON.parse(row.participants) : [],
    messageCount: row.messageCount,
    unreadCount: row.unreadCount,
    status: row.status,
    priority: row.priority,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  });
});

router.patch('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json<{
    unreadCount?: number;
    status?: string;
    deletedAt?: string | null;
    priority?: string;
  }>();

  const updateData: Record<string, unknown> = {};
  if (body.unreadCount !== undefined) updateData.unreadCount = body.unreadCount;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.deletedAt !== undefined) updateData.deletedAt = body.deletedAt;
  if (body.priority !== undefined) updateData.priority = body.priority;

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }

  await db
    .update(schema.thread)
    .set(updateData)
    .where(eq(schema.thread.id, id));

  const [row] = await db
    .select()
    .from(schema.thread)
    .where(eq(schema.thread.id, id))
    .limit(1);

  if (!row) return c.json({ error: 'Thread not found' }, 404);

  return c.json({
    id: row.id,
    mailboxId: row.mailboxId,
    subject: row.subject,
    snippet: row.snippet,
    participants: row.participants ? JSON.parse(row.participants) : [],
    messageCount: row.messageCount,
    unreadCount: row.unreadCount,
    status: row.status,
    priority: row.priority,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  });
});

router.delete('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const now = new Date();
  await db
    .update(schema.thread)
    .set({ deletedAt: now })
    .where(eq(schema.thread.id, id));

  return c.json({ success: true });
});

export default router;
