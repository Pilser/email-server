import { defineMiddleware } from 'astro/middleware';
import app from './api/index';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith('/api')) {
    const runtime = context.locals.runtime;
    const request = new Request(context.request, {
      headers: context.request.headers,
    });
    return app.fetch(request, runtime?.env, runtime?.ctx);
  }
  return next();
});
