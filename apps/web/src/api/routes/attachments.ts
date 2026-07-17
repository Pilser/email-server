import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/attachments/:id/download', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const [att] = await db
    .select()
    .from(schema.attachment)
    .where(eq(schema.attachment.id, id))
    .limit(1);

  if (!att) return c.json({ error: 'Attachment not found' }, 404);
  if (!att.r2Key) return c.json({ error: 'Attachment has no stored data (oversized)' }, 404);

  const [msg] = await db
    .select({ mailboxId: schema.message.mailboxId })
    .from(schema.message)
    .where(eq(schema.message.id, att.messageId))
    .limit(1);

  if (!msg) return c.json({ error: 'Parent message not found' }, 404);

  const [mbox] = await db
    .select({ ownerId: schema.mailbox.ownerId })
    .from(schema.mailbox)
    .where(eq(schema.mailbox.id, msg.mailboxId))
    .limit(1);

  if (!mbox) return c.json({ error: 'Mailbox not found' }, 404);

  const user = c.get('user');
  if (mbox.ownerId !== user.id) return c.json({ error: 'Forbidden' }, 403);

  const obj = await c.env.BLOBS.get(att.r2Key);
  if (!obj) return c.json({ error: 'File not found in storage' }, 404);

  const filename = att.filename || 'attachment';
  const contentType = att.mimeType || 'application/octet-stream';

  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=86400',
    },
  });
});

export default router;
