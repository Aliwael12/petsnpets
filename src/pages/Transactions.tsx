import { useState } from 'react';
import { useSales } from '../api/sales';
import { useEmployees } from '../api/employees';
import { useProducts } from '../api/catalog';
import { Badge, Card, EmployeeTag, EmptyState, Select, formatCurrency, formatDateTime } from '../components/ui';

export function Transactions() {
  const { data: employees = [] } = useEmployees();
  const { data: products = [] } = useProducts({ activeOnly: false });

  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState<'all' | '7' | '30'>('all');

  const { data: sales = [] } = useSales({
    soldBy: employeeFilter === 'all' ? undefined : employeeFilter,
    sinceDays: rangeFilter === 'all' ? undefined : Number(rangeFilter),
  });

  // Filtering by product is done client-side against the already-fetched list — the API
  // supports it too, but combining it with the other two filters in one round trip isn't
  // worth a second query key for a table this size.
  const filtered = productFilter === 'all' ? sales : sales.filter((t) => t.items.some((it) => it.productId === productFilter));

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
                      {t.items.map((it) => `${it.product?.name ?? it.productId} ×${it.quantity}`).join(', ')}
                    </td>
                    <td className="px-5 py-3">
                      <EmployeeTag name={t.soldByEmployee?.name ?? 'Unknown'} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatDateTime(t.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className="font-semibold text-navy-950">{formatCurrency(t.total)}</span>
                      {!!t.discountAmount && (
                        <span className="ml-2">
                          <Badge tone="discount">-{formatCurrency(t.discountAmount)}</Badge>
                        </span>
                      )}
                    </td>
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
