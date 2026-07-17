# Email Server — Complete Project Reference & Test Plan

> Generated after all 8 phases complete. Use this doc to understand the project and test it.

---

## 1. Project Overview

Multi-domain full-stack email server on Cloudflare Workers: inbound receive via Email Routing, outbound send via Cloudflare Email Service, web UI via Astro + React, metadata in D1, blobs in R2, real-time SSE via Durable Objects.

### Stack

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
| Package Manager | **bun** (not npm/pnpm) |

---

## 2. Project Structure

```
email-server/
├── package.json              # bun workspaces: ["apps/*", "packages/*"]
├── AGENTS.md                 # Agent guidelines
├── PLAN.md                   # Architecture plan
├── TEST_DOC.md               # <-- This file
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
            └── index.ts         # Shared schemas (placeholder)
```

---

## 3. D1 Schema (10 tables)

### `user` / `session` / `account` / `verification` — Better Auth tables

### `domain`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUIDv7 |
| name | TEXT UNIQUE | Domain name |
| status | TEXT | `pending` / `active` / `disabled` |
| mxVerified | BOOLEAN | DNS check result |
| cfZoneId | TEXT | Cloudflare zone ID |
| senderProvider | TEXT | `cf` (Cloudflare Email) |

### `mailbox`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUIDv7 |
| domainId | TEXT FK→domain | Cascade delete |
| localPart | TEXT | User part of email |
| address | TEXT UNIQUE | Full email address |
| displayName | TEXT | Optional display name |
| type | TEXT | `personal` / `group` / `service` |
| ownerId | TEXT FK→user | User who owns this |
| isActive | BOOLEAN | Soft enable/disable |
| deletedAt | TEXT | Soft delete timestamp |

### `thread`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUIDv7 |
| mailboxId | TEXT FK→mailbox | Parent mailbox |
| subject | TEXT | Thread subject |
| snippet | TEXT | First 200 chars |
| participants | TEXT | JSON array of addresses |
| messageCount | INTEGER | Message count |
| unreadCount | INTEGER | Unread messages |
| status | TEXT | `open` / `pending` / `resolved` / `closed` |
| priority | TEXT | `low` / `normal` / `high` / `urgent` |
| lastMessageAt | TEXT | ISO 8601 |
| deletedAt | TEXT | Soft delete |

### `message`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUIDv7 |
| mailboxId | TEXT FK→mailbox | Parent mailbox |
| threadId | TEXT FK→thread | Parent thread |
| messageId | TEXT | RFC 5322 Message-ID |
| inReplyTo | TEXT | Threading reference |
| references | TEXT | Space-separated IDs |
| fromAddress | TEXT | Sender email |
| fromName | TEXT | Sender name |
| toAddress | TEXT | Recipients |
| subject | TEXT | Subject line |
| bodyText | TEXT | Plain text body |
| bodyHtml | TEXT | HTML body |
| rawKey | TEXT | R2 key for raw .eml |
| isOutbound | BOOLEAN | Sent vs received |
| isRead | BOOLEAN | Read status |
| isSpam | BOOLEAN | Spam classification |
| sizeBytes | INTEGER | Raw size |
| receivedAt | TEXT | ISO 8601 |
| deletedAt | TEXT | Soft delete |

### `attachment`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUIDv7 |
| messageId | TEXT FK→message | Parent message |
| filename | TEXT | Sanitized filename |
| mimeType | TEXT | Content type |
| sizeBytes | INTEGER | File size |
| r2Key | TEXT | R2 key |
| contentId | TEXT | CID for inline |
| isInline | BOOLEAN | Inline attachment |

### `folder`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUIDv7 |
| mailboxId | TEXT FK→mailbox | Parent mailbox |
| name | TEXT | Display name |
| slug | TEXT | URL-safe slug |
| isSystem | BOOLEAN | System folder |
| sortOrder | INTEGER | Display order |

---

## 4. API Endpoints

All `/api/*` routes. Protected routes require `Authorization: Bearer <session_token>` or cookie-based session.

### Public
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| ALL | `/api/auth/*` | Better Auth handler (signin, signup, session, etc.) |

### Protected (require auth)
| Method | Path | Description | Query Params |
|--------|------|-------------|-------------|
| **Threads** |
| GET | `/api/threads` | List threads | `mailboxId` (req), `folder` (inbox/sent/trash), `cursor`, `limit` |
| GET | `/api/threads/:id` | Get thread detail | — |
| PATCH | `/api/threads/:id` | Update thread | — Body: `{ unreadCount?, status?, deletedAt?, priority? }` |
| DELETE | `/api/threads/:id` | Soft-delete thread | — |
| **Messages** |
| GET | `/api/threads/:threadId/messages` | List messages | `cursor`, `limit` |
| GET | `/api/messages/:id` | Get message (auto-mark read) | — |
| PATCH | `/api/messages/:id` | Update message | — Body: `{ isRead?, isSpam? }` |
| DELETE | `/api/messages/:id` | Soft-delete message | — |
| **Attachments** |
| GET | `/api/attachments/:id/download` | Stream from R2 | — |
| **Mailboxes** |
| GET | `/api/mailboxes` | List user's mailboxes | — |
| POST | `/api/mailboxes` | Create mailbox | — Body: `{ domainId, localPart, displayName?, type? }` |
| **Domains** |
| GET | `/api/domains` | List domains | — |
| POST | `/api/domains` | Add domain | — Body: `{ name }` |
| GET | `/api/domains/:id` | Get domain | — |
| DELETE | `/api/domains/:id` | Soft-delete domain | — |
| POST | `/api/domains/:id/check-dns` | Check MX/SPF/DKIM | — |
| POST | `/api/domains/:id/setup` | CF auto-config (6 steps) | — Requires `CLOUDFLARE_API_TOKEN` secret |
| **Send** |
| POST | `/api/send` | Send email | — Body: `{ mailboxId, to[], cc?, bcc?, subject, text?, html?, inReplyTo?, references? }` |
| POST | `/api/send/reply` | Reply to message | — Body: `{ messageId, mailboxId, text?, html? }` |
| POST | `/api/send/forward` | Forward message | — Body: `{ messageId, mailboxId, to[], text?, html? }` |
| **Search** |
| GET | `/api/search` | Search threads + messages | `q` (req, min 2 chars), `mailboxId` |
| **Auth** |
| GET | `/api/auth/me` | Current user | — |
| **Real-time** |
| GET | `/api/realtime/subscribe` | SSE stream | — (returns EventSource) |
| **Test** |
| POST | `/api/mail/test-receive` | Process raw email | — Body: raw email text |

---

## 5. Key Architecture Details

### Inbound Flow (`mail/receive.ts`)
1. `message.raw` → `ArrayBuffer` (single-use stream)
2. Extract domain from `message.to`
3. Lookup domain in D1 (must be active)
4. Store raw `.eml` to R2: `raw/{domain}/{year}/{month}/{messageId}.eml`
5. Parse with postal-mime (maxNestingDepth=50, maxHeadersSize=1MB)
6. Lookup mailbox (plus-addressing supported: `user+tag` → falls back to `user`)
7. Resolve thread via In-Reply-To/References (RFC 5322)
8. Process attachments with `Promise.allSettled` (25MB limit, oversized → skip)
9. Run `classifySpam()`: checks X-Spam-Status, X-Spam-Flag, SPF/DKIM auth results, numeric local-part
10. Insert message + thread + attachments to D1
11. Broadcast `new_message` to mailbox owner via DO SSE

### Outbound Flow (`mail/send.ts`)
1. Lookup mailbox + domain
2. Build MIME with `mimetext` (plain text + HTML + attachments)
3. Resolve thread (reuses `resolveThreadId`)
4. Store raw `.eml` to R2: `raw/{domainId}/sent/{messageId}.eml`
5. Insert message record (`isOutbound: true, isRead: true`)
6. Send via `env.EMAIL.send()` (Cloudflare Email Service)
7. If send fails: rollback (delete R2 + D1 record)
8. Update thread participants + lastMessageAt
9. Broadcast `message_sent` to mailbox owner via DO SSE

### Spam Detection (`receive.ts` — `classifySpam()`)
- X-Spam-Status header contains "yes" → +5
- X-Spam-Flag header is "yes" → +3
- SPF fail/softfail → +2
- DKIM fail → +2
- Numeric local-part (6+ digits) → +1
- Threshold: score ≥ 3 = spam

### Real-time SSE (`hub.ts`)
- One `UserHub` DO instance per user, keyed by `idFromName(user.id)`
- SSE via `ReadableStream` with 25s keepalive pings
- Events: `new_message`, `message_sent`, `thread_updated`, `unread_changed`, `ping`
- Browser connects to `/api/realtime/subscribe` → proxies to DO

### Domain Auto-config (`cloudflare.ts` + `domains.ts`)
6-step setup via Cloudflare API (requires `CLOUDFLARE_API_TOKEN`):
1. Look up zone by domain name
2. Add MX record → `mx.cloudflare.net` priority 10
3. Add SPF TXT record → `v=spf1 include:_spf.mx.cloudflare.net ~all`
4. Get DKIM records from Email Routing DNS settings → create DKIM TXT
5. Enable Email Routing for zone
6. Create catch-all route → send to this Worker

### Pagination
All list endpoints use keyset (cursor-based) pagination:
- `cursor` = ISO timestamp of last item's sort field
- `limit` = items per page (default 50, max 100)
- Response includes `nextCursor` (null if no more)

---

## 6. Worker Bindings (wrangler.jsonc)

| Binding | Type | Description |
|---------|------|-------------|
| `DB` | D1 | Metadata database |
| `BLOBS` | R2 | Raw emails + attachments |
| `EMAIL` | send_email | Cloudflare Email Service |
| `ASSETS` | assets | Astro static build output |
| `USER_HUB` | Durable Object | Per-user SSE hub |
| `BETTER_AUTH_SECRET` | secret | Better Auth encryption key |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare API token (for domain auto-config) |

### Required Secrets
```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put CLOUDFLARE_API_TOKEN
```

---

## 7. Test Plan

### Setup
```bash
# Install
bun install

# Start dev server (uses platformProxy for D1/R2)
bun run dev

# Or preview with wrangler
bun run preview
```

### Tests to Run

#### 7.1 Health & Auth
- [ ] `GET /api/health` → `{ status: "ok", timestamp: "..." }`
- [ ] `POST /api/auth/signup` → creates user, returns session
- [ ] `POST /api/auth/signin` → returns session
- [ ] `GET /api/auth/me` (with cookie) → returns user object
- [ ] `GET /api/auth/me` (no cookie) → 401

#### 7.2 Domain Management
- [ ] `POST /api/domains` with `{ name: "example.com" }` → 201, status "pending"
- [ ] `POST /api/domains` with duplicate → 409
- [ ] `POST /api/domains` with invalid name → 400
- [ ] `GET /api/domains` → list of domains
- [ ] `GET /api/domains/:id` → domain detail
- [ ] `DELETE /api/domains/:id` → soft-delete
- [ ] `POST /api/domains/:id/check-dns` → DNS check results
- [ ] `POST /api/domains/:id/setup` → CF auto-config (requires CLOUDFLARE_API_TOKEN)

#### 7.3 Mailbox Management
- [ ] `POST /api/mailboxes` with `{ domainId, localPart: "hello" }` → 201
- [ ] `POST /api/mailboxes` with existing address → 409
- [ ] `GET /api/mailboxes` → list user's mailboxes

#### 7.4 Inbound Email
- [ ] `POST /api/mail/test-receive` with raw email → 200
- [ ] Check thread created in D1
- [ ] Check message created in D1 with `isSpam` flag
- [ ] Check raw .eml stored in R2
- [ ] Check SSE event broadcast

#### 7.5 Threads & Messages
- [ ] `GET /api/threads?mailboxId=X` → list threads
- [ ] `GET /api/threads?mailboxId=X&cursor=...` → pagination
- [ ] `GET /api/threads/:id` → thread detail
- [ ] `PATCH /api/threads/:id` with `{ unreadCount: 0 }` → updated
- [ ] `DELETE /api/threads/:id` → soft-delete
- [ ] `GET /api/threads/:threadId/messages` → list messages
- [ ] `GET /api/messages/:id` → message detail (auto-marks read)
- [ ] `PATCH /api/messages/:id` with `{ isRead: false }` → updated
- [ ] `DELETE /api/messages/:id` → soft-delete

#### 7.6 Attachments
- [ ] `GET /api/attachments/:id/download` → streams file from R2
- [ ] `GET /api/attachments/:id/download` (not owner) → 401/403

#### 7.7 Outbound Send
- [ ] `POST /api/send` → sends email (requires CF Email Service)
- [ ] `POST /api/send/reply` → creates reply with threading headers
- [ ] `POST /api/send/forward` → creates forward with quoted content
- [ ] Check sent message appears in thread list
- [ ] Check raw .eml stored in R2

#### 7.8 Search
- [ ] `GET /api/search?q=hello` → matching threads + messages
- [ ] `GET /api/search?q=a` (too short) → empty results
- [ ] `GET /api/search?q=hello&mailboxId=X` → scoped to mailbox

#### 7.9 Real-time SSE
- [ ] `GET /api/realtime/subscribe` (with auth) → SSE stream
- [ ] Events received when new email arrives
- [ ] Events received when email is sent
- [ ] Connection closes on logout

#### 7.10 Spam Detection
- [ ] Email with `X-Spam-Status: Yes` → message marked `isSpam: true`
- [ ] Email with clean headers → message marked `isSpam: false`
- [ ] Email with SPF fail → `isSpam: true`
- [ ] Email from `123456789@spammer.com` → `isSpam: true`

#### 7.11 Frontend Pages
- [ ] `GET /` → landing page
- [ ] `GET /signin` → sign-in form
- [ ] `GET /signup` → sign-up form
- [ ] `GET /inbox` (not authenticated) → redirect to /signin
- [ ] `GET /inbox` (authenticated) → inbox shell
- [ ] `GET /domains` → domain management
- [ ] `GET /domains/new` → add domain form
- [ ] `GET /domains/:id` → domain detail with setup wizard
