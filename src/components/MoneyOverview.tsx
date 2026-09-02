import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useFinancialSummary } from '../api/analytics';
import { useDateRangeStore } from '../store/useDateRangeStore';
import { formatRangeLabel } from '../lib/timezone';
import { DateRangePicker } from './DateRangePicker';
import { StatTile, formatCurrency } from './ui';
import { PAYMENT_METHOD_LABELS, type FinancialWindow, type MethodBreakdown, type PaymentBucket } from '../types';

const BUCKET_ORDER: PaymentBucket[] = ['cash', 'instapay', 'card', 'unrecorded'];

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

function TileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
      ))}
    </div>
  );
}

function WindowRow({
  title,
  subtitle,
  window: win,
  control,
}: {
  title: string;
  subtitle: string;
  /** null while the figures are in flight — the header and its control stay mounted, so
   *  changing the dates never yanks the picker out from under the cursor mid-edit. */
  window: FinancialWindow | null;
  /** Sits in this row's own header, so it never appears to scope the row below it. */
  control?: ReactNode;
}) {
  const [showIncomeMethods, setShowIncomeMethods] = useState(false);
  const [showExpenseMethods, setShowExpenseMethods] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy-950">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {control}
      </div>
      {!win ? (
        <TileSkeleton />
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Income"
          value={formatCurrency(win.income.net)}
          // A range can legitimately end negative: a sale made in August and refunded in
          // September reduces September's income with no matching sale inside it. That is
          // the correct figure, so it is flagged rather than hidden.
          tone={win.income.net < 0 ? 'warn' : 'income'}
          hint={
            win.income.net < 0
              ? 'Refunds exceeded sales in these dates'
              : win.income.refunds > 0
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
      )}
    </section>
  );
}

/**
 * The clinic's money at a glance: the dates the owner picked, and all time, each as
 * income / expenses / net.
 *
 * Income is net of refunds, and a refund is never counted as an expense — it reduces the
 * income it came from. Expenses are supplier shipments plus running costs. Both figures and
 * their per-method breakdowns come from a single API response, so the three tiles in a row
 * always add up to each other — and Money in / out reads that same response, so the two
 * screens cannot disagree about the same dates.
 */
export function MoneyOverview() {
  const range = useDateRangeStore((s) => s.range);
  const setRange = useDateRangeStore((s) => s.setRange);
  const { data, isError } = useFinancialSummary(range);
  const picker = <DateRangePicker value={range} onChange={setRange} size="compact" />;
  // Clearing both dates asks for everything, which is what the second row already shows —
  // so it collapses to one row rather than printing the same nine figures twice.
  const isAllTime = !range.from && !range.to;

  if (isError) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-navy-950">{formatRangeLabel(range)}</h2>
            <p className="text-xs text-slate-500">Money in and out over these dates</p>
          </div>
          {picker}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
          Could not load the money summary right now.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <WindowRow
        title={formatRangeLabel(range)}
        subtitle={isAllTime ? 'Everything recorded since the clinic opened its books here' : 'Money in and out over these dates'}
        window={data?.range ?? null}
        control={picker}
      />
      {!isAllTime && (
        <WindowRow
          title="All time"
          subtitle="Everything recorded since the clinic opened its books here"
          window={data?.allTime ?? null}
        />
      )}
    </div>
  );
}
