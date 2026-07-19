import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// Returns active domains for the authenticated user (admin panel uses /api/admin/domains)
router.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const rows = await db
    .select()
    .from(schema.domain)
    .where(eq(schema.domain.status, 'active'));
  return c.json({ domains: rows });
});

export default router;
