export function buildReplyQuote(original: {
  fromAddress: string;
  fromName?: string | null;
  receivedAt: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
}): { text: string; html: string } {
  const date = new Date(original.receivedAt).toLocaleString();
  const from = original.fromName || original.fromAddress;
  const header = `On ${date}, ${from} wrote:`;
  const text = `${header}\n> ${(original.bodyText || '').replace(/\n/g, '\n> ')}`;
  const html = `<p>${header}</p><blockquote style="border-left:2px solid #ccc;padding-left:8px;margin-left:0">${original.bodyHtml || original.bodyText || ''}</blockquote>`;
  return { text, html };
}

export function buildForwardQuote(original: {
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
}): { subject: string; text: string; html: string } {
  const subject = `Fwd: ${original.subject.replace(/^(Fwd:\s*)+/i, '')}`;
  const text = `-------- Forwarded message --------\nSubject: ${original.subject}\n\n${original.bodyText || ''}`;
  const html = `<div><strong>Forwarded message</strong><br>Subject: ${original.subject}</div><br>${original.bodyHtml || ''}`;
  return { subject, text, html };
}
