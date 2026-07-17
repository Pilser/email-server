# Full-Stack Email Server — Architecture Plan (v2)

*Based on study of 6 reference repos cloned to `./repos/`*

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Astro + React + Shadcn UI + Tailwind v4 | SSR + islands, Cloudflare-native adapter |
| **Backend** | Hono (mounted inside Astro middleware) | Lightweight, CF-native, used by all email projects |
| **Database** | D1 + Drizzle ORM | Edge SQLite, type-safe, migration support |
| **Storage** | R2 | Zero egress, raw .eml + attachments |
| **Inbound** | Cloudflare Email Routing → Worker `email()` handler | Free MX, catch-all per domain |
| **Outbound** | Cloudflare Email Service (`env.EMAIL.send()`) + Resend fallback | Per-domain provider choice |
| **Real-time** | Durable Objects (SSE per-user fan-out) | Pattern from cloudflare-mail, flamemail |
| **Auth** | Better Auth on D1 | Used by cf-monolith-kit and cloudflare-mail |
| **MIME parse** | postal-mime (zero deps, CF-native) | Standard across ALL studied repos |
| **MIME build** | mimetext | Outbound MIME construction |
| **Async** | Cloudflare Queues (optional) | For downstream processing |

## Architecture — Two Options

### Option A: Single Worker (used by cloudflare-mail, AgentMail, flamemail)

```
┌──────────────────────────────────────────────────────┐
│  One Worker: fetch() + email() + scheduled() + DO   │
│                                                      │
│  fetch() → Hono API + Astro SSR or Vite SPA assets  │
│  email() → postal-mime → R2 → D1 → notify via DO    │
│  scheduled() → cron cleanup (temp mail, retention)   │
│  Durable Object → SSE per-user real-time             │
└──────────────────────────────────────────────────────┘
        │                      │
        ▼                      ▼
      D1 (meta)             R2 (blobs)
```

**Used by:** cloudflare-mail, AgentMail, flamemail, mailflare
**Pros:** Simpler deploy, shared DO for real-time, one wrangler config
**Cons:** May conflict with Email Routing visibility in some CF configurations

### Option B: Two Workers (recommended by @rafters/mail docs)

```
┌──────────────────┐    ┌──────────────────┐
│  inbox-worker    │    │  api-worker      │
│  email() only    │    │  fetch() only    │
│  postal-mime     │    │  Astro + Hono    │
│  R2 + D1 writes  │    │  D1 reads/writes │
│  DO notification │    │  R2 reads        │
└────────┬─────────┘    │  Outbound send   │
         │              │  Auth            │
         │              └────────┬─────────┘
         ▼                       ▼
      ┌─────────────────────────────┐
      │   D1 + R2 (shared)         │
      └─────────────────────────────┘
```

**Pros:** Guaranteed Email Routing visibility, clean separation
**Cons:** Two wrangler configs, slightly more infrastructure

**Note on the constraint:** Both cloudflare-mail and AgentMail use a single Worker with both `fetch()` and `email()` exports successfully. The constraint may be outdated or specific to certain CF account tiers. Start with Option A, fall back to Option B if Email Routing won't list the worker.

## Multi-Domain Design

### Pattern from cloudflare-mail (most mature multi-domain implementation)

```
Tables:
  domain         — id, name, allowedKinds (bitfield), spfOk, dkimOk, dmarcOk
  domain_grant   — per-user permission to create mailboxes on a domain
  mailbox        — id, domain_id, local_part, type (personal/group/service/temp)
  redirect       — inbound alias, supports "*" catch-all per domain

Inbound Resolution (cloudflare-mail receive.ts):
  1. message.to → split at "@" → localPart + domainName
  2. Plus-address: "user+tag" → baseLocal = "user"
  3. Lookup domain row; reject if not routed
  4. Lookup mailbox by (domainId, baseLocal)
  5. Fallback to redirects: exact match → "*" catch-all
  6. Reject if no mailbox found
```

### Pattern from AgentMail (auto-config via Cloudflare API)

```
Auto-configuration steps (per domain click in UI):
  1. ensureMx()     → Create/verify Cloudflare MX records
  2. ensureSpf()    → Add SPF include:_spf.mx.cloudflare.net
  3. ensureDkim()   → Pull DKIM from CF Email Routing, create TXT
  4. ensureRoutingEnabled() → Enable CF Email Routing for zone
  5. ensureCatchAll() → Route catch-all to the Worker

AgentMail API endpoints:
  GET  /api/cloudflare/status          — check CF token
  GET  /api/cloudflare/zones           — list zones with MX detection
  POST /api/cloudflare/zones/:id/setup — run 5-step auto-config
  POST /api/domains/:id/verify         — verify MX via DNS-over-HTTPS
```

### R2 Key Patterns (compared)

| Project | Raw email | Attachments |
|---------|-----------|-------------|
| cloudflare-mail | `raw/${mailboxId}/${uuid}.eml` | `att/${messageId}/${idx}-${name}` |
| AgentMail | `raw/${messageId}.eml` | `attachments/${messageId}/${attId}/${filename}` |
| email-to-r2 | `{prefix}/${YYYY}/${MM}/${DD}/${slug}/metadata.json` | `.../attachments/${idx}-${filename}` |
| rafters-mail | `emails/${year}/${month}/${contentHash}.eml` | R2 key from message blob |
| **Our plan** | `raw/{domain}/{year}/{month}/{messageId}.eml` | `attachments/{domain}/{messageId}/{idx}-{filename}` |

## Data Model (D1 — consolidated from all references)

```sql
-- Domains
CREATE TABLE domains (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',      -- pending | active | disabled
  mx_verified INTEGER DEFAULT 0,
  cf_zone_id TEXT,
  cf_setup_status TEXT,               -- dns_created | routing_enabled | complete
  sender_provider TEXT,               -- cloudflare | resend
  allowed_kinds INTEGER DEFAULT 0,    -- bitfield: personal, group, service, temp
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE domain_grants (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  user_id TEXT NOT NULL,
  allowed_kinds INTEGER NOT NULL       -- bitfield of mailbox kinds allowed
);

-- Mailboxes
CREATE TABLE mailboxes (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL REFERENCES domains(id),
  local_part TEXT NOT NULL,
  address TEXT UNIQUE NOT NULL,        -- local_part@domain
  display_name TEXT,
  mailbox_type TEXT NOT NULL DEFAULT 'personal',  -- personal | group | service | temp
  owner_id TEXT,
  is_active INTEGER DEFAULT 1,
  pgp_mode TEXT DEFAULT 'off',         -- off | sign | sign_encrypt
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(domain_id, local_part)
);

-- Mailbox members (for group/shared mailboxes)
CREATE TABLE mailbox_members (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  user_id TEXT NOT NULL,
  perms INTEGER NOT NULL DEFAULT 1,    -- bitfield: READ=1, WRITE=2, MANAGE=4
  UNIQUE(mailbox_id, user_id)
);

-- Threads
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  subject TEXT NOT NULL,
  snippet TEXT,
  participants TEXT,                    -- JSON array of email addresses
  message_count INTEGER DEFAULT 1,
  unread_count INTEGER DEFAULT 1,
  folder_id TEXT,
  status TEXT DEFAULT 'open',          -- open | pending | resolved | closed
  priority TEXT DEFAULT 'normal',      -- low | normal | high | urgent
  started_at TEXT NOT NULL,
  last_message_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  message_id TEXT,                     -- RFC 5322 Message-ID
  in_reply_to TEXT,                    -- RFC 5322 In-Reply-To
  references TEXT,                     -- RFC 5322 References (space-separated)
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_address TEXT NOT NULL,
  cc_addresses TEXT,                   -- JSON array
  bcc_addresses TEXT,                  -- JSON array
  reply_to TEXT,
  subject TEXT NOT NULL,
  snippet TEXT,
  body_text TEXT,                      -- plain text body (stripped, truncated to ~64KB)
  body_html TEXT,                      -- HTML body (truncated)
  raw_key TEXT NOT NULL,               -- R2 key for raw .eml
  is_outbound INTEGER DEFAULT 0,
  is_read INTEGER DEFAULT 0,
  is_starred INTEGER DEFAULT 0,
  is_spam INTEGER DEFAULT 0,
  size_bytes INTEGER DEFAULT 0,
  attachment_count INTEGER DEFAULT 0,
  received_at TEXT NOT NULL,
  sent_at TEXT,
  deleted_at TEXT
);

-- Attachments
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  content_id TEXT,                     -- for inline attachments (CID)
  is_inline INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Labels
CREATE TABLE labels (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT REFERENCES mailboxes(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT,
  is_system INTEGER DEFAULT 0,
  is_ai_generated INTEGER DEFAULT 0,
  UNIQUE(mailbox_id, slug)
);

CREATE TABLE message_labels (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id),
  label_id TEXT NOT NULL REFERENCES labels(id),
  UNIQUE(message_id, label_id)
);

-- Folders (system + custom)
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  mailbox_id TEXT NOT NULL REFERENCES mailboxes(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_system INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(mailbox_id, slug)
);
```

## MIME Parsing Pipeline (Consolidated from all projects)

```typescript
import PostalMime from 'postal-mime';

async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
  // 1. Read raw stream once (single-use)
  const rawBuffer = await new Response(message.raw).arrayBuffer();

  // 2. Parse with postal-mime (security limits built-in)
  const parsed = await PostalMime.parse(rawBuffer, {
    attachmentEncoding: 'arraybuffer',
    maxNestingDepth: 50,
    maxHeadersSize: 1_048_576,  // 1MB
  });

  // 3. Extract envelope info
  const [localPart, domain] = message.to.split('@');

  // 4. Store raw .eml to R2 FIRST (source of truth)
  const rawKey = `raw/${domain}/${messageId}.eml`;
  await env.BUCKET.put(rawKey, rawBuffer);

  // 5. Process attachments with size limits + error isolation
  const attachmentResults = await Promise.allSettled(
    parsed.attachments.map((att, idx) =>
      storeAttachment(env, messageId, idx, att)
    )
  );

  // 6. Insert metadata to D1 (never raw content — 1MB row limit)
  await env.DB.prepare(`
    INSERT INTO messages (...) VALUES (...)
  `).bind(...).run();

  // 7. Defer non-critical work (AI, notifications, forwarding)
  ctx.waitUntil(doBackgroundWork(env, parsed));
}

async function storeAttachment(env, messageId, idx, att) {
  const MAX_BYTES = 25 * 1024 * 1024;
  if (att.content.byteLength > MAX_BYTES) {
    // Record as oversized, skip upload
    return { filename: att.filename, oversized: true };
  }
  const key = `attachments/${messageId}/${String(idx).padStart(2, '0')}-${sanitizeFilename(att.filename)}`;
  await env.BUCKET.put(key, att.content);
  return { filename: att.filename, r2Key: key, size: att.content.byteLength };
}
```

### Memory optimization notes:
- `message.raw` is a single-use `ReadableStream` — buffer once to `ArrayBuffer`
- postal-mime is **zero-dependency** and works natively in Workers
- D1 row limit is **1MB** — never store raw email content in D1
- Use `Promise.allSettled` for attachments so one failure doesn't block others
- Set `maxNestingDepth` and `maxHeadersSize` as security limits
- For truly large emails (>25MB), consider `FixedLengthStream` to R2

## Threading Logic (RFC 5322 — from @rafters/mail)

```typescript
import { uuidv7 } from 'uuidv7';

function generateMessageId(domain: string): string {
  return `<${uuidv7()}@${domain}>`;
}

function buildReferences(existingReferences: string | null, inReplyTo: string | null): string | null {
  if (!existingReferences && !inReplyTo) return null;
  const refs = existingReferences ? existingReferences.trim().split(/\s+/) : [];
  if (inReplyTo) {
    const trimmed = inReplyTo.trim();
    if (trimmed && !refs.includes(trimmed)) refs.push(trimmed);
  }
  const capped = refs.length > 50 ? refs.slice(-50) : refs;
  return capped.length > 0 ? capped.join(' ') : null;
}

// Thread matching priority:
// 1. Match In-Reply-To against existing message.message_id
// 2. Walk References header if no match
// 3. Create new thread
```

## Real-time Updates (SSE via Durable Objects)

**Pattern from cloudflare-mail (`UserHub` DO):**
- One DO instance per user, keyed by `USER_HUB.idFromName(userId)`
- SSE via `ReadableStream` with 25s keepalive pings
- Events: `new_message`, `message_sent`, `thread_updated`, `thread_read`

```
Browser ← SSE ← DO (UserHub per user) ← POST /broadcast ← email handler
```

## Repo Study Findings Summary

| Repo | Architecture | Multi-Domain | MIME | Real-time | Outbound | Key Takeaway |
|------|-------------|--------------|------|-----------|----------|--------------|
| **cf-monolith-kit** | Astro + Hono + Drizzle + D1 | N/A | N/A | N/A | Better Auth | **Best Astro template** — middleware routes `/api/*` to Hono |
| **cloudflare-mail** | Single Worker + fetch+email+scheduled+DO | Domain table + grants + DNS checks | postal-mime + mimetext | SSE per-user DO | CF Email Service | **Most complete reference** — 30 tables, spam, PGP, AI, RBAC |
| **AgentMail** | Single Worker + fetch+email+scheduled | CF API auto-config (5 steps) | postal-mime | N/A | Resend + CF Email | **Best domain auto-config** — MX/SPF/DKIM/routing via API |
| **rafters-mail** | Modular lib (core/drizzle/cloudflare) | Via schema (mailbox domain_id) | postal-mime (in @rafters/mail-cloudflare) | Via interfaces | Resend adapter | **Best source for schema + threading** — Zod schemas, RFC 5322 threading |
| **mailflare** | Next.js/OpenNext + Single Worker | CF API-driven domain management | postal-mime | WebSocket DO | CF Email Service | Most popular (364★) — Next.js approach, heavy |
| **email-to-r2** | Email-only Worker + Queue | N/A | postal-mime | Via Queue | Forward only | **Best reference for MIME→R2 pipeline** — attachment error handling, sanitization |

## Key Architectural Decisions

1. **Monolith or separate Workers?** Start single Worker (Option A). The constraint about Email Routing not listing Workers with `fetch()` is contradicted by cloudflare-mail and AgentMail both working with multi-handler Workers.

2. **Domain auto-config or manual?** Build the AgentMail pattern (Cloudflare API auto-config) — it's the only scalable multi-domain approach. Store CF API token as a secret, use `cfFetch()` helper.

3. **D1 schema:** Use `uuidv7` for sortable primary keys (rafters-mail pattern). Soft deletes via `deleted_at` on all tables.

4. **R2 key scheme:** `raw/{domain}/{year}/{month}/{messageId}.eml` + `attachments/{domain}/{messageId}/{idx}-{filename}` with date partitioning for easy lifecycle management.

5. **Frontend approach:** Use the cf-monolith-kit pattern (Astro middleware → Hono) rather than a separate SPA. This gives us SSR for SEO and SPA-like behavior for the email client.

6. **Outbound sender provider:** Per-domain choice (cloudflare or resend) — AgentMail pattern. Cloudflare Email Service for Workers Paid, Resend fallback for Workers Free.

## Implementation Phases (Proposed)

1. **Foundation:** Astro + Hono + D1 + Drizzle — based on cf-monolith-kit
2. **Data model:** Schema with domains, mailboxes, threads, messages, attachments
3. **Email receiver:** Inbound Worker with postal-mime, R2 storage, D1 metadata
4. **Multi-domain admin:** Domain management UI + Cloudflare API auto-config
5. **Frontend inbox:** List threads, read messages, folder navigation
6. **Outbound send:** Compose/reply MIME builder, send via EMAIL.send() or Resend
7. **Real-time:** Durable Object SSE for live updates
8. **Spam/AI/Polish:** Optional enhancements
