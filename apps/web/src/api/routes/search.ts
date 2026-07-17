import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, like, or } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const q = c.req.query('q') || '';
  const mailboxId = c.req.query('mailboxId');

  if (!q || q.length < 2) return c.json({ threads: [], messages: [] });

  const query = `%${q}%`;

  const threadResults = await db
    .select()
    .from(schema.thread)
    .where(
      and(
        eq(schema.thread.deletedAt, null),
        mailboxId ? eq(schema.thread.mailboxId, mailboxId) : undefined,
        or(
          like(schema.thread.subject, query),
          like(schema.thread.participants, query),
        ),
      ),
    )
    .orderBy(schema.thread.lastMessageAt)
    .limit(20);

  const messageResults = await db
    .select()
    .from(schema.message)
    .where(
      and(
        eq(schema.message.deletedAt, null),
        mailboxId ? eq(schema.message.mailboxId, mailboxId) : undefined,
        or(
          like(schema.message.subject, query),
          like(schema.message.bodyText, query),
          like(schema.message.fromAddress, query),
        ),
      ),
    )
    .orderBy(schema.message.receivedAt)
    .limit(20);

  return c.json({ threads: threadResults, messages: messageResults });
});

export default router;
