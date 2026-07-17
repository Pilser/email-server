import { cn } from '../lib/utils';

type Status = 'active' | 'pending' | 'disabled' | string;

export default function DomainStatusBadge({ status }: { status: Status }) {
  const colorMap: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    disabled: 'bg-red-100 text-red-800',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorMap[status] || 'bg-gray-100 text-gray-800',
      )}
    >
      {status}
    </span>
  );
}
