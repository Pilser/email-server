export class DurableObject<Env = unknown> {
  ctx: DurableObjectState;
  env: Env;
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }
}

export const env: Record<string, unknown> =
  (globalThis as any).__env__ ?? {};
