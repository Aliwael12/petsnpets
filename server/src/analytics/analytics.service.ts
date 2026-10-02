import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, sql as rawSql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { discounts, incomeReallocations, petLogs, refunds, supplierOrders, transactions } from '../db/schema';
import { ValidationAppError } from '../common/errors/app-error';
import { AuditService } from '../common/audit/audit.service';
import type { Actor } from '../auth/auth.types';
import { andClause, dateInRange, monthDayBounds, tsInRange, type DayRange } from '../common/date-range';
import type { ActivityEntry } from './activity.types';
import type { FinancialSummary, FinancialWindow, MethodBreakdown, PaymentBucket } from './financial-summary.types';

const PAYMENT_BUCKETS: PaymentBucket[] = ['cash', 'instapay', 'card', 'vodafone_cash', 'unrecorded'];
const emptyBreakdown = (): MethodBreakdown => ({ cash: 0, instapay: 0, card: 0, vodafone_cash: 0, unrecorded: 0 });

const egp = (piastres: number) => `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/** Adds the reallocation shifts to a window's income split (they sum to zero, so the total
 *  is untouched) and records what was applied, so the UI can say the split was adjusted. */
function applyReallocations(window: FinancialWindow, rows: { deltas: Record<string, number> }[]) {
  const applied = emptyBreakdown();
  let any = false;
  for (const row of rows) {
    for (const b of PAYMENT_BUCKETS) {
      const shift = row.deltas[b] ?? 0;
      if (shift !== 0) any = true;
      applied[b] += shift;
      window.income.byMethod[b] += shift;
    }
  }
  window.income.reallocated = any ? applied : null;
}

/** Money sums are cast to ::bigint in SQL, not ::int, because int4 tops out at
 * 21,474,836.47 EGP — a ceiling a clinic's all-time revenue genuinely reaches, and
 * hitting it would be a query error rather than a wrong number. postgres-js hands
 * bigint back as a string, so it has to come through Number() here. */
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

/** A bar you cannot point at is not a data point, so bucket width grows with the span.
 *  Passed to SQL as binds so the server's bucketing and the client's axis labelling can
 *  never drift. */
const BUCKET_DAY_MAX_SPAN = 62;
const BUCKET_WEEK_MAX_SPAN = 366;

@Injectable()
export class AnalyticsService {
  private readonly tz: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    config: ConfigService,
    private readonly audit: AuditService,
  ) {
    this.tz = config.getOrThrow<string>('TIMEZONE');
  }

  /**
   * Money per bucket across a window, bucketed in the clinic's own timezone — not UTC, and
   * never the caller's browser timezone (the bug this replaces: the frontend used to
   * compute "today" with `new Date()` in whatever zone the viewer happened to be in).
   *
   * Returns FOUR streams per bucket, not just gross sales, because Money in / out's cash
   * flow chart reads this: in = total - refunds, out = stock + operating, which makes the
   * bars sum to exactly the Net tile above them rather than merely resembling it.
   *
   * An open side spans the DATA, not "today" and not "30 days ago": the floor is the
   * earliest and the ceiling the latest day any of the four streams has a row on. Anything
   * narrower would plot fewer days than the tiles above the chart counted, and the two
   * would silently disagree — which is exactly what an unbounded range asks them not to do.
   *
   * Bucket width adapts to the span so a five-year range is 60 monthly bars, not 1,825
   * one-pixel daily ones. Every fact stream is pre-aggregated per day BEFORE joining, so a
   * day with 3 sales and 2 refunds cannot fan out into 6 rows.
   */
  async revenueTimeseries(q: { days?: number; from?: string; to?: string }, scopeToEmployeeId: string | null = null) {
    const from = q.from ?? null;
    const to = q.to ?? null;
    // Opt-in, not defaulted: a defaulted `days` would quietly govern the cleared-range
    // chart and cap it at 30 days while every sibling card on the screen showed all time.
    const days = q.days ?? null;

    const rows = await this.db.execute<{
      date: string;
      end_date: string;
      total: string | number;
      refunds: string | number;
      stock: string | number;
      operating: string | number;
    }>(rawSql`
      with tod as (select (now() at time zone ${this.tz})::date as today),
      -- The span of every stream that can appear in a bucket. least()/greatest() ignore
      -- NULLs, so a table with no rows simply doesn't constrain the window, and all four
      -- being empty leaves NULL for the coalesce below to handle.
      extent as (
        select
          least(
            (select min(t.created_at at time zone ${this.tz})::date from transactions t),
            (select min(r.created_at at time zone ${this.tz})::date from refunds r),
            (select min(o.received_at at time zone ${this.tz})::date from supplier_orders o),
            (select min(e.paid_on) from expenses e where e.voided_at is null)
          ) as lo,
          greatest(
            (select max(t.created_at at time zone ${this.tz})::date from transactions t),
            (select max(r.created_at at time zone ${this.tz})::date from refunds r),
            (select max(o.received_at at time zone ${this.tz})::date from supplier_orders o),
            (select max(e.paid_on) from expenses e where e.voided_at is null)
          ) as hi
      ),
      bounds as (
        select
          coalesce(
            ${to}::date,
            -- A row dated in the future (a post-dated receipt) is inside an open-ended
            -- window, so the chart has to reach it too.
            greatest(tod.today, extent.hi),
            tod.today
          ) as d_to,
          coalesce(
            ${from}::date,
            -- Legacy "last N days", now only when a caller explicitly asks for it.
            case when ${days}::int is not null and ${to}::date is null then tod.today - (${days}::int - 1) end,
            extent.lo
          ) as d_from_raw
        from tod, extent
      ),
      span as (select d_to, least(coalesce(d_from_raw, d_to), d_to) as d_from from bounds),
      unit as (
        select d_from, d_to,
          case when (d_to - d_from) + 1 <= ${BUCKET_DAY_MAX_SPAN}  then 'day'
               when (d_to - d_from) + 1 <= ${BUCKET_WEEK_MAX_SPAN} then 'week'
               else 'month' end as u
        from span
      ),
      keyed as (
        select g.d::date as d,
          case unit.u
            when 'day'  then g.d::date
            -- Egypt's business week is Sat-Thu; date_trunc('week') is ISO Monday, so
            -- shift forward two days, truncate, shift back.
            when 'week' then (date_trunc('week', g.d + interval '2 day') - interval '2 day')::date
            else date_trunc('month', g.d)::date
          end as bucket
        from unit, generate_series(unit.d_from, unit.d_to, interval '1 day') as g(d)
      ),
      tx as (
        select (t.created_at at time zone ${this.tz})::date as d, sum(t.total)::bigint as amt
        from transactions t, unit
        where t.created_at >= (unit.d_from::timestamp at time zone ${this.tz})
          and t.created_at <  ((unit.d_to + 1)::timestamp at time zone ${this.tz})
          ${this.scoped(rawSql`t.sold_by`, scopeToEmployeeId)}
        group by 1
      ),
      rf as (
        select (r.created_at at time zone ${this.tz})::date as d, sum(r.total)::bigint as amt
        from refunds r
        -- A refund comes off the income of whoever made the SALE, not whoever happened to
        -- process the refund — otherwise a doctor's own figure would never drop when one of
        -- their sales is returned at the till.
        join transactions rt on rt.id = r.transaction_id, unit
        where r.created_at >= (unit.d_from::timestamp at time zone ${this.tz})
          and r.created_at <  ((unit.d_to + 1)::timestamp at time zone ${this.tz})
          ${this.scoped(rawSql`rt.sold_by`, scopeToEmployeeId)}
        group by 1
      ),
      so as (
        select (o.received_at at time zone ${this.tz})::date as d, sum(o.cost_total)::bigint as amt
        from supplier_orders o, unit
        where o.received_at >= (unit.d_from::timestamp at time zone ${this.tz})
          and o.received_at <  ((unit.d_to + 1)::timestamp at time zone ${this.tz})
          -- Shipments and running costs belong to the clinic, not to any one seller, so a
          -- self-scoped caller sees none of them rather than an invented personal share.
          ${this.clinicWideOnly(scopeToEmployeeId)}
        group by 1
      ),
      ex as (
        select e.paid_on as d, sum(e.amount)::bigint as amt
        from expenses e, unit
        where e.voided_at is null and e.paid_on >= unit.d_from and e.paid_on <= unit.d_to
          ${this.clinicWideOnly(scopeToEmployeeId)}
        group by 1
      )
      select
        -- min/max of the days actually IN RANGE, not the calendar bucket's own edges: a
        -- range starting on the 15th must not label its first month bucket "1 Jun".
        to_char(min(k.d), 'YYYY-MM-DD') as date,
        to_char(max(k.d), 'YYYY-MM-DD') as end_date,
        coalesce(sum(tx.amt), 0)::bigint as total,
        coalesce(sum(rf.amt), 0)::bigint as refunds,
        coalesce(sum(so.amt), 0)::bigint as stock,
        coalesce(sum(ex.amt), 0)::bigint as operating
      from keyed k
      left join tx on tx.d = k.d
      left join rf on rf.d = k.d
      left join so on so.d = k.d
      left join ex on ex.d = k.d
      group by k.bucket
      order by k.bucket
    `);

    return rows.map((r) => ({
      date: r.date,
      endDate: r.end_date,
      total: num(r.total),
      refunds: num(r.refunds),
      stock: num(r.stock),
      operating: num(r.operating),
    }));
  }

  async bestSellers(range: DayRange, scopeToEmployeeId: string | null = null, limit = 8) {
    const rows = await this.db.execute<{ id: string; name: string; quantity: number; revenue: string | number }>(rawSql`
      select p.id, p.name,
             sum(x.qty)::int as quantity,
             sum(x.amt)::bigint as revenue
      from ${this.netLines(range, scopeToEmployeeId)} x
      join products p on p.id = x.product_id
      group by p.id, p.name
      -- A product whose every sale in the window was returned hasn't "sold" at all.
      having sum(x.qty) > 0
      order by revenue desc
      limit ${limit}
    `);
    return rows.map((r) => ({ ...r, revenue: num(r.revenue) }));
  }

  async revenueByEmployee(range: DayRange) {
    // Credited to whoever made the sale, net of refunds on those sales (dated by the refund).
    // Employees with nothing in the range drop out entirely. Deliberately not a right join.
    const rows = await this.db.execute<{ id: string; name: string; revenue: string | number }>(rawSql`
      select e.id, e.name, sum(x.amt)::bigint as revenue
      from (
        select t.sold_by as employee_id, t.total as amt
        from transactions t
        where true ${this.ts(rawSql`t.created_at`, range)}
        union all
        select t.sold_by, -r.total
        from refunds r
        join transactions t on t.id = r.transaction_id
        where true ${this.ts(rawSql`r.created_at`, range)}
      ) x
      join employees e on e.id = x.employee_id
      group by e.id, e.name
      having sum(x.amt) <> 0
      order by revenue desc
    `);
    return rows.map((r) => ({ ...r, revenue: num(r.revenue) }));
  }

  async revenueByCategory(range: DayRange, scopeToEmployeeId: string | null = null) {
    const rows = await this.db.execute<{ category: string; value: string | number }>(rawSql`
      select p.category, sum(x.amt)::bigint as value
      from ${this.netLines(range, scopeToEmployeeId)} x
      join products p on p.id = x.product_id
      group by p.category
      -- A pie can't draw a negative slice; a category refunded down to nothing just drops out.
      having sum(x.amt) > 0
    `);
    return rows.map((r) => ({ ...r, value: num(r.value) }));
  }

  /** "Clinic services" vs. "pet shop" — split on the product's `kind`, which comes from its
   *  category row. (Categories are named rows now, e.g. 'clinic-services', so matching on the
   *  literal category name 'service' put every sale under "shop".) */
  async revenueSplit(kind: 'service' | 'shop', range: DayRange, scopeToEmployeeId: string | null = null) {
    const isService = kind === 'service';
    const raw = await this.db.execute<{ id: string; name: string; revenue: string | number }>(rawSql`
      select p.id, p.name, sum(x.amt)::bigint as revenue
      from ${this.netLines(range, scopeToEmployeeId)} x
      join products p on p.id = x.product_id
      where (p.kind = 'service') = ${isService}
      group by p.id, p.name
      order by revenue desc
    `);
    // MUST run after num(): postgres-js hands ::bigint back as a STRING, and
    // '12345' + '6789' is '123456789'.
    const rows = raw.map((r) => ({ ...r, revenue: num(r.revenue) }));
    const total = rows.reduce((sum, r) => sum + r.revenue, 0);
    return { total, items: rows.filter((r) => r.revenue > 0).slice(0, 8) };
  }

  /**
   * Every line sold in the window as +quantity/+amount, and every line refunded in the window
   * as −quantity/−amount, so per-product figures come out net of returns. Refunds are dated by
   * when they happened (the same rule the Income cards use) and credited against the seller of
   * the original sale. Both sides use the list price snapshotted on the line, so the two cancel
   * exactly; the invoice-level discount lives only in transactions.total / refunds.total.
   */
  private netLines(range: DayRange, scopeToEmployeeId: string | null): SQL {
    return rawSql`(
      select ti.product_id, ti.quantity as qty, (ti.quantity * ti.unit_price)::bigint as amt
      from transaction_items ti
      join transactions t on t.id = ti.transaction_id
      where true ${this.ts(rawSql`t.created_at`, range)}${this.scoped(rawSql`t.sold_by`, scopeToEmployeeId)}
      union all
      select ri.product_id, -ri.quantity, -(ri.quantity * ri.unit_price)::bigint
      from refund_items ri
      join refunds r on r.id = ri.refund_id
      join transactions t on t.id = r.transaction_id
      where true ${this.ts(rawSql`r.created_at`, range)}${this.scoped(rawSql`t.sold_by`, scopeToEmployeeId)}
    )`;
  }

  /**
   * Everything one employee did in a window. `from`/`to` win when supplied; otherwise the
   * window is the calendar month, resolved the way it always has been — so a month-defaulted
   * request and a range-selected one run through identical predicates.
   */
  async employeeSummary(q: { employeeId: string; year?: number; month?: number; from?: string; to?: string }) {
    const { employeeId } = q;
    let range: DayRange;
    let resolvedYear: number | undefined;
    let resolvedMonth: number | undefined;

    // A cleared range and "no range supplied" are the same request on the wire, and both
    // mean all time — the same rule the other analytics endpoints follow. The calendar
    // month is used ONLY when a caller explicitly asks for one with year+month.
    if (q.year === undefined || q.month === undefined) {
      range = { from: q.from ?? null, to: q.to ?? null };
    } else {
      const m = await this.resolveMonthBounds(q.year, q.month);
      resolvedYear = m.resolvedYear;
      resolvedMonth = m.resolvedMonth;
      range = monthDayBounds(m.resolvedYear, m.resolvedMonth);
    }

    const inTs = (col: SQLWrapper) => tsInRange(col, range, this.tz);

    const [sales, refundRows, petLogRows, supplierOrderRows, discountRows] = await Promise.all([
      this.db
        .select()
        .from(transactions)
        .where(and(eq(transactions.soldBy, employeeId), ...inTs(transactions.createdAt))),
      this.db
        .select()
        .from(refunds)
        .where(and(eq(refunds.refundedBy, employeeId), ...inTs(refunds.createdAt))),
      this.db
        .select()
        .from(petLogs)
        .where(and(eq(petLogs.performedBy, employeeId), ...inTs(petLogs.performedAt))),
      this.db
        .select()
        .from(supplierOrders)
        .where(and(eq(supplierOrders.loggedBy, employeeId), ...inTs(supplierOrders.receivedAt))),
      this.db
        .select()
        .from(discounts)
        .where(and(eq(discounts.createdBy, employeeId), ...inTs(discounts.createdAt))),
    ]);

    const salesRevenue = sales.reduce((sum, t) => sum + t.total, 0);
    const refundsAmount = refundRows.reduce((sum, r) => sum + r.total, 0);
    const ordersCost = supplierOrderRows.reduce((sum, o) => sum + o.costTotal, 0);

    const activity = await this.buildActivityFeed(employeeId, range);

    return {
      from: range.from,
      to: range.to,
      /** Present only when the window is exactly a calendar month. */
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
   *
   * `supplierId`, when given, narrows every 'stock' stream (and so expenses.total and net)
   * to that one supplier's shipments. Income is never narrowed by it — a sale has no
   * supplier to attribute it to, so "this supplier's income" isn't a fact about anything.
   */
  async financialSummary(q: {
    year?: number;
    month?: number;
    from?: string;
    to?: string;
    supplierId?: string;
  }): Promise<FinancialSummary> {
    const { resolvedYear, resolvedMonth } = await this.resolveMonthBounds(q.year, q.month);

    // `range` means exactly the window the caller asked for, with one rule and no caveat:
    // an unbounded side is unbounded. Both sides omitted therefore means ALL TIME, not
    // "the current month" — a fallback that would make the honest state (the user clearing
    // both dates) unrepresentable, so the card would print "All time" over this month's
    // figures. `month` and `allTime` are unaffected and still answer what they always did.
    const range: DayRange = { from: q.from ?? null, to: q.to ?? null };
    // Narrows every 'stock' stream below to one supplier — reuses the same helper the
    // employee-scoping in this file uses, just against supplier_id instead of sold_by.
    const supplierScope = this.scoped(rawSql`o.supplier_id`, q.supplierId ?? null);

    const rows = await this.db.execute<{
      win: 'range' | 'month' | 'all';
      stream: 'sales' | 'boarding' | 'refunds' | 'stock' | 'operating';
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
      -- the selected range
      ${this.salesByMethod('range', rawSql`true ${this.ts(rawSql`t.created_at`, range)}`)}
      union all
      select 'range', 'boarding', bp.method::text, sum(bp.amount)::bigint
        from boarding_payments bp where true ${this.ts(rawSql`bp.paid_at`, range)} group by bp.method
      union all
      select 'range', 'refunds', r.payment_method::text, sum(r.total)::bigint
        from refunds r where true ${this.ts(rawSql`r.created_at`, range)} group by r.payment_method
      union all
      select 'range', 'stock', o.payment_method::text, sum(o.cost_total)::bigint
        from supplier_orders o where true ${this.ts(rawSql`o.received_at`, range)}${supplierScope} group by o.payment_method
      union all
      select 'range', 'operating', e.payment_method::text, sum(e.amount)::bigint
        from expenses e where e.voided_at is null ${this.dt(rawSql`e.paid_on`, range)} group by e.payment_method
      union all
      -- the calendar month, exactly as before
      ${this.salesByMethod('month', rawSql`t.created_at >= b.ts_start and t.created_at < b.ts_end`)}
      union all
      select 'month', 'boarding', bp.method::text, sum(bp.amount)::bigint
        from boarding_payments bp, b where bp.paid_at >= b.ts_start and bp.paid_at < b.ts_end group by bp.method
      union all
      select 'month', 'refunds', r.payment_method::text, sum(r.total)::bigint
        from refunds r, b where r.created_at >= b.ts_start and r.created_at < b.ts_end group by r.payment_method
      union all
      select 'month', 'stock', o.payment_method::text, sum(o.cost_total)::bigint
        from supplier_orders o, b where o.received_at >= b.ts_start and o.received_at < b.ts_end${supplierScope} group by o.payment_method
      union all
      select 'month', 'operating', e.payment_method::text, sum(e.amount)::bigint
        from expenses e, b
        where e.voided_at is null and e.paid_on >= b.d_start and e.paid_on < b.d_end group by e.payment_method
      union all
      -- all time. NEVER range-filtered: it is the figure the range is judged against.
      ${this.salesByMethod('all', rawSql`true`)}
      union all
      select 'all', 'boarding', bp.method::text, sum(bp.amount)::bigint from boarding_payments bp group by bp.method
      union all
      select 'all', 'refunds', r.payment_method::text, sum(r.total)::bigint from refunds r group by r.payment_method
      union all
      select 'all', 'stock', o.payment_method::text, sum(o.cost_total)::bigint
        from supplier_orders o where true${supplierScope} group by o.payment_method
      union all
      select 'all', 'operating', e.payment_method::text, sum(e.amount)::bigint
        from expenses e where e.voided_at is null group by e.payment_method
    `);

    // `range` and `month` duplicate work when no range is supplied. Deliberate: one code
    // path, no conditional SQL, and these are index-range scans over a clinic-sized table.
    const summary: FinancialSummary = {
      range: { from: range.from, to: range.to, ...this.foldWindow(rows, 'range') },
      month: { year: resolvedYear, month: resolvedMonth, ...this.foldWindow(rows, 'month') },
      allTime: this.foldWindow(rows, 'all'),
    };

    // The admin's method reallocations (see income_reallocations): each belongs to a whole
    // month, so it applies to that month, to all time, and to a range only when the range
    // covers the entire month. A partial range (e.g. "today") can't say which days the
    // shifted money came from, so it shows the raw split.
    const reallocations = await this.db.select().from(incomeReallocations);
    const covers = (y: number, m: number) => {
      const first = `${y}-${String(m).padStart(2, '0')}-01`;
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      return (range.from === null || range.from <= first) && (range.to === null || range.to >= last);
    };
    applyReallocations(summary.month, reallocations.filter((r) => r.year === resolvedYear && r.month === resolvedMonth));
    applyReallocations(summary.allTime, reallocations);
    applyReallocations(summary.range, reallocations.filter((r) => covers(r.year, r.month)));
    return summary;
  }

  /**
   * Sets how one month's income splits across methods, keeping the month's total exactly as
   * it is: `byMethod` is the split the admin wants to see, and what's stored is its
   * difference from the real payments. Admin only (see the controller).
   */
  async reallocateIncome(year: number, month: number, target: MethodBreakdown, actor: Actor): Promise<FinancialWindow> {
    const { month: current } = await this.financialSummary({ year, month });
    const applied = current.income.reallocated ?? emptyBreakdown();
    const wanted = PAYMENT_BUCKETS.reduce((sum, b) => sum + target[b], 0);
    if (wanted !== current.income.net) {
      throw new ValidationAppError(
        `The methods add up to ${egp(wanted)}, but this month's income is ${egp(current.income.net)}. Only the split can change, not the total.`,
        { wanted, net: current.income.net },
      );
    }

    // shift = wanted - raw, where raw = what's shown now minus the shift already applied.
    const deltas: Record<string, number> = {};
    for (const b of PAYMENT_BUCKETS) {
      const shift = target[b] - (current.income.byMethod[b] - applied[b]);
      if (shift !== 0) deltas[b] = shift;
    }

    await this.db.transaction(async (tx) => {
      if (Object.keys(deltas).length === 0) {
        await tx.delete(incomeReallocations).where(and(eq(incomeReallocations.year, year), eq(incomeReallocations.month, month)));
      } else {
        await tx
          .insert(incomeReallocations)
          .values({ year, month, deltas, updatedBy: actor.id })
          .onConflictDoUpdate({
            target: [incomeReallocations.year, incomeReallocations.month],
            set: { deltas, updatedBy: actor.id, updatedAt: new Date() },
          });
      }
      await this.audit.log(tx, {
        actorId: actor.id,
        action: 'income.reallocate',
        entityType: 'income_month',
        before: { month: `${year}-${String(month).padStart(2, '0')}`, byMethod: current.income.byMethod },
        after: { month: `${year}-${String(month).padStart(2, '0')}`, byMethod: target },
      });
    });

    return (await this.financialSummary({ year, month })).month;
  }

  private foldWindow(
    rows: { win: string; stream: string; method: string | null; amount: string | number }[],
    win: 'range' | 'month' | 'all',
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
        case 'boarding':
          // Boarding payments are income just like a sale: same gross, same method split.
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
      income: { gross, refunds: refunded, net: netIncome, byMethod: incomeByMethod, reallocated: null },
      expenses: { stock, operating, total: totalExpenses, byMethod: expensesByMethod },
      net: netIncome - totalExpenses,
    };
  }

  /**
   * One window's sales income per payment method: each share of a split bill under its own
   * method, plus whatever a sale's payment rows don't cover as unrecorded (method null).
   * `where` filters `t` (transactions) and may use the `b` month-bounds CTE.
   */
  private salesByMethod(win: 'range' | 'month' | 'all', where: SQL): SQL {
    return rawSql`
      select ${rawSql.raw(`'${win}'`)} as win, 'sales' as stream, s.method, sum(s.amount)::bigint as amount
      from (
        select p.method::text as method, p.amount
          from transactions t join transaction_payments p on p.transaction_id = t.id, b
          where ${where}
        union all
        select null, t.total - coalesce((select sum(p.amount) from transaction_payments p where p.transaction_id = t.id), 0)
          from transactions t, b
          where ${where}
      ) s
      where s.amount <> 0
      group by s.method`;
  }

  /** ` and <col> >= ... and <col> < ...` for a timestamptz column, or nothing when open. */
  private ts(col: SQLWrapper, r: DayRange): SQL {
    return andClause(tsInRange(col, r, this.tz));
  }

  /** The same window against a plain DATE column (expenses.paid_on). */
  private dt(col: SQLWrapper, r: DayRange): SQL {
    return andClause(dateInRange(col, r));
  }

  /**
   * ` and <col> = <employee>` when the caller may only see their own sales, or nothing at
   * all when they may see the clinic's.
   *
   * Applied in SQL rather than by filtering a clinic-wide result afterwards: the wider
   * figure is then never computed, so it cannot leak through a stray field, a total, or a
   * row count.
   */
  private scoped(col: SQLWrapper, employeeId: string | null): SQL {
    return employeeId ? rawSql` and ${col} = ${employeeId}` : rawSql.empty();
  }

  /** Drops a whole fact stream out of a self-scoped result. Rendered as a literal
   *  `and false` rather than a bound boolean parameter, which Postgres would have to infer
   *  a type for in bare `and $1` position. */
  private clinicWideOnly(employeeId: string | null): SQL {
    return employeeId === null ? rawSql.empty() : rawSql` and false`;
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
  private async buildActivityFeed(employeeId: string, range: DayRange): Promise<ActivityEntry[]> {
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
             -- ::int here and below is per-ROW, not a sum: one sale over EGP 21.4M is not
             -- a thing. The aggregate queries above use ::bigint for exactly that reason.
             t.client_id, t.total::int as amount, t.created_at as at
      from transactions t
      where t.sold_by = ${employeeId} ${this.ts(rawSql`t.created_at`, range)}

      union all

      select 'refund-' || r.id, 'refund',
             'Refund' || coalesce(' — ' || t2.customer_name, ''),
             (select string_agg(p.name || ' ×' || ri.quantity, ', ') from refund_items ri join products p on p.id = ri.product_id where ri.refund_id = r.id),
             t2.client_id, r.total::int, r.created_at
      from refunds r
      left join transactions t2 on t2.id = r.transaction_id
      where r.refunded_by = ${employeeId} ${this.ts(rawSql`r.created_at`, range)}

      union all

      select 'log-' || l.id, 'pet-log',
             initcap(l.log_type::text) || ' — ' || pt.name,
             l.description,
             pt.client_id, null, l.performed_at
      from pet_logs l
      join pets pt on pt.id = l.pet_id
      where l.performed_by = ${employeeId} ${this.ts(rawSql`l.performed_at`, range)}

      union all

      select 'so-' || o.id, 'supplier-order',
             'Received ' || o.quantity || ' × ' || p2.name,
             s.name,
             null, o.cost_total::int, o.received_at
      from supplier_orders o
      join products p2 on p2.id = o.product_id
      join suppliers s on s.id = o.supplier_id
      where o.logged_by = ${employeeId} ${this.ts(rawSql`o.received_at`, range)}

      union all

      select 'disc-' || d.id, 'discount',
             'Discount granted — ' || (case when d.kind = 'percent' then d.value || '%' else 'EGP ' || (d.value / 100) end)
               || (case when d.used_in_transaction_id is not null then ' (used)' else '' end),
             d.note,
             d.client_id, d.value, d.created_at
      from discounts d
      where d.created_by = ${employeeId} ${this.ts(rawSql`d.created_at`, range)}

      order by at desc
      -- Bounded because the window is now user-chosen: a two-year range would otherwise
      -- stream every row this employee ever touched into the browser.
      limit 200
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
