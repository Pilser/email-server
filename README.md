# Email Server

Multi-domain full-stack email server on Cloudflare Workers: inbound receive via Email Routing, outbound send via Cloudflare Email Service, web UI via Astro + React, metadata in D1, blobs in R2, real-time SSE via Durable Objects.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers (single Worker) |
| Framework | Astro 5 + React 19 |
| API | Hono 4 |
| Database | D1 + Drizzle ORM |
| Storage | R2 |
| Auth | Better Auth (email/password) |
| MIME Parse | postal-mime |
| MIME Build | mimetext |
| Email Inbound | Cloudflare Email Routing → `email()` handler |
| Email Outbound | Cloudflare Email Service (`env.EMAIL.send()`) |
| Real-time | Durable Object (SSE per user) |
| CSS | Tailwind v4 |
| Package Manager | bun |

## Project Structure

```
email-server/
├── package.json              # bun workspaces: ["apps/*", "packages/*"]
├── AGENTS.md                 # Agent guidelines
├── PLAN.md                   # Architecture plan
├── TEST_DOC.md               # Test plan
├── apps/
│   └── web/
│       ├── package.json      # @email/web — all dependencies
│       ├── wrangler.jsonc    # Worker config: D1, R2, EMAIL, ASSETS, DO
│       ├── astro.config.mjs  # Astro + Cloudflare adapter + React
│       └── src/
│           ├── index.ts      # Worker entry: fetch, email, scheduled, UserHub
│           ├── middleware.ts  # Astro middleware → /api/* routed to Hono
│           ├── env.d.ts      # Env interface: DB, BLOBS, EMAIL, USER_HUB, etc.
│           ├── hub.ts        # UserHub DO class + broadcastToUsers SSE
│           ├── api/
│           │   ├── index.ts           # Hono app: mounts all route groups
│           │   ├── auth.ts            # Better Auth factory
│           │   ├── auth-middleware.ts  # requireAuth() middleware
│           │   ├── cloudflare.ts      # CF API helper (MX, SPF, DKIM, routing)
│           │   └── routes/
│           │       ├── threads.ts     # GET/PATCH/DELETE threads
│           │       ├── messages.ts    # GET/PATCH/DELETE messages
│           │       ├── attachments.ts # GET download (R2 proxy)
│           │       ├── mailboxes.ts   # GET/POST mailboxes
│           │       ├── domains.ts     # CRUD + DNS check + CF auto-config
│           │       ├── send.ts       # POST send/reply/forward
│           │       ├── search.ts     # Full-text search
│           │       └── realtime.ts   # SSE subscription proxy
│           ├── mail/
│           │   ├── receive.ts    # Inbound: MIME → R2 → D1 + spam check
│           │   ├── send.ts       # Outbound: mimetext → R2 → D1 → EMAIL.send()
│           │   ├── threads.ts    # RFC 5322 thread resolution
│           │   ├── quote.ts      # Reply/forward formatting
│           │   └── sanitize.ts   # Filename sanitization
│           ├── db/
│           │   └── schema.ts     # 10 Drizzle tables
│           ├── lib/
│           │   ├── auth-client.ts # Better Auth React client
│           │   ├── sse.ts        # EventSource factory
│           │   └── utils.ts      # cn() helper
│           ├── components/
│           │   ├── InboxShell.tsx       # 3-column SPA
│           │   ├── Sidebar.tsx          # Mailbox/folder nav
│           │   ├── ThreadList.tsx       # Thread rows + pagination
│           │   ├── MessageView.tsx      # Message cards + actions
│           │   ├── ComposeDialog.tsx    # Compose modal
│           │   ├── Avatar.tsx           # Initial-based avatar
│           │   ├── icons.tsx            # 20 inline SVG icons
│           │   ├── SetupWizard.tsx      # Domain auto-config UI
│           │   ├── DomainStatusBadge.tsx
│           │   ├── auth/
│           │   │   ├── SignIn.tsx
│           │   │   └── SignUp.tsx
│           │   └── ui/
│           │       ├── button.tsx
│           │       ├── card.tsx
│           │       ├── input.tsx
│           │       ├── label.tsx
│           │       ├── badge.tsx
│           │       └── skeleton.tsx
│           ├── pages/
│           │   ├── index.astro         # Landing page
│           │   ├── signin.astro        # Sign in
│           │   ├── signup.astro        # Sign up
│           │   ├── inbox.astro         # Inbox (auth-guarded)
│           │   └── domains/            # Domain management
│           │       ├── index.astro     # List domains
│           │       ├── new.astro       # Add domain
│           │       └── [id].astro      # Domain detail + setup wizard
│           ├── layouts/
│           │   └── Layout.astro
│           └── styles/
│               └── globals.css         # @import "tailwindcss"
└── packages/
    └── shared/
        └── src/
            └── index.ts         # Shared schemas
```

## API Endpoints

All `/api/*` routes. Protected routes require `Authorization: Bearer <session_token>` or cookie-based session.

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| ALL | `/api/auth/*` | Better Auth handler (signup, signin, session, etc.) |

### Protected
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/threads` | List threads |
| GET | `/api/threads/:id` | Get thread detail |
| PATCH | `/api/threads/:id` | Update thread |
| DELETE | `/api/threads/:id` | Soft-delete thread |
| GET | `/api/threads/:threadId/messages` | List messages |
| GET | `/api/messages/:id` | Get message (auto-mark read) |
| PATCH | `/api/messages/:id` | Update message |
| DELETE | `/api/messages/:id` | Soft-delete message |
| GET | `/api/attachments/:id/download` | Stream from R2 |
| GET | `/api/mailboxes` | List user's mailboxes |
| POST | `/api/mailboxes` | Create mailbox |
| GET | `/api/domains` | List domains |
| POST | `/api/domains` | Add domain |
| GET | `/api/domains/:id` | Get domain |
| DELETE | `/api/domains/:id` | Soft-delete domain |
| POST | `/api/domains/:id/check-dns` | Check MX/SPF/DKIM |
| POST | `/api/domains/:id/setup` | CF auto-config (6 steps) |
| POST | `/api/send` | Send email |
| POST | `/api/send/reply` | Reply to message |
| POST | `/api/send/forward` | Forward message |
| GET | `/api/search` | Search threads + messages |
| GET | `/api/realtime/subscribe` | SSE stream |
| POST | `/api/mail/test-receive` | Process raw email |

## Development

```bash
bun install
bun run dev            # Start dev server (localhost:4321)
bun run db:generate    # Generate Drizzle migration from schema
bun run db:migrate     # Apply migrations to remote D1
bun run build          # Production build
bun run preview        # Preview with wrangler
bun run deploy         # Deploy to Cloudflare Workers
```

### One-time local setup

```bash
bun run db:generate
bunx wrangler d1 execute email-db --local --file=drizzle/<migration>.sql
```

## Worker Bindings

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 | Metadata database |
| `BLOBS` | R2 | Raw emails + attachments |
| `EMAIL` | send_email | Cloudflare Email Service |
| `ASSETS` | assets | Astro static build output |
| `USER_HUB` | Durable Object | Per-user SSE hub |
| `BETTER_AUTH_SECRET` | secret | Better Auth encryption key |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare API token (for domain auto-config) |
