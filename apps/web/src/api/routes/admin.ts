import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Variables } from '../auth-middleware';
import {
  lookupZone,
  ensureMxRecord,
  ensureSpfRecord,
  ensureDkimRecords,
  enableEmailRouting,
  ensureCatchAllRoute,
  checkMxViaDoh,
  checkSpfViaDoh,
  checkDkimViaDoh,
} from './cloudflare';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const createDomainSchema = z.object({
  name: z.string().min(1).regex(
    /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/,
    'Invalid domain name format',
  ),
});

router.get('/domains', async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db.select().from(schema.domain);
  return c.json({ domains: rows });
});

router.post('/domains', zValidator('json', createDomainSchema), async (c) => {
  const db = drizzle(c.env.DB);
  const user = c.get('user');
  const { name } = c.req.valid('json');

  const [existing] = await db
    .select({ id: schema.domain.id })
    .from(schema.domain)
    .where(eq(schema.domain.name, name))
    .limit(1);

  if (existing) return c.json({ error: 'Domain already exists' }, 409);

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(schema.domain).values({
    id,
    name,
    status: 'pending',
    mxVerified: false,
    ownerId: user.id,
    createdAt: now,
  });

  const [row] = await db
    .select()
    .from(schema.domain)
    .where(eq(schema.domain.id, id))
    .limit(1);

  return c.json(row, 201);
});

router.get('/domains/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');
  const [row] = await db
    .select()
    .from(schema.domain)
    .where(eq(schema.domain.id, id))
    .limit(1);

  if (!row) return c.json({ error: 'Domain not found' }, 404);
  return c.json(row);
});

router.delete('/domains/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const [domain] = await db
    .select()
    .from(schema.domain)
    .where(eq(schema.domain.id, id))
    .limit(1);

  if (!domain) return c.json({ error: 'Domain not found' }, 404);

  const mailboxes = await db
    .select({ id: schema.mailbox.id })
    .from(schema.mailbox)
    .where(and(eq(schema.mailbox.domainId, id), eq(schema.mailbox.deletedAt, null)));

  if (mailboxes.length > 0) {
    return c.json({ error: 'Cannot delete domain with existing mailboxes', count: mailboxes.length }, 409);
  }

  await db.update(schema.domain).set({ status: 'disabled' }).where(eq(schema.domain.id, id));
  return c.json({ success: true });
});

router.get('/users', async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
      role: schema.user.role,
      banned: schema.user.banned,
      emailVerified: schema.user.emailVerified,
      createdAt: schema.user.createdAt,
    })
    .from(schema.user);

  const mailboxCounts = await db
    .select({
      ownerId: schema.mailbox.ownerId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.mailbox)
    .where(eq(schema.mailbox.deletedAt, null))
    .groupBy(schema.mailbox.ownerId);

  const countMap = new Map(mailboxCounts.map((r) => [r.ownerId, r.count]));

  return c.json({
    users: rows.map((u) => ({
      ...u,
      mailboxCount: countMap.get(u.id) ?? 0,
    })),
  });
});

router.delete('/users/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');
  const currentUser = c.get('user');

  if (id === currentUser.id) {
    return c.json({ error: 'Cannot delete yourself' }, 409);
  }

  const [user] = await db.select().from(schema.user).where(eq(schema.user.id, id)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const mailboxes = await db
    .select({ id: schema.mailbox.id, domainId: schema.mailbox.domainId })
    .from(schema.mailbox)
    .where(and(eq(schema.mailbox.ownerId, id), eq(schema.mailbox.deletedAt, null)));

  const mailboxIds = mailboxes.map((m) => m.id);

  if (mailboxIds.length > 0) {
    const threads = await db
      .select({ id: schema.thread.id })
      .from(schema.thread)
      .where(sql`${schema.thread.mailboxId} IN ${mailboxIds}`);
    const threadIds = threads.map((t) => t.id);

    if (threadIds.length > 0) {
      const now = new Date();
      await db.update(schema.message).set({ deletedAt: now }).where(sql`${schema.message.threadId} IN ${threadIds}`);
      await db.update(schema.thread).set({ deletedAt: now }).where(sql`${schema.thread.id} IN ${threadIds}`);
    }

    const now = new Date();
    await db.update(schema.mailbox).set({ deletedAt: now }).where(sql`${schema.mailbox.id} IN ${mailboxIds}`);
  }

  await db.delete(schema.account).where(eq(schema.account.userId, id));
  await db.delete(schema.session).where(eq(schema.session.userId, id));
  await db.delete(schema.user).where(eq(schema.user.id, id));

  return c.json({ success: true });
});

router.post('/domains/:id/check-dns', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const [domain] = await db
    .select()
    .from(schema.domain)
    .where(eq(schema.domain.id, id))
    .limit(1);

  if (!domain) return c.json({ error: 'Domain not found' }, 404);

  const [mx, spf, dkim] = await Promise.all([
    checkMxViaDoh(domain.name),
    checkSpfViaDoh(domain.name),
    checkDkimViaDoh(domain.name),
  ]);

  return c.json({ mx, spf, dkim });
});

router.post('/domains/:id/setup', async (c) => {
  const db = drizzle(c.env.DB);
  const id = c.req.param('id');

  const [domain] = await db
    .select()
    .from(schema.domain)
    .where(eq(schema.domain.id, id))
    .limit(1);

  if (!domain) return c.json({ error: 'Domain not found' }, 404);

  const apiToken = c.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) {
    return c.json({ error: 'CLOUDFLARE_API_TOKEN not configured' }, 500);
  }

  const steps: { step: string; ok: boolean; message: string }[] = [];

  try {
    const zoneId = await lookupZone(domain.name, apiToken);
    if (!zoneId) {
      steps.push({ step: 'lookup-zone', ok: false, message: 'Zone not found in Cloudflare account' });
      return c.json({ success: false, steps });
    }
    steps.push({ step: 'lookup-zone', ok: true, message: `Found zone: ${zoneId}` });

    const mxOk = await ensureMxRecord(zoneId, domain.name, apiToken);
    steps.push({ step: 'add-mx', ok: mxOk, message: mxOk ? 'MX record added' : 'Failed to add MX record' });

    const spfOk = await ensureSpfRecord(zoneId, apiToken);
    steps.push({ step: 'add-spf', ok: spfOk, message: spfOk ? 'SPF record added' : 'Failed to add SPF record' });

    const dkimOk = await ensureDkimRecords(zoneId, apiToken);
    steps.push({ step: 'add-dkim', ok: dkimOk, message: dkimOk ? 'DKIM records added' : 'Failed to add DKIM records (may not be available)' });

    const routingOk = await enableEmailRouting(zoneId, apiToken);
    steps.push({ step: 'enable-routing', ok: routingOk, message: routingOk ? 'Email routing enabled' : 'Failed to enable email routing' });

    const catchAllOk = await ensureCatchAllRoute(zoneId, apiToken);
    steps.push({ step: 'catch-all', ok: catchAllOk, message: catchAllOk ? 'Catch-all route created' : 'Failed to create catch-all route' });

    const allOk = steps.every((s) => s.ok);

    if (allOk) {
      await db
        .update(schema.domain)
        .set({ status: 'active', mxVerified: true, cfZoneId: zoneId })
        .where(eq(schema.domain.id, id));
    }

    return c.json({ success: allOk, steps });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    steps.push({ step: 'error', ok: false, message });
    return c.json({ success: false, steps });
  }
});

export default router;
