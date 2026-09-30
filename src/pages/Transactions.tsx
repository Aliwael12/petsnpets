import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSales, useUpdateSale } from '../api/sales';
import { useEmployees } from '../api/employees';
import { useProducts } from '../api/catalog';
import { openInvoice } from '../api/invoices';
import { ApiError } from '../api/client';
import { Badge, Button, Card, EmployeeTag, EmptyState, Input, Modal, Select, formatCurrency, formatDateTime } from '../components/ui';
import { PaymentsEditor, draftFromPayments, paymentsFromDraft, type PaymentDraft } from '../components/PaymentsEditor';
import { ClientPicker } from '../components/ClientPicker';
import { FileText, Loader2, Pencil } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, type PaymentLine, type Transaction } from '../types';
import { toBusinessDateTimeInput } from '../lib/timezone';

const invoiceLabel = (t: Transaction) => `INV-${t.invoiceYear}-${String(t.invoiceNo).padStart(5, '0')}`;

/** "Cash" for a sale paid one way; one line per method, with its share, for a split bill. */
function PaidWith({ payments }: { payments: PaymentLine[] }) {
  if (payments.length === 0) return <span className="text-slate-300">—</span>;
  if (payments.length === 1) return <>{PAYMENT_METHOD_LABELS[payments[0].method]}</>;
  return (
    <div className="flex flex-col gap-0.5">
      {payments.map((p) => (
        <span key={p.method}>
          {PAYMENT_METHOD_LABELS[p.method]} <span className="text-slate-400">{formatCurrency(p.amount)}</span>
        </span>
      ))}
    </div>
  );
}

const sameLines = (a: PaymentLine[], b: PaymentLine[]) => {
  const key = (lines: PaymentLine[]) => JSON.stringify([...lines].sort((x, y) => x.method.localeCompare(y.method)).map((l) => [l.method, l.amount]));
  return key(a) === key(b);
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * A date plus a 12-hour time (hour, minute, AM/PM). A plain datetime-local input follows the
 * computer's clock setting and can show 24-hour time, so the time is picked explicitly here.
 * The value stays Cairo wall time as "YYYY-MM-DDTHH:mm".
 */
function DateTime12Input({ value, onChange, max }: { value: string; onChange: (next: string) => void; max: string }) {
  const [date, time] = value.split('T');
  const [h24, minute] = time.split(':').map(Number);
  const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const emit = (d: string, h: number, m: number, p: 'AM' | 'PM') =>
    onChange(`${d}T${pad2((h % 12) + (p === 'PM' ? 12 : 0))}:${pad2(m)}`);

  return (
    <div className="flex gap-1.5">
      <Input
        id="sale-occurred-at"
        type="date"
        value={date}
        max={max.slice(0, 10)}
        onChange={(e) => e.target.value && emit(e.target.value, hour12, minute, period)}
        className="min-w-0 flex-1"
      />
      <Select value={hour12} onChange={(e) => emit(date, Number(e.target.value), minute, period)} className="w-16! shrink-0" aria-label="Hour">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
      <Select value={minute} onChange={(e) => emit(date, hour12, Number(e.target.value), period)} className="w-18! shrink-0" aria-label="Minute">
        {Array.from({ length: 60 }, (_, m) => m).map((m) => (
          <option key={m} value={m}>
            {pad2(m)}
          </option>
        ))}
      </Select>
      <Select value={period} onChange={(e) => emit(date, hour12, minute, e.target.value as 'AM' | 'PM')} className="w-20! shrink-0" aria-label="AM or PM">
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </Select>
    </div>
  );
}

/** Fixes who a sale was for, when it happened and how it was paid. Items and prices stay as rung up —
 *  changing those is what a refund is for. */
function EditSaleModal({ sale, onClose }: { sale: Transaction; onClose: () => void }) {
  const updateSale = useUpdateSale();
  // '' is a walk-in, matching the POS. A sale that spent a client's discount stays theirs.
  const originalClientId = sale.clientId ?? '';
  const [clientId, setClientId] = useState(originalClientId);
  const originalTime = toBusinessDateTimeInput(sale.createdAt);
  const [occurredAt, setOccurredAt] = useState(originalTime);
  const [payment, setPayment] = useState<PaymentDraft>(() => draftFromPayments(sale.payments));

  const save = () => {
    const paid = paymentsFromDraft(payment, sale.total);
    if ('error' in paid) {
      toast.error(paid.error);
      return;
    }
    const clientChanged = clientId !== originalClientId;
    const timeChanged = occurredAt !== originalTime;
    const paymentsChanged = !sameLines(paid.payments, sale.payments);
    if (!clientChanged && !timeChanged && !paymentsChanged) {
      onClose();
      return;
    }
    updateSale.mutate(
      {
        id: sale.id,
        clientId: clientChanged ? clientId || null : undefined,
        occurredAt: timeChanged ? occurredAt : undefined,
        payments: paymentsChanged ? paid.payments : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Sale updated');
          onClose();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the sale'),
      },
    );
  };

  return (
    <Modal title={`Edit ${invoiceLabel(sale)}`} onClose={onClose}>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-slate-500">
          Bill total <span className="font-semibold text-navy-950">{formatCurrency(sale.total)}</span>
        </p>
        <p className="mt-3 text-xs font-medium text-slate-500">Customer</p>
        {sale.discountId ? (
          <>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-navy-950">{sale.customerName}</p>
            <p className="mt-1 text-xs text-slate-400">This sale used the customer’s discount, so the customer can’t be changed.</p>
          </>
        ) : (
          <>
            <ClientPicker value={clientId} onChange={setClientId} autoFocus={false} />
            {!clientId && <p className="mt-1 text-xs text-slate-400">No customer picked — the sale is saved as a walk-in.</p>}
          </>
        )}
        <label className="mt-3 block text-xs font-medium text-slate-500" htmlFor="sale-occurred-at">
          Date and time
        </label>
        <DateTime12Input value={occurredAt} onChange={setOccurredAt} max={toBusinessDateTimeInput(new Date().toISOString())} />
        <PaymentsEditor total={sale.total} value={payment} onChange={setPayment} label="Paid with" />
        <p className="mt-3 text-xs text-slate-400">Items and prices can’t be changed here — use a refund for that.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={updateSale.isPending}>
            {updateSale.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function Transactions() {
  const { data: employees = [] } = useEmployees();
  const { data: products = [] } = useProducts({ activeOnly: false });

  const [employeeFilter, setEmployeeFilter] = useState('all');
  // Tracks which row's PDF is being generated so only that button shows a spinner —
  // the first request for a given sale renders the PDF server-side and can take a moment.
  const [invoicePending, setInvoicePending] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState<'all' | '7' | '30'>('all');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const { data: sales = [] } = useSales({
    soldBy: employeeFilter === 'all' ? undefined : employeeFilter,
    sinceDays: rangeFilter === 'all' ? undefined : Number(rangeFilter),
  });

  // Filtering by product is done client-side against the already-fetched list — the API
  // supports it too, but combining it with the other two filters in one round trip isn't
  // worth a second query key for a table this size.
  const filtered = productFilter === 'all' ? sales : sales.filter((t) => t.items.some((it) => it.productId === productFilter));

  const total = filtered.reduce((sum, t) => sum + t.total, 0);

  const downloadInvoice = async (transactionId: string) => {
    setInvoicePending(transactionId);
    try {
      await openInvoice(transactionId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not generate the invoice');
    } finally {
      setInvoicePending(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-950">Transaction history</h1>
        <p className="text-sm text-slate-500">{filtered.length} transactions · {formatCurrency(total)} total</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="w-52">
          <option value="all">All employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
        <Select value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="w-56">
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value as 'all' | '7' | '30')} className="w-40">
          <option value="all">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </Select>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No transactions match your filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Client ID</th>
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium">Discount</th>
                  <th className="px-5 py-3 font-medium">Paid with</th>
                  <th className="px-5 py-3 font-medium">Sold by</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-medium text-navy-950">{t.customerName}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {t.client?.legacyId != null ? `#${t.client.legacyId}` : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      <div className="flex flex-col gap-0.5">
                        {t.items.map((it) => (
                          <span key={it.id}>
                            {it.product?.name ?? it.productId} × {formatCurrency(it.unitPrice)} × {it.quantity}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {t.discountAmount ? <Badge tone="discount">-{formatCurrency(t.discountAmount)}</Badge> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                      <PaidWith payments={t.payments} />
                    </td>
                    <td className="px-5 py-3">
                      <EmployeeTag name={t.soldByEmployee?.name ?? 'Unknown'} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatDateTime(t.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-semibold text-navy-950">{formatCurrency(t.total)}</span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <button
                        onClick={() => setEditing(t)}
                        title="Edit the customer, date, time or payment"
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:bg-slate-100"
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => downloadInvoice(t.id)}
                        disabled={invoicePending === t.id}
                        title={`Open invoice ${invoiceLabel(t)}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        {invoicePending === t.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        {invoicePending === t.id ? 'Generating…' : 'PDF'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <EditSaleModal sale={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
