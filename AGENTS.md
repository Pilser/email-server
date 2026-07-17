# Email Server — Agent Guidelines

## Package Manager
- **bun** only. Never use npm, pnpm, or yarn.
- Workspaces defined in `package.json` via `"workspaces"`, not `pnpm-workspace.yaml`.
- All scripts run with `bun run <script>`, not `pnpm` or `npm`.

## Project Structure

```
apps/web/          — Astro + Hono app (also the Cloudflare Worker)
packages/shared/   — Zod schemas, types, enums shared frontend/backend
```

## Architecture Decisions

- **Single Worker pattern** — The Astro app IS the Cloudflare Worker. `fetch()`, `email()`, and `scheduled()` all live in the same Worker.
- **Astro middleware routes `/api/*` to Hono** — Astro serves pages, Hono handles API.
- **D1 for metadata, R2 for blobs** — Never store raw email content in D1 (1MB row limit).
- **postal-mime** for MIME parsing, **mimetext** for building outgoing MIME.
- **Better Auth** on D1 for authentication.
- **Drizzle ORM** for type-safe D1 queries.

## Code Conventions

- TypeScript strict mode.
- No barrel files — use subpath exports (`@email/shared/*`).
- UUIDv7 for all primary keys.
- Timestamps as ISO 8601 strings (text type in D1).
- Soft deletes via `deletedAt` column on all data tables.
- Zod schemas as single source of truth for data shapes.
- No comments in code unless the logic is non-obvious.
- Use `ctx.waitUntil()` for non-critical background work.
- Use `Promise.allSettled` for attachment uploads (isolate failures).

## Multi-Domain

- Each domain gets its own catch-all in Cloudflare Email Routing → same Worker.
- `message.to` contains the full address → domain extracted per-email.
- D1 `domain` table stores domain config per tenant.
- R2 keys prefixed by domain: `raw/{domain}/{year}/{month}/{id}.eml`.

## MIME Pipeline

1. Read `message.raw` once → `ArrayBuffer`.
2. Store raw to R2 first (source of truth).
3. Parse with postal-mime (security limits: maxNestingDepth=50, maxHeadersSize=1MB).
4. Attachments >25MB → record as oversized, skip upload.
5. `Promise.allSettled` for attachments (one failure doesn't block others).
6. Insert metadata to D1 (never raw content).
7. Defer AI/notifications via `ctx.waitUntil()`.

## Dependencies

- When adding dependencies, prefer zero-dep libraries that work natively in Cloudflare Workers.
- Check that the library's ESM build works with `nodejs_compat` flag.
- Prefer libraries already used by the reference projects (postal-mime, mimetext, drizzle-orm, hono).

## Workflow

- Phases are implemented sequentially by sub-agents.
- Each sub-agent receives the full AGENTS.md context and current project state.
- I (the orchestrator) verify every sub-agent's output before approving next phase.
- Build must pass (`bun run build`) before moving to next phase.
