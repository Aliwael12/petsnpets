import { useFinancialSummary } from '../api/analytics';
import { useSupplierBalances } from '../api/purchasing';
import { todayKey } from '../lib/timezone';
import { StatTile, formatCurrency } from './ui';

/** Rows read straight off supplier-balances, highest debt first, so the owner sees who to
 *  pay down soonest without having to scan a whole table. */
function SupplierBreakdownRows({ balances }: { balances: { supplierId: string; supplierName: string; owed: number }[] }) {
  if (balances.length === 0) {
    return <p className="mt-3 border-t border-black/5 pt-3 text-xs text-slate-400">Nothing owed to any supplier</p>;
  }
  return (
    <dl className="mt-3 flex max-h-40 flex-col gap-1 overflow-y-auto border-t border-black/5 pt-3 text-xs">
      {balances.map((b) => (
        <div key={b.supplierId} className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">{b.supplierName}</dt>
          <dd className="font-medium tabular-nums text-slate-700">{formatCurrency(b.owed)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
      ))}
    </div>
  );
}

/**
 * The clinic's money at a glance, from the two angles the owner actually checks day to day:
 * what's owed out to suppliers (a live balance, not tied to any date range — see
 * PurchasingService.supplierBalances()), and what's come in from sales today and this month.
 * Money in / out still has the full date-range breakdown; this is the fixed-period snapshot
 * for the dashboard.
 */
export function MoneyOverview() {
  const { data: balances } = useSupplierBalances();
  // `range` here is deliberately today's single day — `month` in the same response always
  // resolves to the current calendar month regardless of what range is passed, so one request
  // covers both cards below.
  const { data: summary } = useFinancialSummary({ from: todayKey(), to: todayKey() });

  const owedBySupplier = (balances ?? []).filter((b) => b.owed > 0).sort((a, b) => b.owed - a.owed);
  const totalOwed = (balances ?? []).reduce((sum, b) => sum + b.owed, 0);
  const totalOrdered = (balances ?? []).reduce((sum, b) => sum + b.ordered, 0);
  const totalPaid = (balances ?? []).reduce((sum, b) => sum + b.paid, 0);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-950">Suppliers</h2>
          <p className="text-xs text-slate-500">What the clinic currently owes</p>
        </div>
        {!balances ? (
          <TileSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatTile
              label="Due to suppliers"
              value={formatCurrency(totalOwed)}
              tone={totalOwed > 0 ? 'expense' : 'income'}
              hint={totalOrdered > 0 ? `${formatCurrency(totalPaid)} paid of ${formatCurrency(totalOrdered)} in shipments` : 'No shipments logged yet'}
            />
            <StatTile
              label="Breakdown by supplier"
              value={owedBySupplier.length > 0 ? `${owedBySupplier.length} owed` : 'All settled'}
              footer={<SupplierBreakdownRows balances={owedBySupplier} />}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-950">Sales income</h2>
          <p className="text-xs text-slate-500">Money that came in from transactions</p>
        </div>
        {!summary ? (
          <TileSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatTile
              label="Income today"
              value={formatCurrency(summary.range.income.net)}
              tone={summary.range.income.net < 0 ? 'warn' : 'income'}
              hint={
                summary.range.income.refunds > 0
                  ? `${formatCurrency(summary.range.income.gross)} sales − ${formatCurrency(summary.range.income.refunds)} refunded`
                  : undefined
              }
            />
            <StatTile
              label="Income this month"
              value={formatCurrency(summary.month.income.net)}
              tone={summary.month.income.net < 0 ? 'warn' : 'income'}
              hint={
                summary.month.income.refunds > 0
                  ? `${formatCurrency(summary.month.income.gross)} sales − ${formatCurrency(summary.month.income.refunds)} refunded`
                  : undefined
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
