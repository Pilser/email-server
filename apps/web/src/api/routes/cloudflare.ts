const CF_API_BASE = 'https://api.cloudflare.com/client/v4';
const DOH_URL = 'https://cloudflare-dns.com/dns-query';

async function dohQuery(domain: string, type: string): Promise<any> {
  const url = `${DOH_URL}?name=${encodeURIComponent(domain)}&type=${type}`;
  const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
  return res.json();
}

export async function cfFetch(
  path: string,
  apiToken: string,
  options?: { method?: string; body?: unknown }
): Promise<{ success: boolean; result: unknown; errors: unknown[] }> {
  const url = `${CF_API_BASE}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(url, {
    method: options?.method || 'GET',
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  return res.json();
}

export async function lookupZone(domain: string, apiToken: string): Promise<string | null> {
  const data = await cfFetch(`/zones?name=${encodeURIComponent(domain)}`, apiToken);
  if (data.success && (data.result as any[]).length > 0) {
    return (data.result as any[])[0].id;
  }
  return null;
}

export async function ensureMxRecord(zoneId: string, domain: string, apiToken: string): Promise<boolean> {
  const existing = await cfFetch(`/zones/${zoneId}/dns_records?type=MX&per_page=50`, apiToken);
  if (existing.success) {
    const records = existing.result as any[];
    if (records.some((r: any) => r.type === 'MX' && r.content?.includes('mx.cloudflare.net'))) {
      return true;
    }
  }
  const add = await cfFetch(`/zones/${zoneId}/dns_records`, apiToken, {
    method: 'POST',
    body: { type: 'MX', name: domain, content: 'mx.cloudflare.net', priority: 10, ttl: 120 },
  });
  return add.success;
}

export async function ensureSpfRecord(zoneId: string, apiToken: string): Promise<boolean> {
  const existing = await cfFetch(`/zones/${zoneId}/dns_records?type=TXT&per_page=50`, apiToken);
  if (existing.success) {
    const records = existing.result as any[];
    if (records.some((r: any) => r.content && typeof r.content === 'string' && r.content.startsWith('v=spf1'))) {
      return true;
    }
  }
  const add = await cfFetch(`/zones/${zoneId}/dns_records`, apiToken, {
    method: 'POST',
    body: { type: 'TXT', name: '@', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all', ttl: 120 },
  });
  return add.success;
}

export async function ensureDkimRecords(zoneId: string, apiToken: string): Promise<boolean> {
  const dnsSettings = await cfFetch(`/zones/${zoneId}/email/routing/dns`, apiToken);
  if (!dnsSettings.success) return false;
  const result = dnsSettings.result as any;
  const dkimRecords: { type: string; name: string; value: string }[] = result?.dkim || [];
  if (!Array.isArray(dkimRecords) || dkimRecords.length === 0) return true;
  const results = await Promise.allSettled(
    dkimRecords.map((rec) =>
      cfFetch(`/zones/${zoneId}/dns_records`, apiToken, {
        method: 'POST',
        body: { type: rec.type, name: rec.name, content: rec.value, ttl: 120 },
      })
    )
  );
  return results.every((r) => r.status === 'fulfilled' && r.value.success);
}

export async function enableEmailRouting(zoneId: string, apiToken: string): Promise<boolean> {
  const data = await cfFetch(`/zones/${zoneId}/email/routing/enable`, apiToken, { method: 'POST' });
  return data.success;
}

export async function ensureCatchAllRoute(zoneId: string, apiToken: string): Promise<boolean> {
  const data = await cfFetch(`/zones/${zoneId}/email/routing/rules`, apiToken, {
    method: 'POST',
    body: {
      actions: [{ type: 'forward', value: ['catch-all@placeholder.dev'] }],
      matchers: [{ type: 'all' }],
      enabled: true,
      name: 'Catch-all for email server',
    },
  });
  return data.success;
}

export async function checkMxViaDoh(domain: string): Promise<{ ok: boolean; records: string[] }> {
  const data = await dohQuery(domain, 'MX');
  if (data.Status !== 0 || !data.Answer) return { ok: false, records: [] };
  const records = data.Answer.filter((a: any) => a.type === 15).map((a: any) => a.data);
  const ok = records.some((r: string) => typeof r === 'string' && r.includes('mx.cloudflare.net'));
  return { ok, records };
}

export async function checkSpfViaDoh(domain: string): Promise<{ ok: boolean; record: string | null }> {
  const data = await dohQuery(domain, 'TXT');
  if (data.Status !== 0 || !data.Answer) return { ok: false, record: null };
  const txtRecords = data.Answer
    .filter((a: any) => a.type === 16)
    .map((a: any) => (typeof a.data === 'string' ? a.data.replace(/^"|"$/g, '') : ''));
  const spf = txtRecords.find((r: string) => r.startsWith('v=spf1'));
  if (!spf) return { ok: false, record: null };
  const ok = spf.includes('include:_spf.mx.cloudflare.net');
  return { ok, record: spf };
}

export async function checkDkimViaDoh(domain: string, selector = 'cloudflare'): Promise<{ ok: boolean; record: string | null }> {
  const dkimDomain = `${selector}._domainkey.${domain}`;
  const data = await dohQuery(dkimDomain, 'TXT');
  if (data.Status !== 0 || !data.Answer) return { ok: false, record: null };
  const txtRecords = data.Answer
    .filter((a: any) => a.type === 16)
    .map((a: any) => (typeof a.data === 'string' ? a.data.replace(/^"|"$/g, '') : ''));
  const dkim = txtRecords.find((r: string) => r.includes('v=DKIM1'));
  return { ok: !!dkim, record: dkim || null };
}
