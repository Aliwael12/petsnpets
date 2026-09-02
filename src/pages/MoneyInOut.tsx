import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSales } from '../api/sales';
import { useRefunds } from '../api/refunds';
import { useCreateSupplierOrder, useSupplierOrders, useSuppliers } from '../api/purchasing';
import { useCategories, useProducts } from '../api/catalog';
import { openRefundInvoice } from '../api/invoices';
import { ApiError } from '../api/client';
import { businessDayKey, lastBusinessDays } from '../lib/timezone';
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

type Range = 'all' | '7' | '30' | 'custom';

const emptyOrderForm = {
  supplierId: '',
  newSupplierName: '',
  productId: '',
  brand: '',
  category: '',
  productName: '',
  unitPrice: '',
  quantity: '',
  costTotal: '',
  expiryDate: '',
};

/** How soon a batch has to expire before the table flags it. */
const EXPIRY_WARNING_DAYS = 60;

export function MoneyInOut() {
  const [range, setRange] = useState<Range>('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('all');

  // A custom range needs the unbounded set so it can be sliced client-side; the preset
  // ranges still push their window down to the API.
  const sinceDays = range === '7' || range === '30' ? Number(range) : undefined;

  const { data: sales = [] } = useSales({ sinceDays });
  const { data: supplierOrders = [] } = useSupplierOrders();
  const { data: refunds = [] } = useRefunds();
  const { data: suppliers = [] } = useSuppliers();
  const { data: categories = [] } = useCategories();
  const { data: products = [] } = useProducts({ activeOnly: false });
  const createSupplierOrder = useCreateSupplierOrder();

  const orderableProducts = products.filter((p) => p.kind !== 'service');
  const stockCategories = categories.filter((c) => c.active && c.kind !== 'service');

  const [modalOpen, setModalOpen] = useState(false);
  const [newSupplierMode, setNewSupplierMode] = useState(false);
  const [newProductMode, setNewProductMode] = useState(false);
  const [form, setForm] = useState(emptyOrderForm);
  const [refundPdfPending, setRefundPdfPending] = useState<string | null>(null);

  // One predicate drives every list and the totals, so the stat tiles can never disagree
  // with the tables underneath them.
  const inRange = useMemo(() => {
    if (range === 'custom') {
      const fromKey = customFrom || null;
      const toKey = customTo || null;
      return (iso: string) => {
        const key = businessDayKey(iso);
        if (fromKey && key < fromKey) return false;
        if (toKey && key > toKey) return false;
        return true;
      };
    }
    if (!sinceDays) return () => true;
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
    return (iso: string) => +new Date(iso) >= cutoff;
  }, [range, customFrom, customTo, sinceDays]);

  const matchesSupplier = (supplierId: string) => supplierFilter === 'all' || supplierId === supplierFilter;

  const filteredSales = sales.filter((t) => inRange(t.createdAt));
  const filteredOrders = supplierOrders.filter((o) => inRange(o.receivedAt) && matchesSupplier(o.supplierId));
  const filteredRefunds = refunds.filter((r) => inRange(r.createdAt));

  // Money in is sales only, so a supplier filter — which is a property of purchases —
  // deliberately doesn't touch it. Narrowing "money in" by supplier would be meaningless.
  const moneyIn = filteredSales.reduce((sum, t) => sum + t.total, 0);
  const supplierCost = filteredOrders.reduce((sum, o) => sum + o.costTotal, 0);
  const refundCost = filteredRefunds.reduce((sum, r) => sum + r.total, 0);
  const moneyOut = supplierCost + refundCost;
  const net = moneyIn - moneyOut;

  const chartData = useMemo(() => {
    const days = range === '7' ? 7 : 30;
    const keys = lastBusinessDays(days);
    const byKey = new Map(keys.map((k) => [k, { label: k.slice(5), in: 0, out: 0 }]));

    filteredSales.forEach((t) => {
      const bucket = byKey.get(businessDayKey(t.createdAt));
      if (bucket) bucket.in += t.total;
    });
    filteredOrders.forEach((o) => {
      const bucket = byKey.get(businessDayKey(o.receivedAt));
      if (bucket) bucket.out += o.costTotal;
    });
    filteredRefunds.forEach((r) => {
      const bucket = byKey.get(businessDayKey(r.createdAt));
      if (bucket) bucket.out += r.total;
    });
    return keys.map((k) => byKey.get(k)!);
  }, [filteredSales, filteredOrders, filteredRefunds, range]);

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
      if (!form.unitPrice) {
        toast.error('Set a selling price for the new product');
        return;
      }
    } else if (!form.productId) {
      toast.error('Select a product');
      return;
    }
    if (!form.quantity || !form.costTotal) {
      toast.error('Quantity and total cost are required');
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
              unitPrice: Math.round(Number(form.unitPrice) * 100),
            }
          : undefined,
        quantity: Number(form.quantity),
        costTotal: Math.round(Number(form.costTotal) * 100),
        // A date input gives a bare calendar day; send it as an instant so the API's
        // ISO-datetime validation accepts it.
        expiryDate: form.expiryDate ? new Date(`${form.expiryDate}T00:00:00Z`).toISOString() : undefined,
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

  const todayKey = businessDayKey(new Date().toISOString());
  const warnKey = businessDayKey(new Date(Date.now() + EXPIRY_WARNING_DAYS * 86_400_000).toISOString());

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Money in / out</h1>
          <p className="text-sm text-slate-500">Sales income vs. supplier costs</p>
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
          <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-40">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
            <option value="custom">Custom range…</option>
          </Select>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Log supplier order
          </Button>
        </div>
      </div>

      {range === 'custom' && (
        <Card>
          <div className="flex flex-wrap items-end gap-3 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
              <Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
              <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setCustomFrom('');
                setCustomTo('');
              }}
            >
              Clear
            </Button>
            <p className="text-xs text-slate-400">
              Leave either side empty for an open-ended range. Dates are read in the clinic&apos;s timezone.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Money in" value={formatCurrency(moneyIn)} tone="gold" hint={`${filteredSales.length} sales`} />
        <StatTile
          label="Money out"
          value={formatCurrency(moneyOut)}
          hint={`${filteredOrders.length} orders · ${filteredRefunds.length} refunds`}
        />
        <StatTile label="Net" value={formatCurrency(net)} tone={net < 0 ? 'warn' : 'default'} />
      </div>

      {range !== 'custom' && (
        <Card>
          <CardHeader title="Cash flow" subtitle="Daily money in vs. out" />
          <div className="h-72 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={range === '7' ? 0 : 4} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 100000}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend />
                <Bar dataKey="in" name="Money in" fill="#f0c419" radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" name="Money out" fill="#101c4d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Supplier order history"
          subtitle={supplierFilter === 'all' ? undefined : suppliers.find((s) => s.id === supplierFilter)?.name}
        />
        {filteredOrders.length === 0 ? (
          <EmptyState title="No supplier orders match these filters" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Supplier</th>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Qty</th>
                  <th className="px-5 py-3 font-medium">Expires</th>
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
        <CardHeader title="Refund history" />
        {filteredRefunds.length === 0 ? (
          <EmptyState title="No refunds in this range" />
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
                {filteredRefunds
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
                    <label className="mb-1 block text-xs font-medium text-slate-500">Selling price (EGP)</label>
                    <Input
                      type="number"
                      value={form.unitPrice}
                      onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                      placeholder="What you'll sell it for"
                    />
                    <p className="mt-1 text-xs text-slate-400">
                      This creates the product in the catalog. Its SKU is generated automatically and can be edited later
                      from Products.
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
                <label className="mb-1 block text-xs font-medium text-slate-500">Total cost (EGP)</label>
                <Input type="number" value={form.costTotal} onChange={(e) => setForm({ ...form, costTotal: e.target.value })} />
              </div>
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
    </div>
  );
}
