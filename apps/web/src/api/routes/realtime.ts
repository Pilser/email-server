import { Hono } from 'hono';
import { requireAuth } from '../auth-middleware';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/subscribe', requireAuth, async (c) => {
  const user = c.get('user');
  const stub = c.env.USER_HUB.get(c.env.USER_HUB.idFromName(user.id));
  const doResponse = await stub.fetch('https://hub/subscribe');
  return doResponse;
});

export default router;
