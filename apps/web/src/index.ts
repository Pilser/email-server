import type { SSRManifest } from 'astro';
import { App } from 'astro/app';
import { env as globalEnv } from 'cloudflare:workers';
import { setGetEnv } from 'astro/env/setup';
import { handleInbound } from './mail/receive';
import { UserHub } from './hub';

export { UserHub };

const createGetEnv = (env: Record<string, unknown>) => (key: string) => {
  const v = env[key];
  if (v === undefined || typeof v === 'string') return v;
  if (typeof v === 'boolean' || typeof v === 'number') return v.toString();
  return undefined;
};

setGetEnv(createGetEnv(globalEnv));

async function handleFetch(
  manifest: SSRManifest,
  app: App,
  request: Request,
  env: Record<string, unknown>,
  context: ExecutionContext,
): Promise<Response> {
  const { pathname } = new URL(request.url);

  const bindingName = (globalThis as any).__ASTRO_SESSION_BINDING_NAME;
  if (bindingName) {
    (globalThis as any).__env__ ??= {};
    (globalThis as any).__env__[bindingName] = env[bindingName];
  }

  if (manifest.assets.has(pathname)) {
    return (env as any).ASSETS.fetch(request.url.replace(/\.html$/, ''));
  }

  const routeData = app.match(request);
  if (!routeData) {
    const asset = await (env as any).ASSETS.fetch(
      request.url.replace(/index\.html$/, '').replace(/\.html$/, ''),
    );
    if (asset.status !== 404) return asset;
  }

  Reflect.set(
    request,
    Symbol.for('astro.clientAddress'),
    request.headers.get('cf-connecting-ip'),
  );

  const locals = {
    runtime: {
      env: env as any,
      cf: (request as any).cf,
      caches,
      ctx: {
        waitUntil: (p: Promise<any>) => context.waitUntil(p),
        passThroughOnException: () => {
          throw new Error('passThroughOnException not available in Pages');
        },
        props: {},
      },
    },
  };

  const response = await app.render(request, {
    routeData,
    locals,
    prerenderedErrorPageFetch: async (url: string) =>
      (env as any).ASSETS.fetch(url.replace(/\.html$/, '')),
  });

  if (app.setCookieHeaders) {
    for (const header of app.setCookieHeaders(response)) {
      response.headers.append('Set-Cookie', header);
    }
  }

  return response;
}

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);

  const fetch = (request: Request, env: Env, context: ExecutionContext) => {
    return handleFetch(manifest, app, request, env as any, context);
  };

  const email = async (
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext,
  ) => {
    await handleInbound(message, env, ctx);
  };

  const scheduled = async (
    _controller: ScheduledController,
    _env: Env,
    _ctx: ExecutionContext,
  ) => {
    // Placeholder for future cleanup tasks
  };

  return {
    default: { fetch },
    email,
    scheduled,
  };
}
