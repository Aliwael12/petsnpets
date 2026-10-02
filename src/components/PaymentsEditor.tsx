import { Plus, X } from 'lucide-react';
import { Input, Select } from './ui';
import { PAYMENT_METHOD_LABELS, type PaymentLine, type PaymentMethod } from '../types';

const PAYMENT_OPTIONS: PaymentMethod[] = ['cash', 'instapay', 'card', 'vodafone_cash'];

/**
 * What the cashier has entered so far: one method for the whole bill (or none — optional,
 * and deliberately never defaulted to cash), or a split with an amount per method. Amounts
 * are the raw EGP text from the inputs, so a half-typed "25." isn't mangled while typing.
 */
export type PaymentDraft =
  | { split: false; method: PaymentMethod | '' }
  | { split: true; lines: { method: PaymentMethod; amount: string }[] };

export const EMPTY_PAYMENT_DRAFT: PaymentDraft = { split: false, method: '' };

/** The draft for a sale's existing payments — what the edit form starts from. */
export function draftFromPayments(payments: PaymentLine[]): PaymentDraft {
  if (payments.length === 0) return EMPTY_PAYMENT_DRAFT;
  if (payments.length === 1) return { split: false, method: payments[0].method };
  return { split: true, lines: payments.map((p) => ({ method: p.method, amount: toEgpText(p.amount) })) };
}

/** Piastres per line, or why the split can't be saved yet. */
export function paymentsFromDraft(draft: PaymentDraft, total: number): { payments: PaymentLine[] } | { error: string } {
  if (!draft.split) return { payments: draft.method && total > 0 ? [{ method: draft.method, amount: total }] : [] };
  const lines = draft.lines.map((l) => ({ method: l.method, amount: toPiastres(l.amount) }));
  if (lines.some((l) => l.amount === null || l.amount <= 0)) return { error: 'Enter an amount for every payment method in the split.' };
  const paid = lines.reduce((sum, l) => sum + (l.amount ?? 0), 0);
  if (paid !== total) {
    return { error: `The split adds up to ${money(paid)}, but the bill is ${money(total)}.` };
  }
  return { payments: lines as PaymentLine[] };
}

function toPiastres(text: string): number | null {
  const value = Number(text.trim());
  if (!text.trim() || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function toEgpText(piastres: number): string {
  return String(piastres / 100);
}

/** Like formatCurrency, but keeps piastres: a split that's off by 50 piastres must not
 *  read "EGP 1,000 but the bill is EGP 1,000". */
function money(piastres: number): string {
  return `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function PaymentsEditor({
  total,
  value,
  onChange,
  label,
}: {
  /** The bill, in piastres — what a split has to add up to. */
  total: number;
  value: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  label: string;
}) {
  const startSplit = () => {
    const first = value.split ? 'cash' : value.method || 'cash';
    const second = PAYMENT_OPTIONS.find((m) => m !== first)!;
    onChange({ split: true, lines: [{ method: first, amount: '' }, { method: second, amount: '' }] });
  };

  if (!value.split) {
    return (
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-slate-500">{label}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {PAYMENT_OPTIONS.map((method) => (
            <button
              key={method}
              type="button"
              // Tapping the selected method again clears it back to "not recorded".
              onClick={() => onChange({ split: false, method: value.method === method ? '' : method })}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                value.method === method ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-200 text-slate-600 hover:border-navy-400'
              }`}
            >
              {PAYMENT_METHOD_LABELS[method]}
            </button>
          ))}
        </div>
        {total > 0 && (
          <button type="button" onClick={startSplit} className="mt-2 text-xs font-medium text-navy-700 hover:text-navy-900 hover:underline">
            Split between methods
          </button>
        )}
      </div>
    );
  }

  const lines = value.lines;
  const setLine = (index: number, patch: Partial<{ method: PaymentMethod; amount: string }>) => {
    const next = lines.map((l, i) => (i === index ? { ...l, ...patch } : l));
    // With exactly two methods, typing one amount fills the other with the rest of the bill
    // — the everyday "500 cash, the rest on the card" case in a single entry.
    if (patch.amount !== undefined && next.length === 2) {
      const typed = toPiastres(patch.amount);
      if (typed !== null && typed >= 0 && typed <= total) next[1 - index] = { ...next[1 - index], amount: toEgpText(total - typed) };
    }
    onChange({ split: true, lines: next });
  };
  const removeLine = (index: number) => {
    const next = lines.filter((_, i) => i !== index);
    // Down to one method: that's just a normal single-method payment again.
    onChange(next.length === 1 ? { split: false, method: next[0].method } : { split: true, lines: next });
  };
  const unused = PAYMENT_OPTIONS.filter((m) => !lines.some((l) => l.method === m));

  const entered = lines.reduce((sum, l) => sum + (toPiastres(l.amount) ?? 0), 0);
  const remaining = total - entered;

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <button
          type="button"
          onClick={() => onChange({ split: false, method: '' })}
          className="text-xs font-medium text-slate-500 hover:text-navy-900 hover:underline"
        >
          Pay one way
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Select
              value={line.method}
              onChange={(e) => setLine(i, { method: e.target.value as PaymentMethod })}
              className="w-40! shrink-0"
              aria-label={`Payment method ${i + 1}`}
            >
              {PAYMENT_OPTIONS.filter((m) => m === line.method || !lines.some((l) => l.method === m)).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">EGP</span>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={line.amount}
                onChange={(e) => setLine(i, { amount: e.target.value })}
                className="pl-11 tabular-nums"
                aria-label={`${PAYMENT_METHOD_LABELS[line.method]} amount`}
              />
            </div>
            <button
              type="button"
              onClick={() => removeLine(i)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              aria-label={`Remove ${PAYMENT_METHOD_LABELS[line.method]}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        {unused.length > 0 ? (
          <button
            type="button"
            onClick={() =>
              onChange({ split: true, lines: [...lines, { method: unused[0], amount: remaining > 0 ? toEgpText(remaining) : '' }] })
            }
            className="inline-flex items-center gap-1 font-medium text-navy-700 hover:text-navy-900 hover:underline"
          >
            <Plus size={12} /> Add method
          </button>
        ) : (
          <span />
        )}
        <span className={`tabular-nums ${remaining === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
          {remaining === 0
            ? 'Adds up to the bill'
            : remaining > 0
              ? `${money(remaining)} left to assign`
              : `${money(-remaining)} over the bill`}
        </span>
      </div>
    </div>
  );
}
