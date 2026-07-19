import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { createAuth } from './auth';
import { handleInbound } from '../mail/receive';
import { requireAuth } from './auth-middleware';
import { requireAdmin } from './admin-middleware';
import type { Variables } from './auth-middleware';
import * as schema from '../db/schema';
import threads from './routes/threads';
import messages from './routes/messages';
import attachments from './routes/attachments';
import mailboxes from './routes/mailboxes';
import domains from './routes/domains';
import send from './routes/send';
import realtime from './routes/realtime';
import search from './routes/search';
import adminRoutes from './routes/admin';
import claimAdminRoutes from './routes/claim-admin';

type Bindings = import('../env').Env;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .use('/api/*', cors())
  .get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  })
  .get('/api/auth/me', async (c) => {
    try {
      const auth = createAuth(c.env);
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: 'Unauthorized' }, 401);
      const u = session.user;
      return c.json({
        user: {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          emailVerified: u.emailVerified,
          image: u.image,
          createdAt: u.createdAt,
          updatedAt: u.updatedAt,
        },
      });
    } catch {
      return c.json({ error: 'Unauthorized' }, 401);
    }
  })

  // Public: check if any admin exists (for setup page) — must be BEFORE auth catch-all
  .get('/api/auth/admin-exists', async (c) => {
    try {
      const db = drizzle(c.env.DB);

      const [admin] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.role, 'admin'))
        .limit(1);
      if (admin) return c.json({ exists: true });

      if (c.env.ADMIN_EMAIL) {
        const [match] = await db
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.email, c.env.ADMIN_EMAIL))
          .limit(1);
        if (match) return c.json({ exists: true });
      }

      return c.json({ exists: false });
    } catch (err) {
      console.error('admin-exists error:', err);
      return c.json({ exists: false });
    }
  })

  // Custom auth routes that must be BEFORE the Better Auth catch-all
  .route('/api', claimAdminRoutes)

  .all('/api/auth/*', async (c) => {
    try {
      const auth = createAuth(c.env);
      return auth.handler(c.req.raw);
    } catch (err) {
      console.error('BetterAuth handler error:', err);
      return c.json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
    }
  })

  // Public: available domains for signup dropdown
  .get('/api/domains/available', async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({ id: schema.domain.id, name: schema.domain.name })
      .from(schema.domain)
      .where(eq(schema.domain.status, 'active'));
    return c.json({ domains: rows });
  })

  .use('/api/threads/*', requireAuth)
  .use('/api/messages/*', requireAuth)
  .use('/api/attachments/*', requireAuth)
  .use('/api/mailboxes/*', requireAuth)
  .use('/api/domains/*', requireAuth)
  .use('/api/send/*', requireAuth)
  .use('/api/realtime/*', requireAuth)
  .use('/api/search/*', requireAuth)

  .route('/api/threads', threads)
  .route('/api', messages)
  .route('/api', attachments)
  .route('/api/mailboxes', mailboxes)
  .route('/api/domains', domains)
  .route('/api/send', send)
  .route('/api/realtime', realtime)
  .route('/api/search', search)

  // Admin-only routes
  .use('/api/admin/*', requireAuth, requireAdmin)
  .route('/api/admin', adminRoutes)

  .post('/api/mail/test-receive', requireAuth, async (c) => {
    const rawBody = await c.req.text();
    const rawBytes = new TextEncoder().encode(rawBody).buffer;

    const mockMessage = {
      raw: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(rawBytes));
          controller.close();
        },
      }),
      to: 'test@example.com',
      from: 'sender@example.com',
      headers: new Headers(),
      size: rawBytes.byteLength,
    } as unknown as ForwardableEmailMessage;

    const result = handleInbound(mockMessage, c.env, {
      waitUntil: (p: Promise<unknown>) => p,
      passThroughOnException: () => {},
    });

    return c.json({
      success: true,
      message: 'Email processed (test mode)',
      messageId: crypto.randomUUID(),
    });
  });

export default app;
