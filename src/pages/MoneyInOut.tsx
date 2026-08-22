import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Button, Card, CardHeader, EmptyState, Input, Modal, Select, StatTile, formatCurrency, formatDate } from '../components/ui';
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
  const transactions = useStore((s) => s.transactions);
  const supplierOrders = useStore((s) => s.supplierOrders);
  const suppliers = useStore((s) => s.suppliers);
  const products = useStore((s) => s.products);
  const currentUser = useStore((s) => s.currentUser());
  const addSupplierOrder = useStore((s) => s.addSupplierOrder);
  const addSupplier = useStore((s) => s.addSupplier);

  const [range, setRange] = useState<Range>('30');
  const [modalOpen, setModalOpen] = useState(false);
  const [newSupplierMode, setNewSupplierMode] = useState(false);
  const [form, setForm] = useState({ supplierId: '', newSupplierName: '', productId: '', quantity: '', costTotal: '' });

  const cutoff = range === 'all' ? null : Date.now() - Number(range) * 24 * 60 * 60 * 1000;

  const filteredTxns = useMemo(
    () => transactions.filter((t) => !cutoff || new Date(t.createdAt).getTime() >= cutoff),
    [transactions, cutoff],
  );
  const filteredOrders = useMemo(
    () => supplierOrders.filter((o) => !cutoff || new Date(o.receivedAt).getTime() >= cutoff),
    [supplierOrders, cutoff],
  );

  const moneyIn = filteredTxns.reduce((sum, t) => sum + t.total, 0);
  const moneyOut = filteredOrders.reduce((sum, o) => sum + o.costTotal, 0);
  const net = moneyIn - moneyOut;

  const chartData = useMemo(() => {
    const days = range === '7' ? 7 : 30;
    const list: { label: string; date: string; in: number; out: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      list.push({ date: d.toDateString(), label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), in: 0, out: 0 });
    }
    transactions.forEach((t) => {
      const key = new Date(t.createdAt).toDateString();
      const day = list.find((d) => d.date === key);
      if (day) day.in += t.total;
    });
    supplierOrders.forEach((o) => {
      const key = new Date(o.receivedAt).toDateString();
      const day = list.find((d) => d.date === key);
      if (day) day.out += o.costTotal;
    });
    return list;
  }, [transactions, supplierOrders, range]);

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? 'Unknown';
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const submit = () => {
    if (!currentUser) return;
    let supplierId = form.supplierId;
    if (newSupplierMode) {
      if (!form.newSupplierName.trim()) {
        toast.error('Supplier name is required');
        return;
      }
      const supplier = addSupplier({ name: form.newSupplierName.trim(), contactInfo: '' });
      supplierId = supplier.id;
    }
    if (!supplierId || !form.productId || !form.quantity || !form.costTotal) {
      toast.error('Please fill in all fields');
      return;
    }
    addSupplierOrder({
      supplierId,
      productId: form.productId,
      quantity: Number(form.quantity),
      costTotal: Number(form.costTotal),
      loggedBy: currentUser.id,
      receivedAt: new Date().toISOString(),
    });
    toast.success('Supplier order logged');
    setForm({ supplierId: '', newSupplierName: '', productId: '', quantity: '', costTotal: '' });
    setNewSupplierMode(false);
    setModalOpen(false);
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
        <StatTile label="Money in" value={formatCurrency(moneyIn)} tone="gold" hint={`${filteredTxns.length} sales`} />
        <StatTile label="Money out" value={formatCurrency(moneyOut)} hint={`${filteredOrders.length} supplier orders`} />
        <StatTile label="Net" value={formatCurrency(net)} tone={net < 0 ? 'warn' : 'default'} />
      </div>

      <Card>
        <CardHeader title="Cash flow" subtitle="Daily money in vs. out" />
        <div className="h-72 px-3 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={range === '7' ? 0 : 4} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 1000}k`} />
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
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders
                  .slice()
                  .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
                  .map((o) => (
                    <tr key={o.id}>
                      <td className="px-5 py-3 font-medium text-navy-950">{supplierName(o.supplierId)}</td>
                      <td className="px-5 py-3 text-slate-600">{productName(o.productId)}</td>
                      <td className="px-5 py-3 text-slate-600">{o.quantity}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(o.receivedAt)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-navy-950">{formatCurrency(o.costTotal)}</td>
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
                {products.map((p) => (
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
              <Button onClick={submit}>Log order</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
