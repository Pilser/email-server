/// <reference types="astro/client" />

export interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  EMAIL: SendEmail;
  BETTER_AUTH_SECRET: string;
  ASSETS: Fetcher;
  CLOUDFLARE_API_TOKEN: string;
  ADMIN_EMAIL: string;
  USER_HUB: DurableObjectNamespace;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
