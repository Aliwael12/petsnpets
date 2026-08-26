import type { ActivityEntry, Employee } from '../types';
import { Badge, EmployeeTag, EmptyState, formatCurrency, formatDateTime } from './ui';

const typeLabels: Record<ActivityEntry['type'], string> = {
  sale: 'Sale',
  refund: 'Refund',
  'pet-log': 'Pet log',
  'supplier-order': 'Shipment',
  discount: 'Discount',
};

export function ActivityFeed({
  entries,
  employees,
  emptyTitle = 'No activity yet',
}: {
  entries: ActivityEntry[];
  employees: Employee[];
  emptyTitle?: string;
}) {
  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? 'Unknown';

  if (entries.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="divide-y divide-slate-100">
      {entries.map((entry) => (
        <div key={entry.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Badge tone={entry.type}>{typeLabels[entry.type]}</Badge>
              <p className="text-sm font-medium text-navy-950">{entry.title}</p>
            </div>
            {entry.detail && <p className="truncate text-xs text-slate-400">{entry.detail}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {entry.amount !== undefined && (
              <p className="text-sm font-semibold text-navy-950">{formatCurrency(entry.amount)}</p>
            )}
            <div className="flex items-center gap-2">
              <EmployeeTag name={employeeName(entry.actorId)} />
              <span className="text-xs text-slate-400">{formatDateTime(entry.at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
