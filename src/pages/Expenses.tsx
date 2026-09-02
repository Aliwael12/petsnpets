import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Ban } from 'lucide-react';
import { useCreateExpense, useExpenses, useVoidExpense } from '../api/expenses';
import { ApiError } from '../api/client';
import { businessDayKey } from '../lib/timezone';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmployeeTag,
  EmptyState,
  Input,
  Modal,
  Select,
  StatTile,
  formatCurrency,
  formatDate,
} from '../components/ui';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  type Expense,
  type ExpenseCategory,
  type PaymentMethod,
} from '../types';

const today = () => businessDayKey(new Date().toISOString());

const emptyForm = {
  category: '' as ExpenseCategory | '',
  description: '',
  amount: '',
  paymentMethod: 'cash' as PaymentMethod,
  payee: '',
  paidOn: today(),
  note: '',
};

type Range = 'this-month' | '30' | 'all';

/** First day of the current month as YYYY-MM-DD, read in the clinic's timezone so the
 * boundary matches the dashboard's month rather than the viewer's. */
function startOfThisMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

export function Expenses() {
  const [range, setRange] = useState<Range>('this-month');
  const [categoryFilter, setCategoryFilter] = useState<ExpenseCategory | 'all'>('all');
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all');

  const filters = useMemo(() => {
    if (range === 'this-month') return { from: startOfThisMonth() };
    if (range === '30') {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 29);
      return { from: businessDayKey(d.toISOString()) };
    }
    return {};
  }, [range]);

  const { data: expenses = [], isLoading } = useExpenses({
    ...filters,
    category: categoryFilter === 'all' ? undefined : categoryFilter,
    paymentMethod: methodFilter === 'all' ? undefined : methodFilter,
  });
  const createExpense = useCreateExpense();
  const voidExpense = useVoidExpense();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Biggest category first — that's the one the owner is looking for.
  const byCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const submit = () => {
    if (!form.category) {
      toast.error('Pick a category');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Describe what this payment was for');
      return;
    }
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount greater than zero');
      return;
    }

    createExpense.mutate(
      {
        category: form.category,
        description: form.description.trim(),
        // The doctor types EGP; every money field in the API is piastres.
        amount: Math.round(amount * 100),
        paymentMethod: form.paymentMethod,
        payee: form.payee.trim() || undefined,
        paidOn: form.paidOn,
        note: form.note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Expense recorded');
          setForm({ ...emptyForm, paidOn: today() });
          setModalOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not record the expense'),
      },
    );
  };

  const submitVoid = () => {
    if (!voiding) return;
    if (!voidReason.trim()) {
      toast.error('Say why this expense is being voided');
      return;
    }
    voidExpense.mutate(
      { id: voiding.id, reason: voidReason.trim() },
      {
        onSuccess: () => {
          toast.success('Expense voided');
          setVoiding(null);
          setVoidReason('');
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not void the expense'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Expenses</h1>
          <p className="text-sm text-slate-500">
            Money paid out to run the clinic — rent, salaries, utilities, repairs. Stock bought from suppliers is logged
            under Money In / Out instead, and already counts towards your expenses there.
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Record expense
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label={range === 'all' ? 'Total recorded' : range === '30' ? 'Last 30 days' : 'This month'}
          value={formatCurrency(total)}
          hint={`${expenses.length} expense${expenses.length === 1 ? '' : 's'}`}
          tone="expense"
        />
        <StatTile
          label="Largest category"
          value={byCategory.length ? EXPENSE_CATEGORY_LABELS[byCategory[0][0]] : '—'}
          hint={byCategory.length ? formatCurrency(byCategory[0][1]) : 'Nothing recorded yet'}
        />
        <StatTile
          label="Categories used"
          value={String(byCategory.length)}
          hint={byCategory.length > 1 ? byCategory.slice(1, 3).map(([c]) => EXPENSE_CATEGORY_LABELS[c]).join(', ') : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title="Recorded expenses"
          subtitle="Voided entries are hidden and never count towards any total"
          action={
            <div className="flex flex-wrap items-center gap-2">
              {/* Select is w-full by design, so each filter is sized by its wrapper rather than
                  a className that would collide with that width utility. */}
              <div className="w-36">
                <Select value={range} onChange={(e) => setRange(e.target.value as Range)}>
                  <option value="this-month">This month</option>
                  <option value="30">Last 30 days</option>
                  <option value="all">All time</option>
                </Select>
              </div>
              <div className="w-44">
                <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as ExpenseCategory | 'all')}>
                  <option value="all">All categories</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-36">
                <Select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as PaymentMethod | 'all')}>
                  <option value="all">Any payment</option>
                  <option value="cash">Cash</option>
                  <option value="instapay">InstaPay</option>
                  <option value="card">Visa / Card</option>
                </Select>
              </div>
            </div>
          }
        />
        {isLoading ? (
          <EmptyState title="Loading…" />
        ) : expenses.length === 0 ? (
          <EmptyState title="No expenses in this period" subtitle="Record one to start tracking what the clinic spends" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3 font-medium">Paid on</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Paid by</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDate(`${e.paidOn}T12:00:00Z`)}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-navy-950">{e.description}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {e.payee && <span className="text-xs text-slate-500">to {e.payee}</span>}
                        <EmployeeTag name={e.recordedByEmployee?.name ?? 'Unknown'} />
                      </div>
                      {e.note && <p className="mt-1 text-xs text-slate-400">{e.note}</p>}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone="supplier-order">{EXPENSE_CATEGORY_LABELS[e.category]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">{PAYMENT_METHOD_LABELS[e.paymentMethod]}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-navy-950">
                      {formatCurrency(e.amount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setVoiding(e)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Void this expense"
                      >
                        <Ban size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Record expense" onClose={() => setModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                  <option value="">Select category</option>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {EXPENSE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Amount (EGP)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">What was it for?</label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. October clinic rent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Paid with</label>
                <Select
                  value={form.paymentMethod}
                  onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod })}
                >
                  <option value="cash">Cash</option>
                  <option value="instapay">InstaPay</option>
                  <option value="card">Visa / Card</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Date paid</label>
                <Input type="date" value={form.paidOn} onChange={(e) => setForm({ ...form, paidOn: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Paid to (optional)</label>
              <Input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} placeholder="e.g. Landlord" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Note (optional)</label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <p className="text-xs text-slate-400">
              The amount, date and payment method can&apos;t be edited afterwards — void the entry and record it again, so the
              change leaves a trail.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={createExpense.isPending}>
                {createExpense.isPending ? 'Saving…' : 'Record expense'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {voiding && (
        <Modal title="Void expense" onClose={() => setVoiding(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-navy-950">{voiding.description}</span> — {formatCurrency(voiding.amount)}. It
              will stop counting towards every total, but stays on record.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Reason</label>
              <Input
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Entered twice by mistake"
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setVoiding(null)}>
                Cancel
              </Button>
              <Button onClick={submitVoid} disabled={voidExpense.isPending}>
                {voidExpense.isPending ? 'Voiding…' : 'Void expense'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
