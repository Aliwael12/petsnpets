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
import { DateRangePicker } from '../components/DateRangePicker';
import { useDateRangeStore } from '../store/useDateRangeStore';
import { useAuthStore } from '../store/useAuthStore';
import { canViewAllAnalytics } from '../lib/permissions';
import { formatRangeLabel } from '../lib/timezone';
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

/**
 * A bucket's axis label. `timeZone: 'UTC'` is deliberate — the key is ALREADY a Cairo day
 * key computed by the server, so re-interpreting it in Cairo would shift it a day. A bucket
 * covering more than one day (which is what a long range collapses into) names both ends,
 * and once the series crosses a year boundary every label carries its year — otherwise
 * January 2025 and January 2026 draw identical labels on the same axis.
 */
function bucketLabel(date: string, endDate: string, withYear: boolean): string {
  const one = (key: string) => {
    const [, , day] = key.split('-');
    const monthShort = new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
    return `${day} ${monthShort}${withYear ? ` ${key.slice(2, 4)}` : ''}`;
  };
  return date === endDate ? one(date) : `${one(date)}–${one(endDate)}`;
}

function shortEmployeeName(name: string): string {
  const parts = name.split(' ');
  return parts[0] === 'Dr.' ? parts[1] : parts[0];
}

export function Analytics() {
  const me = useAuthStore((s) => s.employee);
  // Without this grant every figure on the page is scoped to your own sales — by the API,
  // in SQL, not by filtering a clinic-wide answer here. The flag only decides what the page
  // offers to look at.
  const seesEveryone = canViewAllAnalytics(me);

  // The roster is employees:manage-only, so it is fetched only by people who can pick
  // someone other than themselves. Everyone else summarises their own activity.
  const { data: roster = [] } = useEmployees({ enabled: seesEveryone });
  const employees = seesEveryone ? roster : me ? [{ id: me.id, name: me.name, role: me.role }] : [];
  const [revenueView, setRevenueView] = useState<'service' | 'shop'>('service');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  // One range for every card on the page — a single card quietly on a different clock is
  // exactly the defect a shared picker exists to remove.
  const range = useDateRangeStore((s) => s.range);
  const setRange = useDateRangeStore((s) => s.setRange);
  const rangeLabel = formatRangeLabel(range);

  // Pinned to yourself when you may only see yourself — asking for a colleague's id is
  // refused by the API, so there is no point offering it.
  const employeeId = seesEveryone ? selectedEmployeeId || roster[0]?.id || '' : (me?.id ?? '');

  const { data: timeseries = [] } = useRevenueTimeseries(range);
  const { data: bestSellers = [] } = useBestSellers(range);
  const { data: revenueByEmployeeRaw = [] } = useRevenueByEmployee(range, { enabled: seesEveryone });
  const { data: revenueByCategoryRaw = [] } = useRevenueByCategory(range);
  const { data: revenueSplit } = useRevenueSplit(revenueView, range);
  const { data: employeeSummary } = useEmployeeSummary(employeeId || null, range);

  const spansYears = timeseries.length > 0 && timeseries[0].date.slice(0, 4) !== timeseries[timeseries.length - 1].endDate.slice(0, 4);
  const incomeOverTime = timeseries.map((d) => ({ label: bucketLabel(d.date, d.endDate, spansYears), total: d.total }));
  const xInterval = Math.max(0, Math.floor(incomeOverTime.length / 8));
  const revenueByEmployee = revenueByEmployeeRaw.map((e) => ({ name: shortEmployeeName(e.name), revenue: e.revenue }));
  const revenueByCategory = revenueByCategoryRaw.map((c) => ({ name: c.category, value: c.value }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Analytics</h1>
          <p className="text-sm text-slate-500">
            {seesEveryone
              ? 'Insights from every transaction in the selected dates'
              : 'Your own sales in the selected dates — ask an admin for clinic-wide figures'}
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} size="compact" />
      </div>

      <Card>
        <CardHeader title={seesEveryone ? 'Income over time' : 'Your income over time'} subtitle={rangeLabel} />
        <div className="h-72 px-3 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={incomeOverTime} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={xInterval} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `${v / 100000}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="total" name="Revenue" stroke="#101c4d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={seesEveryone ? 'Revenue by service' : 'Your revenue by service'}
          subtitle={`Clinic services vs. pet shop products — ${rangeLabel}`}
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
            label={
              seesEveryone
                ? revenueView === 'service'
                  ? 'Clinic services revenue'
                  : 'Pet shop revenue'
                : revenueView === 'service'
                  ? 'Your clinic services'
                  : 'Your pet shop sales'
            }
            value={formatCurrency(revenueSplit?.total ?? 0)}
            tone="gold"
            hint={revenueView === 'service' ? 'Sonar, shower, grooming & more' : 'Food, accessories, medicine & more'}
          />
          <div className="h-56">
            {!revenueSplit || revenueSplit.items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-400">No sales in this bucket for these dates</div>
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

      <div className={`grid grid-cols-1 gap-5 ${seesEveryone ? 'xl:grid-cols-2' : ''}`}>
        <Card>
          <CardHeader
            title={seesEveryone ? 'Best sellers' : 'Your best sellers'}
            subtitle={`By revenue · ${rangeLabel}`}
          />
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

        {seesEveryone && (
          <Card>
            <CardHeader title="Revenue by employee" subtitle={rangeLabel} />
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
        )}
      </div>

      <Card>
        <CardHeader title={seesEveryone ? 'Revenue by category' : 'Your revenue by category'} subtitle={rangeLabel} />
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
          title={seesEveryone ? 'Employee summary' : 'Your activity'}
          subtitle={`Most recent activity · ${rangeLabel}`}
          action={
            seesEveryone ? (
              <Select value={employeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} className="w-52">
                {roster.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            ) : undefined
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
        <ActivityFeed entries={employeeSummary?.activity ?? []} employees={employees} emptyTitle="No activity in these dates" />
      </Card>
    </div>
  );
}
