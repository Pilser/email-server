import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const createMailboxSchema = z.object({
  domainId: z.string().min(1),
  localPart: z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/),
  displayName: z.string().max(255).optional(),
  type: z.enum(['personal', 'alias', 'catch-all']).optional().default('personal'),
});

router.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get('user');

  const rows = await db
    .select()
    .from(schema.mailbox)
    .where(
      and(
        eq(schema.mailbox.ownerId, user.id),
        eq(schema.mailbox.deletedAt, null),
      ),
    );

  return c.json({
    mailboxes: rows.map((m) => ({
      id: m.id,
      address: m.address,
      displayName: m.displayName,
      type: m.type,
      domainId: m.domainId,
      isActive: m.isActive,
      createdAt: m.createdAt,
    })),
  });
});

router.post('/', zValidator('json', createMailboxSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get('user');
  const { domainId, localPart, displayName, type } = c.req.valid('json');

  const [domainRow] = await db
    .select()
    .from(schema.domain)
    .where(
      and(
        eq(schema.domain.id, domainId),
        eq(schema.domain.status, 'active'),
      ),
    )
    .limit(1);

  if (!domainRow) return c.json({ error: 'Domain not found or not active' }, 404);

  const address = `${localPart}@${domainRow.name}`;

  const [existing] = await db
    .select({ id: schema.mailbox.id })
    .from(schema.mailbox)
    .where(eq(schema.mailbox.address, address))
    .limit(1);

  if (existing) return c.json({ error: 'Mailbox address already exists' }, 409);

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(schema.mailbox).values({
    id,
    domainId,
    localPart,
    address,
    displayName: displayName || null,
    type,
    ownerId: user.id,
    isActive: true,
    createdAt: now,
  });

  return c.json({
    id,
    address,
    displayName: displayName || null,
    type,
    domainId,
    isActive: true,
    createdAt: now,
  }, 201);
});

export default router;
