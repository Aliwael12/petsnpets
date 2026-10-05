import { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeftRight } from 'lucide-react';
import { useFinancialSummary, useReallocateIncome } from '../api/analytics';
import { useSupplierBalances } from '../api/purchasing';
import { ApiError } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';
import { formatDayKey, todayKey } from '../lib/timezone';
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
 * Admin only: move money between payment methods, e.g. take EGP 2,000 off InstaPay and add
 * it to Cash. Each method shows what it has now, a −/+ toggle and an amount; what's taken
 * and what's added have to balance, so the month's total never changes. No sale is
 * touched: the server stores the result as a correction on top of the recorded payments.
 */
function ReallocateIncomeModal({ window, onClose }: { window: FinancialWindow; onClose: () => void }) {
  const reallocate = useReallocateIncome();
  // "Not recorded" only appears when there's some to move out of it.
  const buckets: PaymentBucket[] = [...INCOME_METHODS, ...(window.income.byMethod.unrecorded !== 0 ? (['unrecorded'] as const) : [])];
  const [changes, setChanges] = useState<Record<string, { sign: 1 | -1; amount: string }>>({});

  const toPiastres = (text: string) => {
    const n = Number(text.trim());
    return text.trim() === '' ? 0 : !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100);
  };
  const rows = buckets.map((b) => {
    const change = changes[b] ?? { sign: -1 as const, amount: '' };
    const amount = toPiastres(change.amount);
    const delta = amount === null ? 0 : change.sign * amount;
    const now = window.income.byMethod[b];
    return { bucket: b, change, amount, delta, now, after: now + delta };
  });
  const taken = rows.reduce((sum, r) => sum + (r.delta < 0 ? -r.delta : 0), 0);
  const added = rows.reduce((sum, r) => sum + (r.delta > 0 ? r.delta : 0), 0);
  const balanced = taken === added && taken > 0;
  const setChange = (b: PaymentBucket, patch: Partial<{ sign: 1 | -1; amount: string }>) =>
    setChanges({ ...changes, [b]: { ...(changes[b] ?? { sign: -1, amount: '' }), ...patch } });

  const save = () => {
    if (rows.some((r) => r.amount === null)) return toast.error('Amounts have to be numbers of zero or more');
    if (rows.some((r) => r.after < 0)) return toast.error('You can’t take more from a method than it has');
    if (!balanced) return toast.error('What you take and what you add have to be the same amount');
    const byMethod = { ...window.income.byMethod } as MethodBreakdown;
    for (const r of rows) byMethod[r.bucket] = r.after;
    reallocate.mutate(
      { year: window.year!, month: window.month!, byMethod },
      {
        onSuccess: () => {
          toast.success(`Moved ${money(taken)} between methods`);
          onClose();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not move the money'),
      },
    );
  };

  return (
    <Modal title={`Move ${MONTH_NAMES[(window.month ?? 1) - 1]} income between methods`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">
          Next to each method, pick <span className="font-medium text-navy-950">−</span> to take money off it or{' '}
          <span className="font-medium text-navy-950">+</span> to add money to it. The month&rsquo;s total stays{' '}
          <span className="font-semibold text-navy-950">{money(window.income.net)}</span>, and no sale or invoice changes.
        </p>
        <div className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((r) => (
            <div key={r.bucket} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-navy-950">{PAYMENT_METHOD_LABELS[r.bucket]}</p>
                <p className="text-xs tabular-nums text-slate-400">
                  Now {money(r.now)}
                  {r.delta !== 0 && (
                    <>
                      {' '}
                      → <span className={r.after < 0 ? 'font-medium text-red-600' : 'font-medium text-navy-800'}>{money(r.after)}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex overflow-hidden rounded-lg border border-slate-300" role="group" aria-label={`Take from or add to ${PAYMENT_METHOD_LABELS[r.bucket]}`}>
                {([-1, 1] as const).map((sign) => (
                  <button
                    key={sign}
                    type="button"
                    onClick={() => setChange(r.bucket, { sign })}
                    className={`w-9 py-1.5 text-base font-semibold ${
                      r.change.sign === sign ? (sign < 0 ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white') : 'bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                    aria-pressed={r.change.sign === sign}
                    title={sign < 0 ? 'Take money off this method' : 'Add money to this method'}
                  >
                    {sign < 0 ? '−' : '+'}
                  </button>
                ))}
              </div>
              <div className="relative w-32">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">EGP</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={r.change.amount}
                  onChange={(e) => setChange(r.bucket, { amount: e.target.value })}
                  className="pl-11 text-right tabular-nums"
                  aria-label={`Amount to move for ${PAYMENT_METHOD_LABELS[r.bucket]}`}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="text-slate-500">
            Taking <span className="font-medium text-red-600">{money(taken)}</span> · adding{' '}
            <span className="font-medium text-emerald-700">{money(added)}</span>
          </span>
          <span className={balanced ? 'text-emerald-600' : 'text-amber-600'}>
            {taken === 0 && added === 0
              ? 'Nothing moved yet'
              : balanced
                ? 'Balanced'
                : taken > added
                  ? `Add ${money(taken - added)} more somewhere`
                  : `Take ${money(added - taken)} more from somewhere`}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={reallocate.isPending || !balanced}>
            {reallocate.isPending ? 'Saving…' : 'Move money'}
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
  const isAdmin = useAuthStore((s) => s.employee?.role === 'admin');
  // The admin can look at any single day; everyone else always sees today. `month` in the
  // same response is the current calendar month whatever day is picked.
  const [day, setDay] = useState(todayKey());
  const shownDay = isAdmin ? day : todayKey();
  const isToday = shownDay === todayKey();
  const { data: summary } = useFinancialSummary({ from: shownDay, to: shownDay });
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
              label={isToday ? 'Income today' : `Income on ${formatDayKey(shownDay)}`}
              action={
                isAdmin ? (
                  <input
                    type="date"
                    value={day}
                    max={todayKey()}
                    onChange={(e) => setDay(e.target.value || todayKey())}
                    className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs text-navy-900 outline-none focus:border-navy-600"
                    aria-label="Show income for another day"
                    title="Show income for another day"
                  />
                ) : undefined
              }
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
                    <ArrowLeftRight size={12} /> Reallocation
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
