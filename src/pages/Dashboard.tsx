import { useStore } from '../store/useStore';
import { Card, CardHeader, EmptyState, StatTile, formatCurrency, formatDateTime } from '../components/ui';
import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Dashboard() {
  const currentUser = useStore((s) => s.currentUser());
  const transactions = useStore((s) => s.transactions);
  const products = useStore((s) => s.products);
  const employees = useStore((s) => s.employees);

  const lowStock = products.filter((p) => p.stockQuantity <= p.lowStockThreshold);
  const recent = transactions.slice(0, 8);

  const today = new Date().toDateString();
  const todaysTxns = transactions.filter((t) => new Date(t.createdAt).toDateString() === today);
  const todaysRevenue = todaysTxns.reduce((sum, t) => sum + t.total, 0);

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? 'Unknown';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-950">Welcome back, {currentUser?.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening at the store today.</p>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={18} />
          <div className="flex-1 text-sm text-red-700">
            <span className="font-medium">{lowStock.length} product{lowStock.length > 1 ? 's' : ''} low on stock:</span>{' '}
            {lowStock.map((p) => p.name).join(', ')}.{' '}
            <Link to="/products" className="underline">
              View products
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Today's sales" value={formatCurrency(todaysRevenue)} hint={`${todaysTxns.length} transactions`} tone="gold" />
        <StatTile label="Products low on stock" value={String(lowStock.length)} tone={lowStock.length ? 'warn' : 'default'} />
        <StatTile label="Total products" value={String(products.length)} />
      </div>

      <Card>
        <CardHeader title="Recent transactions" subtitle="Latest sales across the store" />
        {recent.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-navy-950">{t.customerName}</p>
                  <p className="text-xs text-slate-400">
                    {employeeName(t.soldBy)} &middot; {formatDateTime(t.createdAt)}
                  </p>
                </div>
                <p className="font-semibold text-navy-950">{formatCurrency(t.total)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
