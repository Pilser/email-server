import type { MiddlewareHandler } from 'hono';
import type { Variables } from './auth-middleware';

export const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (c, next) => {
  const user = c.get('user');
  if (user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);
  await next();
};
