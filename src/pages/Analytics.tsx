import { useState } from 'react';
import { useEmployees } from '../api/employees';
import {
  useBestSellers,
  useEmployeeSummary,
  useRevenueByCategory,
  useRevenueByEmployee,
  useRevenueSplit,
  useRevenueTimeseries,
} from '../api/analytics';
import { ActivityFeed } from '../components/ActivityFeed';
import { Card, CardHeader, Select, StatTile, TabSwitch, formatCurrency } from '../components/ui';
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

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function dayLabel(isoDate: string): string {
  const [, , day] = isoDate.split('-');
  const monthShort = new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return `${day} ${monthShort}`;
}

function shortEmployeeName(name: string): string {
  const parts = name.split(' ');
  return parts[0] === 'Dr.' ? parts[1] : parts[0];
}

export function Analytics() {
  const { data: employees = [] } = useEmployees();
  const [revenueView, setRevenueView] = useState<'service' | 'shop'>('service');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const employeeId = selectedEmployeeId || employees[0]?.id || '';

  const { data: timeseries = [] } = useRevenueTimeseries(30);
  const { data: bestSellers = [] } = useBestSellers();
  const { data: revenueByEmployeeRaw = [] } = useRevenueByEmployee();
  const { data: revenueByCategoryRaw = [] } = useRevenueByCategory();
  const { data: revenueSplit } = useRevenueSplit(revenueView);
  const { data: employeeSummary } = useEmployeeSummary(employeeId || null);

  const incomeOverTime = timeseries.map((d) => ({ label: dayLabel(d.date), total: d.total }));
  const revenueByEmployee = revenueByEmployeeRaw.map((e) => ({ name: shortEmployeeName(e.name), revenue: e.revenue }));
  const revenueByCategory = revenueByCategoryRaw.map((c) => ({ name: c.category, value: c.value }));

  const monthLabel = employeeSummary ? `${monthNames[employeeSummary.month - 1]} ${employeeSummary.year}` : '';

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
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 100000}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="total" name="Revenue" stroke="#101c4d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Revenue by service"
          subtitle="Clinic services vs. pet shop products — all time"
          action={
            <TabSwitch
              value={revenueView}
              onChange={setRevenueView}
              options={[
                { value: 'service', label: 'Clinic services' },
                { value: 'shop', label: 'Pet shop' },
              ]}
            />
          }
        />
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-[200px_1fr]">
          <StatTile
            label={revenueView === 'service' ? 'Clinic services revenue' : 'Pet shop revenue'}
            value={formatCurrency(revenueSplit?.total ?? 0)}
            tone="gold"
            hint={revenueView === 'service' ? 'Sonar, shower, grooming & more' : 'Food, accessories, medicine & more'}
          />
          <div className="h-56">
            {!revenueSplit || revenueSplit.items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">No sales in this bucket yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueSplit.items} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 100000}k`} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="revenue" name="Revenue" fill="#f0c419" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Best sellers" subtitle="By revenue" />
          <div className="h-80 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bestSellers} layout="vertical" margin={{ left: 24, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 100000}k`} />
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
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 100000}k`} />
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

      <Card>
        <CardHeader
          title="Employee summary"
          subtitle={monthLabel ? `Everything this employee did in ${monthLabel}` : undefined}
          action={
            <Select value={employeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="w-52">
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          }
        />
        {employeeSummary && (
          <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Sales" value={String(employeeSummary.stats.sales.count)} hint={formatCurrency(employeeSummary.stats.sales.revenue)} tone="gold" />
            <StatTile label="Refunds" value={String(employeeSummary.stats.refunds.count)} hint={formatCurrency(employeeSummary.stats.refunds.amount)} />
            <StatTile label="Pet logs" value={String(employeeSummary.stats.petLogs.count)} />
            <StatTile label="Shipments logged" value={String(employeeSummary.stats.supplierOrders.count)} hint={formatCurrency(employeeSummary.stats.supplierOrders.cost)} />
            <StatTile label="Discounts created" value={String(employeeSummary.stats.discounts.count)} />
          </div>
        )}
        <ActivityFeed entries={employeeSummary?.activity ?? []} employees={employees} emptyTitle="No activity this month" />
      </Card>
    </div>
  );
}
