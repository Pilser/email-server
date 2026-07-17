import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import * as schema from '../db/schema';

export function generateMessageId(domain: string): string {
  return `<${crypto.randomUUID()}@${domain}>`;
}

export function buildReferences(
  existingReferences: string | null,
  inReplyTo: string | null,
): string | null {
  if (!existingReferences && !inReplyTo) return null;
  const refs = existingReferences ? existingReferences.trim().split(/\s+/) : [];
  if (inReplyTo) {
    const trimmed = inReplyTo.trim();
    if (trimmed && !refs.includes(trimmed)) {
      refs.push(trimmed);
    }
  }
  const capped = refs.length > 50 ? refs.slice(-50) : refs;
  return capped.length > 0 ? capped.join(' ') : null;
}

export function generateSnippet(body: string | undefined | null, maxLength = 200): string {
  if (!body) return '';
  return body.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export async function resolveThreadId(
  db: ReturnType<typeof drizzle<typeof schema>>,
  mailboxId: string,
  inReplyTo: string | null | undefined,
  references: string | null | undefined,
): Promise<string> {
  if (inReplyTo) {
    const cleaned = inReplyTo.trim();
    if (cleaned) {
      const result = await db
        .select({ threadId: schema.message.threadId })
        .from(schema.message)
        .where(
          and(
            eq(schema.message.messageId, cleaned),
            eq(schema.message.mailboxId, mailboxId),
          ),
        )
        .limit(1);
      if (result.length > 0) return result[0].threadId;
    }
  }
  if (references) {
    const refList = references.trim().split(/\s+/).filter(Boolean);
    for (let i = refList.length - 1; i >= 0; i--) {
      const result = await db
        .select({ threadId: schema.message.threadId })
        .from(schema.message)
        .where(
          and(
            eq(schema.message.messageId, refList[i]),
            eq(schema.message.mailboxId, mailboxId),
          ),
        )
        .limit(1);
      if (result.length > 0) return result[0].threadId;
    }
  }
  return crypto.randomUUID();
}

export type ThreadDb = ReturnType<typeof drizzle<typeof schema>>;
