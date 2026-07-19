import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createAuth } from '../auth';
import * as schema from '../../db/schema';

const router = new Hono<{ Bindings: Env }>();

router.post('/auth/claim-admin', async (c) => {
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: 'Unauthorized' }, 401);

    const user = session.user;
    const adminEmail = c.env.ADMIN_EMAIL;

    if (!adminEmail) {
      return c.json({ error: 'ADMIN_EMAIL not configured' }, 500);
    }
    if (user.email !== adminEmail) {
      return c.json({ error: 'Not authorized to claim admin' }, 403);
    }

    const db = drizzle(c.env.DB);

    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.role, 'admin'))
      .limit(1);

    if (existing && existing.id !== user.id) {
      return c.json({ error: 'Admin already claimed by another user' }, 409);
    }

    await db
      .update(schema.user)
      .set({ role: 'admin' })
      .where(eq(schema.user.id, user.id));

    return c.json({ success: true, role: 'admin' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ error: message }, 500);
  }
});

export default router;
