import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuth } from './auth';
import { handleInbound } from '../mail/receive';
import { requireAuth } from './auth-middleware';
import type { Variables } from './auth-middleware';
import threads from './routes/threads';
import messages from './routes/messages';
import attachments from './routes/attachments';
import mailboxes from './routes/mailboxes';
import domains from './routes/domains';
import send from './routes/send';
import realtime from './routes/realtime';
import search from './routes/search';

type Bindings = import('../env').Env;

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
  .use('/api/*', cors())
  .get('/api/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  })
  .get('/api/auth/me', requireAuth, async (c) => {
    const user = c.get('user');
    return c.json({ user });
  })
  .all('/api/auth/*', async (c) => {
    const auth = createAuth(c.env);
    return auth.handler(c.req.raw);
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
