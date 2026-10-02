import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeftRight } from 'lucide-react';
import { useFinancialSummary, useReallocateIncome } from '../api/analytics';
import { useSupplierBalances } from '../api/purchasing';
import { ApiError } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { todayKey } from '../lib/timezone';
import { Button, Input, Modal, StatTile, formatCurrency } from './ui';
import { PAYMENT_METHOD_LABELS, type FinancialWindow, type MethodBreakdown, type PaymentBucket, type PaymentMethod } from '../types';

const INCOME_METHODS: PaymentMethod[] = ['cash', 'card', 'instapay', 'vodafone_cash'];

/** How the income came in: split sales count each share under its own method, and refunds
 *  come off the method they were paid back through. "Not recorded" only shows when there is
 *  some — a sale rung up without picking a method. */
function MethodBreakdownRows({ byMethod, reallocated }: { byMethod: MethodBreakdown; reallocated?: boolean }) {
  return (
    <dl className="mt-3 flex flex-col gap-1 border-t border-black/5 pt-3 text-xs">
      {reallocated && <p className="text-[11px] text-slate-400">Split adjusted by the admin. The total is unchanged.</p>}
      {INCOME_METHODS.map((m) => (
        <div key={m} className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-500">{PAYMENT_METHOD_LABELS[m]}</dt>
          <dd className="font-medium tabular-nums text-slate-700">{formatCurrency(byMethod[m])}</dd>
        </div>
      ))}
      {byMethod.unrecorded !== 0 && (
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-slate-400">{PAYMENT_METHOD_LABELS.unrecorded}</dt>
          <dd className="tabular-nums text-slate-500">{formatCurrency(byMethod.unrecorded)}</dd>
        </div>
      )}
    </dl>
  );
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Like formatCurrency, but keeps piastres, so a split that's 50 piastres off says so. */
const money = (piastres: number) => `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * Admin only: re-split the month's income across payment methods. Only the split changes —
 * the amounts must add up to exactly the month's income — and no sale is touched; the
 * server stores the difference as a correction on top of the recorded payments.
 */
function ReallocateIncomeModal({ window, onClose }: { window: FinancialWindow; onClose: () => void }) {
  const reallocate = useReallocateIncome();
  const total = window.income.net;
  // "Not recorded" only appears when there's some to move out of it.
  const buckets: PaymentBucket[] = [...INCOME_METHODS, ...(window.income.byMethod.unrecorded !== 0 ? (['unrecorded'] as const) : [])];
  const [values, setValues] = useState<Record<PaymentBucket, string>>(() => {
    const start = {} as Record<PaymentBucket, string>;
    for (const b of [...INCOME_METHODS, 'unrecorded'] as PaymentBucket[]) start[b] = String(window.income.byMethod[b] / 100);
    return start;
  });

  const toPiastres = (text: string) => {
    const n = Number(text.trim());
    return text.trim() === '' || !Number.isFinite(n) ? null : Math.round(n * 100);
  };
  const parsed = buckets.map((b) => toPiastres(values[b]));
  const entered = parsed.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const remaining = total - entered;

  const save = () => {
    if (parsed.some((v) => v === null || v < 0)) {
      toast.error('Enter an amount of zero or more for every method');
      return;
    }
    if (remaining !== 0) {
      toast.error(`The methods must add up to ${money(total)}`);
      return;
    }
    const byMethod = { cash: 0, instapay: 0, card: 0, vodafone_cash: 0, unrecorded: 0 } as MethodBreakdown;
    buckets.forEach((b, i) => (byMethod[b] = parsed[i]!));
    reallocate.mutate(
      { year: window.year!, month: window.month!, byMethod },
      {
        onSuccess: () => {
          toast.success('Income split updated');
          onClose();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the split'),
      },
    );
  };

  return (
    <Modal title={`Reallocate ${MONTH_NAMES[(window.month ?? 1) - 1]} income`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          Move money between payment methods. The month&rsquo;s total stays <span className="font-semibold text-navy-950">{money(total)}</span>, and no sale or invoice changes.
        </p>
        <div className="flex flex-col gap-2">
          {buckets.map((b) => (
            <label key={b} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">{PAYMENT_METHOD_LABELS[b]}</span>
              <div className="relative w-40">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">EGP</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={values[b]}
                  onChange={(e) => setValues({ ...values, [b]: e.target.value })}
                  className="pl-11 text-right tabular-nums"
                />
              </div>
            </label>
          ))}
        </div>
        <p className={`text-right text-xs tabular-nums ${remaining === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
          {remaining === 0
            ? `Adds up to ${money(total)}`
            : remaining > 0
              ? `${money(remaining)} still to assign`
              : `${money(-remaining)} over the month’s income`}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={reallocate.isPending || remaining !== 0}>
            {reallocate.isPending ? 'Saving…' : 'Save split'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

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
  const isAdmin = useAuthStore((s) => s.employee?.role === 'admin');
  const [reallocating, setReallocating] = useState(false);

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
              footer={<MethodBreakdownRows byMethod={summary.range.income.byMethod} reallocated={!!summary.range.income.reallocated} />}
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
              footer={<MethodBreakdownRows byMethod={summary.month.income.byMethod} reallocated={!!summary.month.income.reallocated} />}
              action={
                isAdmin && summary.month.income.net > 0 ? (
                  <button
                    type="button"
                    onClick={() => setReallocating(true)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-navy-700 hover:bg-black/5"
                    title="Move this month's income between payment methods"
                  >
                    <ArrowLeftRight size={12} /> Reallocate
                  </button>
                ) : undefined
              }
            />
          </div>
        )}
      </section>

      {reallocating && summary && <ReallocateIncomeModal window={summary.month} onClose={() => setReallocating(false)} />}
    </div>
  );
}
