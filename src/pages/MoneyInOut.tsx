import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSales } from '../api/sales';
import { useRefunds } from '../api/refunds';
import { useCreateSupplierOrder, useSettleSupplierPayment, useSupplierBalances, useSupplierOrders, useSuppliers } from '../api/purchasing';
import { useCategories, useProducts } from '../api/catalog';
import { useFinancialSummary, useRevenueTimeseries } from '../api/analytics';
import { useExpenses } from '../api/expenses';
import { openRefundInvoice } from '../api/invoices';
import { ApiError } from '../api/client';
import { businessDayKey, formatRangeLabel } from '../lib/timezone';
import { useDateRangeStore } from '../store/useDateRangeStore';
import { useAuthStore } from '../store/useAuthStore';
import { canReceiveStock } from '../lib/permissions';
import { DateRangePicker } from '../components/DateRangePicker';
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
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FileText, Loader2, Plus } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, EXPENSE_CATEGORY_LABELS, type PaymentMethod } from '../types';

const emptyOrderForm = {
  supplierId: '',
  newSupplierName: '',
  productId: '',
  brand: '',
  category: '',
  productName: '',
  unitPrice: '',
  quantity: '',
  unitCost: '',
  expiryDate: '',
  receivedAt: '',
  paymentMethod: '' as PaymentMethod | '',
};

/** How soon a batch has to expire before the table flags it. */
const EXPIRY_WARNING_DAYS = 60;

export function MoneyInOut() {
  // One range, shared with the Dashboard cards and Analytics — see useDateRangeStore.
  const range = useDateRangeStore((s) => s.range);
  const setRange = useDateRangeStore((s) => s.setRange);
  const rangeLabel = formatRangeLabel(range);

  const [supplierFilter, setSupplierFilter] = useState('all');
  // Receiving a shipment sets cost prices, which every margin figure downstream is computed
  // from — so it stays with the owner even for someone granted the books read-only.
  const canLogShipments = canReceiveStock(useAuthStore((s) => s.employee?.role));

  // Every list is filtered by the SERVER now, on the same inclusive Cairo day bounds the
  // summary uses — no client-side date predicate, so a table and the tile above it cannot
  // disagree about which rows are in the window.
  const salesQuery = useSales(range);
  const { data: supplierOrders = [] } = useSupplierOrders(range);
  const { data: refunds = [] } = useRefunds(range);
  const { data: expenses = [] } = useExpenses(range);
  const { data: timeseries = [] } = useRevenueTimeseries(range);
  const summary = useFinancialSummary(range, supplierFilter !== 'all' ? supplierFilter : undefined);

  const { data: suppliers = [] } = useSuppliers();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts({ activeOnly: false });
  const { data: supplierBalances = [] } = useSupplierBalances();
  const createSupplierOrder = useCreateSupplierOrder();
  const settlePayment = useSettleSupplierPayment();

  const orderableProducts = products.filter((p) => p.kind !== 'service');
  const stockCategories = categories.filter((c) => c.active && c.kind !== 'service');

  const [modalOpen, setModalOpen] = useState(false);
  const [newSupplierMode, setNewSupplierMode] = useState(false);
  const [newProductMode, setNewProductMode] = useState(false);
  const [form, setForm] = useState(emptyOrderForm);
  const [refundPdfPending, setRefundPdfPending] = useState<string | null>(null);
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleForm, setSettleForm] = useState({ supplierId: '', amount: '', paymentMethod: '' as PaymentMethod | '' });

  // The supplier filter narrows the shipments table below, the Expenses tile above (via the
  // supplierId passed into useFinancialSummary), and the Due tile — but never Income, which
  // has no supplier to attribute a sale to in the first place. The Dashboard never passes
  // supplierId, so it keeps showing the whole clinic's figures regardless of what's picked
  // here.
  const filteredOrders = supplierOrders.filter((o) => supplierFilter === 'all' || o.supplierId === supplierFilter);
  const supplierFilterName = suppliers.find((s) => s.id === supplierFilter)?.name;

  // Owing money is a live balance, not a period fact — unlike Income/Expenses it is
  // deliberately NOT filtered by the date range, only by which supplier (or all of them) is
  // selected. See PurchasingService.supplierBalances().
  const dueTotals =
    supplierFilter === 'all'
      ? supplierBalances.reduce(
          (acc, b) => ({ ordered: acc.ordered + b.ordered, paid: acc.paid + b.paid, owed: acc.owed + b.owed }),
          { ordered: 0, paid: 0, owed: 0 },
        )
      : (supplierBalances.find((b) => b.supplierId === supplierFilter) ?? { ordered: 0, paid: 0, owed: 0 });

  // The bars come from the same endpoint the tiles do, so Σ(in) − Σ(out) across the chart
  // equals the Net tile above it rather than merely resembling it. Bucket width is chosen
  // server-side from the span, which is why a label may cover a week or a month.
  // Once the series crosses a year boundary the bare MM-DD labels collide (Jan 2025 and
  // Jan 2026 draw the same tick), so the year joins them.
  const spansYears = timeseries.length > 0 && timeseries[0].date.slice(0, 4) !== timeseries[timeseries.length - 1].endDate.slice(0, 4);
  const tick = (key: string) => (spansYears ? key.slice(2) : key.slice(5));
  const chartData = timeseries.map((p) => ({
    label: p.date === p.endDate ? tick(p.date) : `${tick(p.date)}–${tick(p.endDate)}`,
    in: p.total - p.refunds,
    out: p.stock + p.operating,
  }));
  const xInterval = Math.max(0, Math.floor(chartData.length / 8));

  const downloadRefundPdf = async (refundId: string) => {
    setRefundPdfPending(refundId);
    try {
      await openRefundInvoice(refundId);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not generate the credit note');
    } finally {
      setRefundPdfPending(null);
    }
  };

  const resetOrderForm = () => {
    setForm(emptyOrderForm);
    setNewSupplierMode(false);
    setNewProductMode(false);
  };

  const submit = () => {
    if (newSupplierMode && !form.newSupplierName.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    if (!newSupplierMode && !form.supplierId) {
      toast.error('Select a supplier');
      return;
    }
    if (newProductMode) {
      if (!form.productName.trim() || !form.category) {
        toast.error('Product name and category are required');
        return;
      }
    } else if (!form.productId) {
      toast.error('Select a product');
      return;
    }
    if (!form.quantity || !form.unitCost) {
      toast.error('Quantity and cost per unit are required');
      return;
    }

    createSupplierOrder.mutate(
      {
        supplierId: newSupplierMode ? undefined : form.supplierId,
        newSupplierName: newSupplierMode ? form.newSupplierName.trim() : undefined,
        productId: newProductMode ? undefined : form.productId,
        newProduct: newProductMode
          ? {
              brand: form.brand.trim() || undefined,
              category: form.category,
              name: form.productName.trim(),
              unitPrice: form.unitPrice ? Math.round(Number(form.unitPrice) * 100) : undefined,
            }
          : undefined,
        quantity: Number(form.quantity),
        unitCost: Math.round(Number(form.unitCost) * 100),
        // A date input gives a bare calendar day; send it as an instant so the API's
        // ISO-datetime validation accepts it.
        expiryDate: form.expiryDate ? new Date(`${form.expiryDate}T00:00:00Z`).toISOString() : undefined,
        // Left blank, the server logs it as of right now — no need to send anything.
        receivedAt: form.receivedAt ? new Date(`${form.receivedAt}T00:00:00Z`).toISOString() : undefined,
        paymentMethod: form.paymentMethod || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Supplier order logged');
          resetOrderForm();
          setModalOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not log supplier order'),
      },
    );
  };

  const openSettleModal = () => {
    setSettleForm({ supplierId: supplierFilter !== 'all' ? supplierFilter : '', amount: '', paymentMethod: '' });
    setSettleModalOpen(true);
  };

  const settleTargetOwed = supplierBalances.find((b) => b.supplierId === settleForm.supplierId)?.owed ?? 0;

  const submitSettle = () => {
    if (!settleForm.supplierId) {
      toast.error('Choose which supplier this payment is for');
      return;
    }
    const amount = Math.round(Number(settleForm.amount) * 100);
    if (!settleForm.amount || amount <= 0) {
      toast.error('Enter how much was paid');
      return;
    }
    settlePayment.mutate(
      { supplierId: settleForm.supplierId, amount, paymentMethod: settleForm.paymentMethod || undefined },
      {
        onSuccess: () => {
          toast.success('Payment recorded');
          setSettleModalOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not record payment'),
      },
    );
  };

  const todayKey = businessDayKey(new Date().toISOString());
  const warnKey = businessDayKey(new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000).toISOString());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Money in / out</h1>
          <p className="text-sm text-slate-500">Sales income vs. everything the clinic spends</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="w-48">
            <option value="all">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {canLogShipments && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus size={16} /> Log supplier order
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4">
          <DateRangePicker value={range} onChange={setRange} />
          <p className="text-sm font-medium text-navy-950">{rangeLabel}</p>
        </div>
      </Card>

      {summary.isError ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
          Could not load the money summary right now.
        </div>
      ) : !summary.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            label="Income"
            value={formatCurrency(summary.data.range.income.net)}
            tone={summary.data.range.income.net < 0 ? 'warn' : 'income'}
            hint={
              summary.data.range.income.net < 0
                ? 'Refunds exceeded sales in these dates'
                : // The count comes from /sales and the money from the summary — two
                  // queries. Falling back to the gross figure rather than printing
                  // "0 sales" keeps the hint from contradicting the number above it while
                  // the second request is still in flight (or has failed outright).
                  salesQuery.data
                  ? summary.data.range.income.refunds > 0
                    ? `${salesQuery.data.length} sales − ${formatCurrency(summary.data.range.income.refunds)} refunded`
                    : `${salesQuery.data.length} sales`
                  : summary.data.range.income.refunds > 0
                    ? `${formatCurrency(summary.data.range.income.gross)} sales − ${formatCurrency(summary.data.range.income.refunds)} refunded`
                    : `${formatCurrency(summary.data.range.income.gross)} in sales`
            }
          />
          <StatTile
            label={supplierFilterName ? `Expenses · ${supplierFilterName}` : 'Expenses'}
            value={formatCurrency(summary.data.range.expenses.total)}
            tone="expense"
            hint={
              supplierFilterName
                ? `${formatCurrency(summary.data.range.expenses.stock)} from this supplier · ${formatCurrency(
                    summary.data.range.expenses.operating,
                  )} running costs`
                : `${formatCurrency(summary.data.range.expenses.stock)} stock · ${formatCurrency(
                    summary.data.range.expenses.operating,
                  )} running costs`
            }
          />
          <StatTile
            label={supplierFilterName ? `Due · ${supplierFilterName}` : 'Due to suppliers'}
            value={formatCurrency(dueTotals.owed)}
            tone={dueTotals.owed > 0 ? 'expense' : 'income'}
            hint={
              dueTotals.ordered > 0
                ? `${formatCurrency(dueTotals.paid)} paid of ${formatCurrency(dueTotals.ordered)} in shipments`
                : 'No shipments logged yet'
            }
            action={
              canLogShipments && (
                <button
                  type="button"
                  onClick={openSettleModal}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-navy-700 hover:bg-slate-100"
                >
                  Settle
                </button>
              )
            }
          />
        </div>
      )}

      <Card>
        <CardHeader title="Cash flow" subtitle={`Income (after refunds) vs. what went out · ${rangeLabel}`} />
        {chartData.length === 0 ? (
          <EmptyState title="Nothing recorded in these dates" subtitle="Widen the dates to see the trend" />
        ) : (
          <div className="h-72 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={xInterval} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 100000}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="in" name="Income" fill="#f0c419" radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" name="Expenses" fill="#101c4d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Supplier order history"
          subtitle={
            supplierFilterName
              ? `${supplierFilterName} · ${formatCurrency(filteredOrders.reduce((sum, o) => sum + o.costTotal, 0))} in these dates`
              : rangeLabel
          }
        />
        {filteredOrders.length === 0 ? (
          <EmptyState title="No supplier orders in these dates" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Supplier</th>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Qty</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
                  <th className="px-5 py-3 font-medium">Paid with</th>
                  <th className="px-5 py-3 font-medium">Logged by</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders
                  .slice()
                  .sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt))
                  .map((o) => {
                    const expiryKey = o.expiryDate ? businessDayKey(o.expiryDate) : null;
                    const expired = expiryKey !== null && expiryKey < todayKey;
                    const expiringSoon = expiryKey !== null && !expired && expiryKey <= warnKey;
                    return (
                      <tr key={o.id}>
                        <td className="px-5 py-3 font-medium text-navy-950">{o.supplier?.name ?? 'Unknown'}</td>
                        <td className="px-5 py-3 text-slate-600">
                          {o.product?.brand && <span className="text-slate-400">{o.product.brand} · </span>}
                          {o.product?.name ?? o.productId}
                        </td>
                        <td className="px-5 py-3 text-slate-600">{o.quantity}</td>
                        <td className="px-5 py-3">
                          {!o.expiryDate ? (
                            <span className="text-slate-300">—</span>
                          ) : expired ? (
                            <Badge tone="low">Expired {formatDate(o.expiryDate)}</Badge>
                          ) : expiringSoon ? (
                            <Badge tone="sale">{formatDate(o.expiryDate)}</Badge>
                          ) : (
                            <span className="text-slate-500">{formatDate(o.expiryDate)}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                          {o.paymentMethod ? (
                            PAYMENT_METHOD_LABELS[o.paymentMethod]
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <EmployeeTag name={o.loggedByEmployee?.name ?? 'Unknown'} />
                        </td>
                        <td className="px-5 py-3 text-slate-500">{formatDate(o.receivedAt)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-navy-950">{formatCurrency(o.costTotal)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Running costs"
          subtitle="Rent, salaries, utilities and the rest — recorded on the Expenses tab, counted here"
        />
        {expenses.length === 0 ? (
          <EmptyState title="No running costs in these dates" subtitle="Record them from the Expenses tab" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Paid with</th>
                  <th className="px-5 py-3 font-medium">Paid on</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses
                  .slice()
                  .sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1))
                  .map((e) => (
                    <tr key={e.id}>
                      <td className="px-5 py-3 font-medium text-navy-950">
                        {e.description}
                        {e.payee && <span className="ml-1 text-xs font-normal text-slate-400">to {e.payee}</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone="supplier-order">{EXPENSE_CATEGORY_LABELS[e.category]}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">{PAYMENT_METHOD_LABELS[e.paymentMethod]}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-500">{formatDate(`${e.paidOn}T12:00:00Z`)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold text-navy-950">
                        {formatCurrency(e.amount)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Refund history" />
        {refunds.length === 0 ? (
          <EmptyState title="No refunds in these dates" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Transaction</th>
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium">Refunded by</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium text-right">Credit note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {refunds
                  .slice()
                  .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                  .map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium text-navy-950">
                        {r.transaction
                          ? `INV-${r.transaction.invoiceYear}-${String(r.transaction.invoiceNo).padStart(5, '0')}`
                          : r.transactionId}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {r.items.map((it) => `${it.product?.name ?? it.productId} ×${it.quantity}`).join(', ')}
                      </td>
                      <td className="px-5 py-3">
                        <EmployeeTag name={r.refundedByEmployee?.name ?? 'Unknown'} />
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-red-600">-{formatCurrency(r.total)}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => downloadRefundPdf(r.id)}
                          disabled={refundPdfPending === r.id}
                          title="Open the credit note PDF"
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                          {refundPdfPending === r.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                          {refundPdfPending === r.id ? 'Generating…' : 'PDF'}
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
        <Modal
          title="Log supplier order"
          onClose={() => {
            resetOrderForm();
            setModalOpen(false);
          }}
        >
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-500">Supplier</label>
                <button className="text-xs font-medium text-navy-700 hover:underline" onClick={() => setNewSupplierMode((v) => !v)}>
                  {newSupplierMode ? 'Choose existing' : '+ New supplier'}
                </button>
              </div>
              {newSupplierMode ? (
                <Input
                  placeholder="Supplier name"
                  value={form.newSupplierName}
                  onChange={(e) => setForm({ ...form, newSupplierName: e.target.value })}
                />
              ) : (
                <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-500">Product</label>
                <button className="text-xs font-medium text-navy-700 hover:underline" onClick={() => setNewProductMode((v) => !v)}>
                  {newProductMode ? 'Choose existing' : '+ New product'}
                </button>
              </div>
              {newProductMode ? (
                <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Brand</label>
                      <Input
                        value={form.brand}
                        onChange={(e) => setForm({ ...form, brand: e.target.value })}
                        placeholder="e.g. Royal Canin"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
                      <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                        <option value="">Select category</option>
                        {stockCategories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Product name</label>
                    <Input
                      value={form.productName}
                      onChange={(e) => setForm({ ...form, productName: e.target.value })}
                      placeholder="e.g. Adult Cat Food 2kg"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Selling price (EGP, optional)</label>
                    <Input
                      type="number"
                      value={form.unitPrice}
                      onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                      placeholder="Leave blank to price it later"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      This creates the product in the catalog. Its SKU is generated automatically. Leaving the price blank
                      saves it at EGP 0 until someone sets a real price from Products — it won't be ready to sell until then.
                    </p>
                  </div>
                </div>
              ) : (
                <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                  <option value="">Select product</option>
                  {orderableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.brand ? `${p.brand} · ${p.name}` : p.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Quantity received</label>
                <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Cost per unit (EGP)</label>
                <Input type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} />
              </div>
            </div>
            {Number(form.quantity) > 0 && Number(form.unitCost) > 0 && (
              <p className="text-xs text-slate-400">
                Total cost: {formatCurrency(Math.round(Number(form.quantity) * Number(form.unitCost) * 100))}
              </p>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Order date (optional)</label>
              <Input
                type="date"
                max={businessDayKey(new Date().toISOString())}
                value={form.receivedAt}
                onChange={(e) => setForm({ ...form, receivedAt: e.target.value })}
              />
              <p className="mt-1 text-xs text-slate-400">Leave blank to log it as received today.</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Paid with (optional)</label>
              <Select
                value={form.paymentMethod}
                onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as PaymentMethod | '' })}
              >
                <option value="">Not recorded</option>
                <option value="cash">Cash</option>
                <option value="instapay">InstaPay</option>
                <option value="card">Visa / Card</option>
              </Select>
              <p className="mt-1 text-xs text-slate-400">
                Optional here, unlike at the till — shipments are often paid later or on account, and guessing would make
                the payment breakdown wrong rather than incomplete.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Expiry date (optional)</label>
              <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
              <p className="mt-1 text-xs text-slate-400">
                Recorded against this batch, not the product — two shipments of the same item can expire on different dates.
              </p>
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  resetOrderForm();
                  setModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button onClick={submit} disabled={createSupplierOrder.isPending}>
                {createSupplierOrder.isPending ? 'Logging…' : 'Log order'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {settleModalOpen && (
        <Modal title="Settle a supplier payment" onClose={() => setSettleModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Supplier</label>
              <Select value={settleForm.supplierId} onChange={(e) => setSettleForm({ ...settleForm, supplierId: e.target.value })}>
                <option value="">Select supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {settleForm.supplierId && (
                <p className="mt-1 text-xs text-slate-400">
                  {settleTargetOwed > 0 ? `Currently owed: ${formatCurrency(settleTargetOwed)}` : 'Fully settled — nothing owed'}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Amount paid (EGP)</label>
              <Input
                type="number"
                value={settleForm.amount}
                onChange={(e) => setSettleForm({ ...settleForm, amount: e.target.value })}
                placeholder="How much was paid"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Paid with (optional)</label>
              <Select
                value={settleForm.paymentMethod}
                onChange={(e) => setSettleForm({ ...settleForm, paymentMethod: e.target.value as PaymentMethod | '' })}
              >
                <option value="">Not recorded</option>
                <option value="cash">Cash</option>
                <option value="instapay">InstaPay</option>
                <option value="card">Visa / Card</option>
              </Select>
              <p className="mt-1 text-xs text-slate-400">Just for your own record — this doesn't feed the Expenses breakdown.</p>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSettleModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitSettle} disabled={settlePayment.isPending}>
                {settlePayment.isPending ? 'Recording…' : 'Record payment'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
