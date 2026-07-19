import { useState } from 'react';
import DomainStatusBadge from './DomainStatusBadge';

interface Step {
  step: string;
  ok: boolean;
  message: string;
}

interface DnsResult {
  mx: { ok: boolean; records: string[] };
  spf: { ok: boolean; record: string | null };
  dkim: { ok: boolean; record: string | null };
}

export default function SetupWizard({
  domainId,
  domainStatus,
}: {
  domainId: string;
  domainStatus: string;
}) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [dnsResult, setDnsResult] = useState<DnsResult | null>(null);
  const [checkingDns, setCheckingDns] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckDns() {
    setCheckingDns(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/domains/${domainId}/check-dns`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to check DNS');
        return;
      }
      const data = await res.json();
      setDnsResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setCheckingDns(false);
    }
  }

  async function handleSetup() {
    setRunning(true);
    setSteps([]);
    setError(null);
    try {
      const res = await fetch(`/api/admin/domains/${domainId}/setup`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Setup failed');
        setRunning(false);
        return;
      }
      const data = await res.json();
      setSteps(data.steps || []);
      if (data.success) {
        window.location.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div class="space-y-6">
      {error && (
        <div class="rounded-md bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div class="flex gap-4">
        <button
          type="button"
          onClick={handleCheckDns}
          disabled={checkingDns}
          class="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {checkingDns ? 'Checking...' : 'Check DNS'}
        </button>

        {domainStatus === 'pending' && (
          <button
            type="button"
            onClick={handleSetup}
            disabled={running}
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? 'Running...' : 'Run Setup'}
          </button>
        )}
      </div>

      {dnsResult && (
        <div class="rounded-lg border border-gray-200 p-4">
          <h3 class="mb-3 text-sm font-semibold text-gray-900">
            DNS Check Results
          </h3>
          <div class="space-y-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full" classList={{
                'bg-green-500': dnsResult.mx.ok,
                'bg-red-500': !dnsResult.mx.ok,
              }} />
              <span class="text-gray-700">MX:</span>
              <span class={dnsResult.mx.ok ? 'text-green-700' : 'text-red-700'}>
                {dnsResult.mx.ok ? 'OK' : 'Missing'}
              </span>
              {dnsResult.mx.records.length > 0 && (
                <span class="text-gray-500">
                  ({dnsResult.mx.records.join(', ')})
                </span>
              )}
            </div>
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full" classList={{
                'bg-green-500': dnsResult.spf.ok,
                'bg-red-500': !dnsResult.spf.ok,
              }} />
              <span class="text-gray-700">SPF:</span>
              <span class={dnsResult.spf.ok ? 'text-green-700' : 'text-red-700'}>
                {dnsResult.spf.ok ? 'OK' : 'Missing'}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full" classList={{
                'bg-green-500': dnsResult.dkim.ok,
                'bg-red-500': !dnsResult.dkim.ok,
              }} />
              <span class="text-gray-700">DKIM:</span>
              <span class={dnsResult.dkim.ok ? 'text-green-700' : 'text-red-700'}>
                {dnsResult.dkim.ok ? 'OK' : 'Missing'}
              </span>
            </div>
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div class="rounded-lg border border-gray-200 p-4">
          <h3 class="mb-3 text-sm font-semibold text-gray-900">
            Setup Progress
          </h3>
          <div class="space-y-2">
            {steps.map((s, i) => (
              <div key={i} class="flex items-center gap-2 text-sm">
                <span
                  class={`text-lg ${s.ok ? 'text-green-600' : 'text-red-600'}`}
                >
                  {s.ok ? '\u2713' : '\u2717'}
                </span>
                <span class="font-medium text-gray-700">
                  {stepLabel(s.step)}:
                </span>
                <span class={s.ok ? 'text-gray-600' : 'text-red-600'}>
                  {s.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function stepLabel(step: string): string {
  const labels: Record<string, string> = {
    'lookup-zone': 'Lookup Zone',
    'add-mx': 'MX Record',
    'add-spf': 'SPF Record',
    'add-dkim': 'DKIM Records',
    'enable-routing': 'Enable Routing',
    'catch-all': 'Catch-All Route',
    error: 'Error',
  };
  return labels[step] || step;
}
