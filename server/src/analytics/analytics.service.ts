import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, lt, sql as rawSql } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { discounts, petLogs, refunds, supplierOrders, transactions } from '../db/schema';
import type { ActivityEntry } from './activity.types';
import type { FinancialSummary, FinancialWindow, MethodBreakdown, PaymentBucket } from './financial-summary.types';

const PAYMENT_BUCKETS: PaymentBucket[] = ['cash', 'instapay', 'card', 'unrecorded'];
const emptyBreakdown = (): MethodBreakdown => ({ cash: 0, instapay: 0, card: 0, unrecorded: 0 });

/** Money sums are cast to ::bigint in SQL, not ::int, because int4 tops out at
 * 21,474,836.47 EGP — a ceiling a clinic's all-time revenue genuinely reaches, and
 * hitting it would be a query error rather than a wrong number. postgres-js hands
 * bigint back as a string, so it has to come through Number() here. */
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

@Injectable()
export class AnalyticsService {
  private readonly tz: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    config: ConfigService,
  ) {
    this.tz = config.getOrThrow<string>('TIMEZONE');
  }

  /** Daily revenue for the last N days, bucketed in the business's own timezone — not UTC,
   * and never the caller's browser timezone (the bug this replaces: the frontend used
   * to compute "today" with `new Date()` in whatever zone the viewer happened to be in). */
  async revenueTimeseries(days: number) {
    return this.db.execute<{ date: string; total: number }>(rawSql`
      with bounds as (
        select date_trunc('day', now() at time zone ${this.tz}) as today
      ),
      series as (
        select generate_series((select today from bounds) - ((${days} - 1) || ' days')::interval, (select today from bounds), '1 day') as day
      )
      select
        to_char(s.day, 'YYYY-MM-DD') as date,
        coalesce(sum(t.total), 0)::bigint::int as total
      from series s
      left join transactions t
        on date_trunc('day', t.created_at at time zone ${this.tz}) = s.day
      group by s.day
      order by s.day
    `);
  }

  async bestSellers(limit = 8) {
    return this.db.execute<{ id: string; name: string; quantity: number; revenue: number }>(rawSql`
      select p.id, p.name, sum(ti.quantity)::int as quantity, sum(ti.quantity * ti.unit_price)::bigint::int as revenue
      from transaction_items ti
      join products p on p.id = ti.product_id
      group by p.id, p.name
      order by revenue desc
      limit ${limit}
    `);
  }

  async revenueByEmployee() {
    return this.db.execute<{ id: string; name: string; revenue: number }>(rawSql`
      select e.id, e.name, sum(t.total)::bigint::int as revenue
      from transactions t
      join employees e on e.id = t.sold_by
      group by e.id, e.name
      order by revenue desc
    `);
  }

  async revenueByCategory() {
    return this.db.execute<{ category: string; value: number }>(rawSql`
      select p.category, sum(ti.quantity * ti.unit_price)::bigint::int as value
      from transaction_items ti
      join products p on p.id = ti.product_id
      group by p.category
    `);
  }

  /** "Clinic services" vs. "pet shop" — the split is purely `products.category = 'service'`
   * vs. everything else, matching how catalog.products.service.dto derives `kind`. */
  async revenueSplit(kind: 'service' | 'shop') {
    const isService = kind === 'service';
    const rows = await this.db.execute<{ id: string; name: string; revenue: number }>(rawSql`
      select p.id, p.name, sum(ti.quantity * ti.unit_price)::bigint::int as revenue
      from transaction_items ti
      join products p on p.id = ti.product_id
      where (p.category = 'service') = ${isService}
      group by p.id, p.name
      order by revenue desc
    `);
    const total = rows.reduce((sum, r) => sum + r.revenue, 0);
    return { total, items: rows.slice(0, 8) };
  }

  async employeeSummary(employeeId: string, year?: number, month?: number) {
    const { start, end, resolvedYear, resolvedMonth } = await this.resolveMonthBounds(year, month);

    const [sales, refundRows, petLogRows, supplierOrderRows, discountRows] = await Promise.all([
      this.db
        .select()
        .from(transactions)
        .where(and(eq(transactions.soldBy, employeeId), gte(transactions.createdAt, start), lt(transactions.createdAt, end))),
      this.db
        .select()
        .from(refunds)
        .where(and(eq(refunds.refundedBy, employeeId), gte(refunds.createdAt, start), lt(refunds.createdAt, end))),
      this.db
        .select()
        .from(petLogs)
        .where(and(eq(petLogs.performedBy, employeeId), gte(petLogs.performedAt, start), lt(petLogs.performedAt, end))),
      this.db
        .select()
        .from(supplierOrders)
        .where(and(eq(supplierOrders.loggedBy, employeeId), gte(supplierOrders.receivedAt, start), lt(supplierOrders.receivedAt, end))),
      this.db
        .select()
        .from(discounts)
        .where(and(eq(discounts.createdBy, employeeId), gte(discounts.createdAt, start), lt(discounts.createdAt, end))),
    ]);

    const salesRevenue = sales.reduce((sum, t) => sum + t.total, 0);
    const refundsAmount = refundRows.reduce((sum, r) => sum + r.total, 0);
    const ordersCost = supplierOrderRows.reduce((sum, o) => sum + o.costTotal, 0);

    const activity = await this.buildActivityFeed(employeeId, start, end);

    return {
      year: resolvedYear,
      month: resolvedMonth,
      stats: {
        sales: { count: sales.length, revenue: salesRevenue },
        refunds: { count: refundRows.length, amount: refundsAmount },
        petLogs: { count: petLogRows.length },
        supplierOrders: { count: supplierOrderRows.length, cost: ordersCost },
        discounts: { count: discountRows.length },
      },
      activity,
    };
  }

  /**
   * Every figure behind the dashboard's Income / Expenses / Net cards, for the current
   * month and for all time, in one round trip.
   *
   * The model, stated once so nothing downstream has to guess:
   *   income   = sales - refunds          (a refund is contra-revenue, NEVER an expense —
   *                                        counting it as one would subtract the same money
   *                                        from Net twice)
   *   expenses = supplier shipments + operating expenses
   *   net      = income - expenses
   *
   * Sales and refunds bucket on created_at in the clinic's timezone; supplier orders on
   * received_at; operating expenses on paid_on, which is already a Cairo calendar date
   * (a receipt's own date, routinely backdated) and so takes date bounds, not instants.
   */
  async financialSummary(year?: number, month?: number): Promise<FinancialSummary> {
    const { resolvedYear, resolvedMonth } = await this.resolveMonthBounds(year, month);

    const rows = await this.db.execute<{
      win: 'month' | 'all';
      stream: 'sales' | 'refunds' | 'stock' | 'operating';
      method: string | null;
      amount: string | number;
    }>(rawSql`
      with b as (
        select
          (make_date(${resolvedYear}, ${resolvedMonth}, 1)::timestamp at time zone ${this.tz}) as ts_start,
          ((make_date(${resolvedYear}, ${resolvedMonth}, 1) + interval '1 month')::timestamp at time zone ${this.tz}) as ts_end,
          make_date(${resolvedYear}, ${resolvedMonth}, 1) as d_start,
          (make_date(${resolvedYear}, ${resolvedMonth}, 1) + interval '1 month')::date as d_end
      )
      select 'month' as win, 'sales' as stream, t.payment_method::text as method, sum(t.total)::bigint as amount
        from transactions t, b where t.created_at >= b.ts_start and t.created_at < b.ts_end group by t.payment_method
      union all
      select 'all', 'sales', t.payment_method::text, sum(t.total)::bigint from transactions t group by t.payment_method
      union all
      select 'month', 'refunds', r.payment_method::text, sum(r.total)::bigint
        from refunds r, b where r.created_at >= b.ts_start and r.created_at < b.ts_end group by r.payment_method
      union all
      select 'all', 'refunds', r.payment_method::text, sum(r.total)::bigint from refunds r group by r.payment_method
      union all
      select 'month', 'stock', o.payment_method::text, sum(o.cost_total)::bigint
        from supplier_orders o, b where o.received_at >= b.ts_start and o.received_at < b.ts_end group by o.payment_method
      union all
      select 'all', 'stock', o.payment_method::text, sum(o.cost_total)::bigint from supplier_orders o group by o.payment_method
      union all
      select 'month', 'operating', e.payment_method::text, sum(e.amount)::bigint
        from expenses e, b
        where e.voided_at is null and e.paid_on >= b.d_start and e.paid_on < b.d_end group by e.payment_method
      union all
      select 'all', 'operating', e.payment_method::text, sum(e.amount)::bigint
        from expenses e where e.voided_at is null group by e.payment_method
    `);

    return {
      month: { year: resolvedYear, month: resolvedMonth, ...this.foldWindow(rows, 'month') },
      allTime: this.foldWindow(rows, 'all'),
    };
  }

  private foldWindow(
    rows: { win: string; stream: string; method: string | null; amount: string | number }[],
    win: 'month' | 'all',
  ): FinancialWindow {
    const incomeByMethod = emptyBreakdown();
    const expensesByMethod = emptyBreakdown();
    let gross = 0;
    let refunded = 0;
    let stock = 0;
    let operating = 0;

    for (const row of rows) {
      if (row.win !== win) continue;
      const amount = num(row.amount);
      // A method Postgres reports that this build doesn't know about would otherwise land
      // on an undefined key and turn the whole breakdown into NaN.
      const bucket = (PAYMENT_BUCKETS as string[]).includes(row.method ?? '')
        ? (row.method as PaymentBucket)
        : 'unrecorded';

      switch (row.stream) {
        case 'sales':
          gross += amount;
          incomeByMethod[bucket] += amount;
          break;
        case 'refunds':
          // Subtracted from the method it was actually paid back through, so the
          // breakdown still sums to net income rather than merely resembling it.
          refunded += amount;
          incomeByMethod[bucket] -= amount;
          break;
        case 'stock':
          stock += amount;
          expensesByMethod[bucket] += amount;
          break;
        case 'operating':
          operating += amount;
          expensesByMethod[bucket] += amount;
          break;
      }
    }

    const netIncome = gross - refunded;
    const totalExpenses = stock + operating;
    return {
      income: { gross, refunds: refunded, net: netIncome, byMethod: incomeByMethod },
      expenses: { stock, operating, total: totalExpenses, byMethod: expensesByMethod },
      net: netIncome - totalExpenses,
    };
  }

  private async resolveMonthBounds(year?: number, month?: number) {
    if (year && month) {
      const [row] = await this.db.execute<{ start_at: Date; end_at: Date }>(rawSql`
        select
          (make_date(${year}, ${month}, 1)::timestamp at time zone ${this.tz}) as start_at,
          ((make_date(${year}, ${month}, 1) + interval '1 month')::timestamp at time zone ${this.tz}) as end_at
      `);
      // The driver doesn't guarantee these computed timestamptz expressions come back as
      // real Date instances (unlike a plain column read) — coerce explicitly, since
      // Drizzle's query-builder column mapping (gte/lt below) calls .toISOString() on them.
      return { start: new Date(row.start_at), end: new Date(row.end_at), resolvedYear: year, resolvedMonth: month };
    }

    const [row] = await this.db.execute<{ cairo_year: number; cairo_month: number; start_at: Date; end_at: Date }>(rawSql`
      with now_local as (
        select now() at time zone ${this.tz} as t
      )
      select
        extract(year from t)::int as cairo_year,
        extract(month from t)::int as cairo_month,
        (date_trunc('month', t)::timestamp at time zone ${this.tz}) as start_at,
        ((date_trunc('month', t) + interval '1 month')::timestamp at time zone ${this.tz}) as end_at
      from now_local
    `);
    return {
      start: new Date(row.start_at),
      end: new Date(row.end_at),
      resolvedYear: row.cairo_year,
      resolvedMonth: row.cairo_month,
    };
  }

  /** Mirrors the shape of the frontend's src/lib/activity.ts buildActivity() so the
   * ActivityFeed component can render this response without changes. */
  private async buildActivityFeed(employeeId: string, startDate: Date, endDate: Date): Promise<ActivityEntry[]> {
    // Drizzle's generic sql`` template (unlike the postgres-js driver's own tag function,
    // or Drizzle's typed column comparators like gte()) does not serialize a raw JS Date
    // into a bindable parameter — it passes it through as-is and the driver's bind step
    // throws. Stringify explicitly; Postgres parses ISO 8601 as timestamptz correctly.
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    const rows = await this.db.execute<{
      id: string;
      type: ActivityEntry['type'];
      title: string;
      detail: string | null;
      client_id: string | null;
      amount: number | null;
      at: Date;
    }>(rawSql`
      select 'sale-' || t.id as id, 'sale' as type,
             'Sale to ' || t.customer_name as title,
             (select string_agg(p.name || ' ×' || ti.quantity, ', ') from transaction_items ti join products p on p.id = ti.product_id where ti.transaction_id = t.id) as detail,
             t.client_id, t.total::int as amount, t.created_at as at
      from transactions t
      where t.sold_by = ${employeeId} and t.created_at >= ${start} and t.created_at < ${end}

      union all

      select 'refund-' || r.id, 'refund',
             'Refund' || coalesce(' — ' || t2.customer_name, ''),
             (select string_agg(p.name || ' ×' || ri.quantity, ', ') from refund_items ri join products p on p.id = ri.product_id where ri.refund_id = r.id),
             t2.client_id, r.total::int, r.created_at
      from refunds r
      left join transactions t2 on t2.id = r.transaction_id
      where r.refunded_by = ${employeeId} and r.created_at >= ${start} and r.created_at < ${end}

      union all

      select 'log-' || l.id, 'pet-log',
             initcap(l.log_type::text) || ' — ' || pt.name,
             l.description,
             pt.client_id, null, l.performed_at
      from pet_logs l
      join pets pt on pt.id = l.pet_id
      where l.performed_by = ${employeeId} and l.performed_at >= ${start} and l.performed_at < ${end}

      union all

      select 'so-' || o.id, 'supplier-order',
             'Received ' || o.quantity || ' × ' || p2.name,
             s.name,
             null, o.cost_total::int, o.received_at
      from supplier_orders o
      join products p2 on p2.id = o.product_id
      join suppliers s on s.id = o.supplier_id
      where o.logged_by = ${employeeId} and o.received_at >= ${start} and o.received_at < ${end}

      union all

      select 'disc-' || d.id, 'discount',
             'Discount granted — ' || (case when d.kind = 'percent' then d.value || '%' else 'EGP ' || (d.value / 100) end)
               || (case when d.used_in_transaction_id is not null then ' (used)' else '' end),
             d.note,
             d.client_id, d.value, d.created_at
      from discounts d
      where d.created_by = ${employeeId} and d.created_at >= ${start} and d.created_at < ${end}

      order by at desc
    `);

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      detail: r.detail ?? undefined,
      actorId: employeeId,
      clientId: r.client_id ?? undefined,
      amount: r.amount ?? undefined,
      // Same raw-execute() quirk as the params above, mirrored on the way out: this UNION's
      // `at` column isn't reliably parsed into a Date instance, so coerce defensively.
      at: new Date(r.at).toISOString(),
    }));
  }
}
