import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';

function id() {
  return text('id').primaryKey();
}

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () => timestamp('created_at').notNull().default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`);
const updatedAt = () => timestamp('updated_at').notNull().default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`);

function booleanCol(name: string) {
  return integer(name, { mode: 'boolean' });
}

// ── Better Auth tables ──────────────────────────────────────────

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: booleanCol('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: booleanCol('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Domain ──────────────────────────────────────────────────────

export const domain = sqliteTable('domain', {
  id: id(),
  name: text('name').notNull().unique(),
  status: text('status').notNull().default('active'),
  mxVerified: booleanCol('mx_verified').notNull().default(false),
  cfZoneId: text('cf_zone_id'),
  senderProvider: text('sender_provider').notNull().default('cf'),
  createdAt: createdAt(),
});

// ── Mailbox ─────────────────────────────────────────────────────

export const mailbox = sqliteTable(
  'mailbox',
  {
    id: id(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domain.id, { onDelete: 'cascade' }),
    localPart: text('local_part').notNull(),
    address: text('address').notNull().unique(),
    displayName: text('display_name'),
    type: text('type').notNull().default('personal'),
    ownerId: text('owner_id').references(() => user.id),
    isActive: booleanCol('is_active').notNull().default(true),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    domainIdx: index('idx_mailbox_domain').on(table.domainId),
    activeDomainIdx: index('idx_mailbox_active_domain').on(
      table.isActive,
      table.domainId,
    ),
  }),
);

// ── Thread ──────────────────────────────────────────────────────

export const thread = sqliteTable(
  'thread',
  {
    id: id(),
    mailboxId: text('mailbox_id').notNull().references(() => mailbox.id),
    subject: text('subject'),
    snippet: text('snippet'),
    participants: text('participants'),
    messageCount: integer('message_count').notNull().default(0),
    unreadCount: integer('unread_count').notNull().default(0),
    status: text('status').notNull().default('open'),
    priority: text('priority').notNull().default('normal'),
    lastMessageAt: timestamp('last_message_at'),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    mailboxLastMsgIdx: index('idx_thread_mailbox_lastmsg').on(
      table.mailboxId,
      table.lastMessageAt,
    ),
  }),
);

// ── Message ─────────────────────────────────────────────────────

export const message = sqliteTable(
  'message',
  {
    id: id(),
    mailboxId: text('mailbox_id').notNull().references(() => mailbox.id),
    threadId: text('thread_id').notNull().references(() => thread.id),
    messageId: text('message_id'),
    inReplyTo: text('in_reply_to'),
    references: text('references'),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    toAddress: text('to_address').notNull(),
    subject: text('subject'),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    rawKey: text('raw_key'),
    isOutbound: booleanCol('is_outbound').notNull().default(false),
    isRead: booleanCol('is_read').notNull().default(false),
    isSpam: booleanCol('is_spam').notNull().default(false),
    sizeBytes: integer('size_bytes').notNull().default(0),
    receivedAt: timestamp('received_at').notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => ({
    messageIdIdx: uniqueIndex('idx_message_message_id').on(table.messageId),
    mailboxReceivedIdx: index('idx_message_mailbox_received').on(
      table.mailboxId,
      table.receivedAt,
    ),
    threadIdx: index('idx_message_thread').on(table.threadId),
  }),
);

// ── Attachment ──────────────────────────────────────────────────

export const attachment = sqliteTable('attachment', {
  id: id(),
  messageId: text('message_id').notNull().references(() => message.id),
  filename: text('filename'),
  mimeType: text('mime_type'),
  sizeBytes: integer('size_bytes').notNull().default(0),
  r2Key: text('r2_key'),
  contentId: text('content_id'),
  isInline: booleanCol('is_inline').notNull().default(false),
  createdAt: createdAt(),
});

// ── Folder ──────────────────────────────────────────────────────

export const folder = sqliteTable('folder', {
  id: id(),
  mailboxId: text('mailbox_id').notNull().references(() => mailbox.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  isSystem: booleanCol('is_system').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ── Helper ──────────────────────────────────────────────────────

export function createDb(d1: D1Database): DrizzleD1Database {
  return drizzle(d1);
}
