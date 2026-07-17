import { z } from 'zod';
import { MailboxType, ThreadStatus, ThreadPriority } from './permissions';

export const domainCreateSchema = z.object({
  name: z.string().min(1).max(255),
  senderProvider: z.enum(['cf', 'smtp']).default('cf'),
});

export const domainUpdateSchema = z.object({
  status: z.string().optional(),
  mxVerified: z.boolean().optional(),
  cfZoneId: z.string().optional(),
  senderProvider: z.enum(['cf', 'smtp']).optional(),
});

export const mailboxCreateSchema = z.object({
  domainId: z.string().min(1),
  localPart: z.string().min(1).max(64),
  displayName: z.string().max(255).optional(),
  type: z.nativeEnum(MailboxType).default(MailboxType.Personal),
  ownerId: z.string().optional(),
});

export const mailboxUpdateSchema = z.object({
  displayName: z.string().max(255).optional(),
  type: z.nativeEnum(MailboxType).optional(),
  isActive: z.boolean().optional(),
});

export const messageResponseSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  messageId: z.string().nullable(),
  fromAddress: z.string(),
  fromName: z.string().nullable(),
  toAddress: z.string(),
  subject: z.string().nullable(),
  bodyText: z.string().nullable(),
  bodyHtml: z.string().nullable(),
  isOutbound: z.boolean(),
  isRead: z.boolean(),
  isSpam: z.boolean(),
  sizeBytes: z.number(),
  receivedAt: z.string(),
  attachments: z.array(z.object({
    id: z.string(),
    filename: z.string().nullable(),
    mimeType: z.string().nullable(),
    sizeBytes: z.number(),
    isInline: z.boolean(),
  })).optional(),
});

export const threadResponseSchema = z.object({
  id: z.string(),
  mailboxId: z.string(),
  subject: z.string().nullable(),
  snippet: z.string().nullable(),
  participants: z.array(z.string()).nullable(),
  messageCount: z.number(),
  unreadCount: z.number(),
  status: z.nativeEnum(ThreadStatus),
  priority: z.nativeEnum(ThreadPriority),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});
