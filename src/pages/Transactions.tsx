import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSales } from '../api/sales';
import { useEmployees } from '../api/employees';
import { useProducts } from '../api/catalog';
import { openInvoice } from '../api/invoices';
import { ApiError } from '../api/client';
import { Badge, Card, EmployeeTag, EmptyState, Select, formatCurrency, formatDateTime } from '../components/ui';
import { FileText, Loader2 } from 'lucide-react';
import { PAYMENT_METHOD_LABELS } from '../types';

export function Transactions() {
  const { data: employees = [] } = useEmployees();
  const { data: products = [] } = useProducts({ activeOnly: false });

  const [employeeFilter, setEmployeeFilter] = useState('all');
  // Tracks which row's PDF is being generated so only that button shows a spinner —
  // the first request for a given sale renders the PDF server-side and can take a moment.
  const [invoicePending, setInvoicePending] = useState<string | null>(null);
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
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium">Paid with</th>
                  <th className="px-5 py-3 font-medium">Sold by</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium text-right">Total</th>
                  <th className="px-5 py-3 font-medium text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-medium text-navy-950">{t.customerName}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {t.items.map((it) => `${it.product?.name ?? it.productId} ×${it.quantity}`).join(', ')}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                      {t.paymentMethod ? PAYMENT_METHOD_LABELS[t.paymentMethod] : <span className="text-slate-300">—</span>}
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
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => downloadInvoice(t.id)}
                        disabled={invoicePending === t.id}
                        title={`Open invoice INV-${t.invoiceYear}-${String(t.invoiceNo).padStart(5, '0')}`}
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
    </div>
  );
}
