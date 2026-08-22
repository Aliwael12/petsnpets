import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { Card, CardHeader, formatCurrency } from '../components/ui';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const PALETTE = ['#0a1238', '#f0c419', '#3d5ac2', '#fbe388', '#16276b', '#d9a800'];

export function Analytics() {
  const transactions = useStore((s) => s.transactions);
  const products = useStore((s) => s.products);
  const employees = useStore((s) => s.employees);

  const bestSellers = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; revenue: number }>();
    transactions.forEach((t) => {
      t.items.forEach((it) => {
        const product = products.find((p) => p.id === it.productId);
        if (!product) return;
        const entry = map.get(product.id) ?? { name: product.name, quantity: 0, revenue: 0 };
        entry.quantity += it.quantity;
        entry.revenue += it.quantity * it.unitPrice;
        map.set(product.id, entry);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [transactions, products]);

  const incomeOverTime = useMemo(() => {
    const days: { date: string; label: string; total: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push({ date: d.toDateString(), label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }), total: 0 });
    }
    transactions.forEach((t) => {
      const key = new Date(t.createdAt).toDateString();
      const day = days.find((d) => d.date === key);
      if (day) day.total += t.total;
    });
    return days;
  }, [transactions]);

  const revenueByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((t) => map.set(t.soldBy, (map.get(t.soldBy) ?? 0) + t.total));
    return employees
      .filter((e) => map.has(e.id))
      .map((e) => {
        const parts = e.name.split(' ');
        const shortName = parts[0] === 'Dr.' ? parts[1] : parts[0];
        return { name: shortName, revenue: map.get(e.id) ?? 0 };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }, [transactions, employees]);

  const revenueByCategory = useMemo(() => {
    const map = new Map<string, number>();
    transactions.forEach((t) =>
      t.items.forEach((it) => {
        const product = products.find((p) => p.id === it.productId);
        if (!product) return;
        map.set(product.category, (map.get(product.category) ?? 0) + it.quantity * it.unitPrice);
      }),
    );
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [transactions, products]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-950">Analytics</h1>
        <p className="text-sm text-slate-500">Insights generated from all recorded transactions</p>
      </div>

      <Card>
        <CardHeader title="Income over time" subtitle="Last 30 days" />
        <div className="h-72 px-3 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={incomeOverTime} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="total" name="Revenue" stroke="#101c4d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Best sellers" subtitle="By revenue" />
          <div className="h-80 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bestSellers} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 1000}k`} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" name="Revenue" fill="#f0c419" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue by employee" />
          <div className="h-80 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByEmployee} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Bar dataKey="revenue" name="Revenue" fill="#101c4d" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Revenue by category" />
        <div className="h-80 px-3 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={revenueByCategory} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {revenueByCategory.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
