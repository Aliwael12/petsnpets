import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSales } from '../api/sales';
import { useRefunds } from '../api/refunds';
import { useCreateSupplierOrder, useSupplierOrders, useSuppliers } from '../api/purchasing';
import { useProducts } from '../api/catalog';
import { ApiError } from '../api/client';
import { businessDayKey, lastBusinessDays } from '../lib/timezone';
import { Button, Card, CardHeader, EmployeeTag, EmptyState, Input, Modal, Select, StatTile, formatCurrency, formatDate } from '../components/ui';
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
import { Plus } from 'lucide-react';

type Range = 'all' | '7' | '30';

export function MoneyInOut() {
  const [range, setRange] = useState<Range>('30');
  const sinceDays = range === 'all' ? undefined : Number(range);

  const { data: sales = [] } = useSales({ sinceDays });
  const { data: supplierOrders = [] } = useSupplierOrders();
  const { data: refunds = [] } = useRefunds();
  const { data: suppliers = [] } = useSuppliers();
  const { data: products = [] } = useProducts({ activeOnly: false });
  const createSupplierOrder = useCreateSupplierOrder();

  const orderableProducts = products.filter((p) => p.category !== 'service');

  const [modalOpen, setModalOpen] = useState(false);
  const [newSupplierMode, setNewSupplierMode] = useState(false);
  const [form, setForm] = useState({ supplierId: '', newSupplierName: '', productId: '', quantity: '', costTotal: '' });

  const cutoff = sinceDays ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : null;
  const filteredOrders = supplierOrders.filter((o) => !cutoff || +new Date(o.receivedAt) >= cutoff);
  const filteredRefunds = refunds.filter((r) => !cutoff || +new Date(r.createdAt) >= cutoff);

  const moneyIn = sales.reduce((sum, t) => sum + t.total, 0);
  const supplierCost = filteredOrders.reduce((sum, o) => sum + o.costTotal, 0);
  const refundCost = filteredRefunds.reduce((sum, r) => sum + r.total, 0);
  const moneyOut = supplierCost + refundCost;
  const net = moneyIn - moneyOut;

  const chartData = useMemo(() => {
    const days = range === '7' ? 7 : 30;
    const keys = lastBusinessDays(days);
    const byKey = new Map(keys.map((k) => [k, { label: k.slice(5), in: 0, out: 0 }]));

    sales.forEach((t) => {
      const bucket = byKey.get(businessDayKey(t.createdAt));
      if (bucket) bucket.in += t.total;
    });
    supplierOrders.forEach((o) => {
      const bucket = byKey.get(businessDayKey(o.receivedAt));
      if (bucket) bucket.out += o.costTotal;
    });
    refunds.forEach((r) => {
      const bucket = byKey.get(businessDayKey(r.createdAt));
      if (bucket) bucket.out += r.total;
    });
    return keys.map((k) => byKey.get(k)!);
  }, [sales, supplierOrders, refunds, range]);

  const submit = () => {
    if (newSupplierMode && !form.newSupplierName.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    if (!newSupplierMode && !form.supplierId) {
      toast.error('Select a supplier');
      return;
    }
    if (!form.productId || !form.quantity || !form.costTotal) {
      toast.error('Please fill in all fields');
      return;
    }
    createSupplierOrder.mutate(
      {
        supplierId: newSupplierMode ? undefined : form.supplierId,
        newSupplierName: newSupplierMode ? form.newSupplierName.trim() : undefined,
        productId: form.productId,
        quantity: Number(form.quantity),
        costTotal: Math.round(Number(form.costTotal) * 100),
      },
      {
        onSuccess: () => {
          toast.success('Supplier order logged');
          setForm({ supplierId: '', newSupplierName: '', productId: '', quantity: '', costTotal: '' });
          setNewSupplierMode(false);
          setModalOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not log supplier order'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Money in / out</h1>
          <p className="text-sm text-slate-500">Sales income vs. supplier costs</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onChange={(e) => setRange(e.target.value as Range)} className="w-40">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="all">All time</option>
          </Select>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Log supplier order
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Money in" value={formatCurrency(moneyIn)} tone="gold" hint={`${sales.length} sales`} />
        <StatTile label="Money out" value={formatCurrency(moneyOut)} hint={`${filteredOrders.length} orders · ${filteredRefunds.length} refunds`} />
        <StatTile label="Net" value={formatCurrency(net)} tone={net < 0 ? 'warn' : 'default'} />
      </div>

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

      <Card>
        <CardHeader title="Supplier order history" />
        {filteredOrders.length === 0 ? (
          <EmptyState title="No supplier orders in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Supplier</th>
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">Qty</th>
                  <th className="px-5 py-3 font-medium">Logged by</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders
                  .slice()
                  .sort((a, b) => +new Date(b.receivedAt) - +new Date(a.receivedAt))
                  .map((o) => (
                    <tr key={o.id}>
                      <td className="px-5 py-3 font-medium text-navy-950">{o.supplier?.name ?? 'Unknown'}</td>
                      <td className="px-5 py-3 text-slate-600">{o.product?.name ?? o.productId}</td>
                      <td className="px-5 py-3 text-slate-600">{o.quantity}</td>
                      <td className="px-5 py-3">
                        <EmployeeTag name={o.loggedByEmployee?.name ?? 'Unknown'} />
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(o.receivedAt)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy-950">{formatCurrency(o.costTotal)}</td>
                    </tr>
                  ))}
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRefunds
                  .slice()
                  .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
                  .map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium text-navy-950">
                        {r.transaction ? `INV-${r.transaction.invoiceYear}-${String(r.transaction.invoiceNo).padStart(5, '0')}` : r.transactionId}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {r.items.map((it) => `${it.product?.name ?? it.productId} ×${it.quantity}`).join(', ')}
                      </td>
                      <td className="px-5 py-3">
                        <EmployeeTag name={r.refundedByEmployee?.name ?? 'Unknown'} />
                      </td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(r.createdAt)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-red-600">-{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title="Log supplier order" onClose={() => setModalOpen(false)}>
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
              <label className="mb-1 block text-xs font-medium text-slate-500">Product</label>
              <Select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
                <option value="">Select product</option>
                {orderableProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
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
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
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
