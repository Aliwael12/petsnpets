import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { Card, EmptyState, Select, formatCurrency, formatDateTime } from '../components/ui';

export function Transactions() {
  const transactions = useStore((s) => s.transactions);
  const employees = useStore((s) => s.employees);
  const products = useStore((s) => s.products);

  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState<'all' | '7' | '30'>('all');

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? 'Unknown';
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const filtered = useMemo(() => {
    const cutoff = rangeFilter === 'all' ? null : Date.now() - Number(rangeFilter) * 24 * 60 * 60 * 1000;
    return transactions.filter((t) => {
      if (employeeFilter !== 'all' && t.soldBy !== employeeFilter) return false;
      if (productFilter !== 'all' && !t.items.some((it) => it.productId === productFilter)) return false;
      if (cutoff && new Date(t.createdAt).getTime() < cutoff) return false;
      return true;
    });
  }, [transactions, employeeFilter, productFilter, rangeFilter]);

  const total = filtered.reduce((sum, t) => sum + t.total, 0);

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
        <Select value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value as any)} className="w-40">
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
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium">Sold by</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-medium text-navy-950">{t.customerName}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {t.items.map((it) => `${productName(it.productId)} ×${it.quantity}`).join(', ')}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{employeeName(t.soldBy)}</td>
                    <td className="px-5 py-3 text-slate-500">{formatDateTime(t.createdAt)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-navy-950">{formatCurrency(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
