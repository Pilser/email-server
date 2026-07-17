import { Hono } from 'hono';
import { z } from 'zod';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { sendFromMailbox } from '../../mail/send';
import { buildReplyQuote, buildForwardQuote } from '../../mail/quote';
import type { Variables } from '../auth-middleware';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const AddressSchema = z.object({
  name: z.string().optional(),
  address: z.string().email(),
});

const SendBodySchema = z.object({
  mailboxId: z.string(),
  to: z.array(AddressSchema).min(1),
  cc: z.array(AddressSchema).optional(),
  bcc: z.array(AddressSchema).optional(),
  subject: z.string(),
  text: z.string().optional(),
  html: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
});

const ReplyBodySchema = z.object({
  messageId: z.string(),
  mailboxId: z.string(),
  text: z.string().optional(),
  html: z.string().optional(),
});

const ForwardBodySchema = z.object({
  messageId: z.string(),
  mailboxId: z.string(),
  to: z.array(AddressSchema).min(1),
  text: z.string().optional(),
  html: z.string().optional(),
});

async function lookupMessage(c: any, messageId: string) {
  const db = drizzle(c.env.DB);
  const [row] = await db
    .select()
    .from(schema.message)
    .where(eq(schema.message.id, messageId))
    .limit(1);
  return row;
}

router.post('/', async (c) => {
  const body = await c.req.json();
  const parsed = SendBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { mailboxId, to, cc, bcc, subject, text, html, inReplyTo, references } = parsed.data;

  try {
    const result = await sendFromMailbox(c.env, {
      mailboxId,
      to,
      cc,
      bcc,
      subject,
      text,
      html,
      inReplyTo,
      references,
    });
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    return c.json({ error: message }, 502);
  }
});

router.post('/reply', async (c) => {
  const body = await c.req.json();
  const parsed = ReplyBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { messageId, mailboxId, text, html } = parsed.data;
  const orig = await lookupMessage(c, messageId);
  if (!orig) return c.json({ error: 'Original message not found' }, 404);

  const subject = orig.subject ? `Re: ${orig.subject.replace(/^(Re:\s*)+/i, '')}` : 'Re: ';
  const quote = buildReplyQuote({
    fromAddress: orig.fromAddress,
    fromName: orig.fromName,
    receivedAt: orig.receivedAt,
    bodyText: orig.bodyText,
    bodyHtml: orig.bodyHtml,
  });

  try {
    const result = await sendFromMailbox(c.env, {
      mailboxId,
      to: [{ address: orig.fromAddress, name: orig.fromName ?? undefined }],
      subject,
      text,
      html,
      inReplyTo: orig.messageId || undefined,
      references: orig.references || orig.messageId || undefined,
      quote,
    });
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    return c.json({ error: message }, 502);
  }
});

router.post('/forward', async (c) => {
  const body = await c.req.json();
  const parsed = ForwardBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.issues }, 400);
  }

  const { messageId: origId, mailboxId, to, text, html } = parsed.data;
  const orig = await lookupMessage(c, origId);
  if (!orig) return c.json({ error: 'Original message not found' }, 404);

  const quote = buildForwardQuote({
    subject: orig.subject || '(no subject)',
    bodyText: orig.bodyText,
    bodyHtml: orig.bodyHtml,
  });

  try {
    const result = await sendFromMailbox(c.env, {
      mailboxId,
      to,
      subject: quote.subject,
      text: text ? `${text}\n\n${quote.text}` : quote.text,
      html: html ? `${html}\n${quote.html}` : quote.html,
    });
    return c.json(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    return c.json({ error: message }, 502);
  }
});

export default router;
