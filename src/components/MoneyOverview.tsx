import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useFinancialSummary } from '../api/analytics';
import { StatTile, formatCurrency } from './ui';
import { PAYMENT_METHOD_LABELS, type FinancialWindow, type MethodBreakdown, type PaymentBucket } from '../types';

const BUCKET_ORDER: PaymentBucket[] = ['cash', 'instapay', 'card', 'unrecorded'];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Rows read straight off the API's breakdown, in a fixed order so the list doesn't reshuffle
 * between renders. 'Not recorded' is hidden when it's zero — once every row in the period
 * carries a payment method, the bucket that exists only for pre-tracking history should stop
 * taking up space.
 */
function MethodRows({ breakdown }: { breakdown: MethodBreakdown }) {
  return (
    <dl className="mt-3 flex flex-col gap-1 border-t border-black/5 pt-3 text-xs">
      {BUCKET_ORDER.filter((bucket) => bucket !== 'unrecorded' || breakdown.unrecorded !== 0).map((bucket) => (
        <div key={bucket} className="flex items-baseline justify-between gap-3">
          <dt className={bucket === 'unrecorded' ? 'text-slate-400' : 'text-slate-500'}>
            {PAYMENT_METHOD_LABELS[bucket]}
          </dt>
          <dd className={`font-medium tabular-nums ${bucket === 'unrecorded' ? 'text-slate-400' : 'text-slate-700'}`}>
            {formatCurrency(breakdown[bucket])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function BreakdownToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mr-1 -mt-1 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-white/70 hover:text-navy-900"
      aria-expanded={open}
    >
      {open ? 'Hide' : 'How paid'}
      {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </button>
  );
}

function WindowRow({ title, subtitle, window: win }: { title: string; subtitle: string; window: FinancialWindow }) {
  const [showIncomeMethods, setShowIncomeMethods] = useState(false);
  const [showExpenseMethods, setShowExpenseMethods] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold text-navy-950">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Income"
          value={formatCurrency(win.income.net)}
          tone="income"
          hint={
            win.income.refunds > 0
              ? `${formatCurrency(win.income.gross)} sales − ${formatCurrency(win.income.refunds)} refunded`
              : `${formatCurrency(win.income.gross)} in sales`
          }
          action={<BreakdownToggle open={showIncomeMethods} onClick={() => setShowIncomeMethods((v) => !v)} />}
          footer={showIncomeMethods ? <MethodRows breakdown={win.income.byMethod} /> : undefined}
        />
        <StatTile
          label="Expenses"
          value={formatCurrency(win.expenses.total)}
          tone="expense"
          hint={`${formatCurrency(win.expenses.stock)} stock · ${formatCurrency(win.expenses.operating)} running costs`}
          action={<BreakdownToggle open={showExpenseMethods} onClick={() => setShowExpenseMethods((v) => !v)} />}
          footer={showExpenseMethods ? <MethodRows breakdown={win.expenses.byMethod} /> : undefined}
        />
        <StatTile
          label="Net"
          value={formatCurrency(win.net)}
          tone={win.net < 0 ? 'warn' : 'gold'}
          hint={win.net < 0 ? 'Spent more than came in' : 'Income minus expenses'}
        />
      </div>
    </section>
  );
}

/**
 * The clinic's money at a glance: this month and all time, each as income / expenses / net.
 *
 * Income is net of refunds, and a refund is never counted as an expense — it reduces the
 * income it came from. Expenses are supplier shipments plus running costs. Both figures and
 * their per-method breakdowns come from a single API response, so the three tiles in a row
 * always add up to each other.
 */
export function MoneyOverview() {
  const { data, isLoading, isError } = useFinancialSummary();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        Could not load the money summary right now.
      </div>
    );
  }

  const monthLabel =
    data.month.year && data.month.month ? `${MONTH_NAMES[data.month.month - 1]} ${data.month.year}` : 'This month';

  return (
    <div className="flex flex-col gap-6">
      <WindowRow title={monthLabel} subtitle="Money in and out this month" window={data.month} />
      <WindowRow title="All time" subtitle="Everything recorded since the clinic opened its books here" window={data.allTime} />
    </div>
  );
}
