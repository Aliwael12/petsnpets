import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  and,
  asc,
  count,
  gte,
  inArray,
  lte,
  or,
  type SQLWrapper,
} from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import {
  appointments,
  auditLog,
  boardings,
  clients,
  discounts,
  employees,
  expenses,
  petLogs,
  pets,
  refunds,
  reminders,
  stockMovements,
  supplierOrders,
  supplierPayments,
  transactions,
} from '../db/schema';
import { AppError } from '../common/errors/app-error';
import {
  monthDayBounds,
  tsInRange,
  dateInRange,
  type DayRange,
} from '../common/date-range';
import { SUPABASE_ADMIN } from '../supabase/supabase.module';
import { PurchasingService } from '../purchasing/purchasing.service';
import type { Actor } from '../auth/auth.types';
import type { MonthlyReportData, ReportTable } from './monthly-report-document';

type Method = 'cash' | 'instapay' | 'card';
const METHODS: Method[] = ['cash', 'instapay', 'card'];
const METHOD_LABELS: Record<Method, string> = {
  cash: 'Cash',
  instapay: 'InstaPay',
  card: 'Visa / Card',
};
const methodLabel = (m: Method | null | undefined) =>
  m ? METHOD_LABELS[m] : 'Not recorded';

/** Mirrors EXPENSE_CATEGORY_LABELS in the frontend's types.ts. */
const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  rent: 'Rent',
  salaries: 'Salaries',
  utilities: 'Utilities',
  maintenance: 'Maintenance & repairs',
  'clinic-supplies': 'Clinic supplies',
  marketing: 'Marketing',
  transport: 'Transport',
  'government-fees': 'Government fees',
  'owner-drawings': 'Owner drawings',
  other: 'Other',
};

/**
 * Audit actions that have no section of their own below — everything else in the audit log
 * (sales, refunds, stays, shipments, …) is already reported from its own table, with more
 * detail than an audit row carries. operator.pin_login is left out on purpose: one row per
 * shift change is noise, not activity.
 */
const OTHER_ACTIVITY_LABELS: Record<string, string> = {
  'product.create': 'Added product',
  'product.update': 'Edited product',
  'category.create': 'Added category',
  'category.update': 'Edited category',
  'category.delete': 'Removed category',
  'client.update': 'Edited client',
  'client.delete': 'Deleted client',
  'boarding.update': 'Updated boarding stay',
  'expense.update': 'Edited running cost',
  'discount.revoke': 'Revoked discount',
  'employee.create': 'Added employee',
  'employee.update_role': 'Changed employee role',
  'employee.update_features': 'Changed employee access',
  'employee.toggle_active': 'Activated / deactivated employee',
  'employee.remove': 'Removed employee',
  'operator.pin_change': 'Changed own PIN',
};

/** Money fields that show up in audit before/after snapshots — formatted as EGP in diffs. */
const MONEY_FIELDS = new Set([
  'unitPrice',
  'totalAmount',
  'paidAmount',
  'amount',
  'costTotal',
  'total',
]);
const IGNORED_DIFF_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'pinHash',
]);

@Injectable()
export class ReportsService {
  private readonly tz: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SUPABASE_ADMIN) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
    private readonly purchasing: PurchasingService,
  ) {
    this.tz = config.getOrThrow<string>('TIMEZONE');
  }

  /** Renders the month's report, stores it, and returns a short-lived download link. */
  async monthlyReportUrl(
    month: string | undefined,
    actor: Actor,
  ): Promise<string> {
    const resolved = month ?? this.currentMonth();
    const data = await this.buildMonthlyReport(resolved, actor);

    const reactPdf = await import('@react-pdf/renderer');
    const { createMonthlyReportDocument } =
      await import('./monthly-report-document.js');
    const MonthlyReportDocument = createMonthlyReportDocument(reactPdf);
    const buffer = await reactPdf
      .pdf(<MonthlyReportDocument data={data} />)
      .toBuffer();

    // One file per month, overwritten on every export: always re-rendered from live data
    // first, so the stored copy can never be a stale version of the month.
    const bucket = this.config.getOrThrow<string>('INVOICE_BUCKET');
    const path = `reports/${resolved}.pdf`;
    const { error: uploadError } = await this.supabase.storage
      .from(bucket)
      .upload(path, buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });
    if (uploadError) {
      throw new AppError(
        'REPORT_STORAGE_FAILED',
        `Could not store the report: ${uploadError.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const { data: signed, error: signError } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, 300, {
        download: `Elite-Blue-report-${resolved}.pdf`,
      });
    if (signError || !signed) {
      throw new AppError(
        'REPORT_STORAGE_FAILED',
        `Could not sign the report link: ${signError?.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    return signed.signedUrl;
  }

  private currentMonth(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: this.tz })
      .format(new Date())
      .slice(0, 7);
  }

  private async buildMonthlyReport(
    month: string,
    actor: Actor,
  ): Promise<MonthlyReportData> {
    const [year, monthNo] = month.split('-').map(Number);
    const range: DayRange = monthDayBounds(year, monthNo);
    const inMonth = (col: SQLWrapper) => and(...tsInRange(col, range, this.tz));

    // Sequential, not Promise.all: the Supabase pooler caps the whole project at 15 session
    // connections, and fanning ~16 queries out at once asks the local pool to open that many
    // on top of whatever else is connected (EMAXCONNSESSION). Production runs one connection
    // per function anyway, so this costs nothing there.
    const staff = await this.db
      .select({ id: employees.id, name: employees.name })
      .from(employees);
    const sales = await this.db.query.transactions.findMany({
      where: inMonth(transactions.createdAt),
      orderBy: [asc(transactions.createdAt)],
      with: { items: { with: { product: { columns: { name: true } } } } },
    });
    const refundRows = await this.db.query.refunds.findMany({
      where: inMonth(refunds.createdAt),
      orderBy: [asc(refunds.createdAt)],
      with: {
        items: { with: { product: { columns: { name: true } } } },
        transaction: {
          columns: { invoiceYear: true, invoiceNo: true, customerName: true },
        },
      },
    });
    // A stay belongs to the month if any night of it falls inside, or if it was logged in it.
    const stays = await this.db.query.boardings.findMany({
      where: or(
        and(
          lte(boardings.startDate, range.to!),
          gte(boardings.endDate, range.from!),
        ),
        inMonth(boardings.createdAt),
      ),
      orderBy: [asc(boardings.startDate), asc(boardings.createdAt)],
      with: {
        client: { columns: { name: true } },
        pet: { columns: { name: true } },
      },
    });
    const orders = await this.db.query.supplierOrders.findMany({
      where: inMonth(supplierOrders.receivedAt),
      orderBy: [asc(supplierOrders.receivedAt)],
      with: {
        supplier: { columns: { name: true } },
        product: { columns: { name: true, brand: true } },
      },
    });
    const payments = await this.db.query.supplierPayments.findMany({
      where: inMonth(supplierPayments.paidAt),
      orderBy: [asc(supplierPayments.paidAt)],
      with: { supplier: { columns: { name: true } } },
    });
    const expenseRows = await this.db.query.expenses.findMany({
      where: and(...dateInRange(expenses.paidOn, range)),
      orderBy: [asc(expenses.paidOn), asc(expenses.createdAt)],
    });
    const discountRows = await this.db.query.discounts.findMany({
      where: inMonth(discounts.createdAt),
      orderBy: [asc(discounts.createdAt)],
      with: { client: { columns: { name: true } } },
    });
    const logs = await this.db.query.petLogs.findMany({
      where: inMonth(petLogs.performedAt),
      orderBy: [asc(petLogs.performedAt)],
      with: { pet: { with: { client: { columns: { name: true } } } } },
    });
    const reminderRows = await this.db.query.reminders.findMany({
      where: or(inMonth(reminders.createdAt), inMonth(reminders.completedAt)),
      orderBy: [asc(reminders.createdAt)],
      with: {
        client: { columns: { name: true } },
        pet: { columns: { name: true } },
      },
    });
    const appointmentRows = await this.db.query.appointments.findMany({
      where: or(
        inMonth(appointments.createdAt),
        inMonth(appointments.requestedAt),
      ),
      orderBy: [asc(appointments.requestedAt)],
    });
    const adjustments = await this.db.query.stockMovements.findMany({
      where: and(
        inArray(stockMovements.reason, ['adjustment', 'stocktake']),
        inMonth(stockMovements.createdAt),
      ),
      orderBy: [asc(stockMovements.createdAt)],
      with: { product: { columns: { name: true } } },
    });
    const activity = await this.db
      .select()
      .from(auditLog)
      .where(
        and(
          inArray(auditLog.action, Object.keys(OTHER_ACTIVITY_LABELS)),
          inMonth(auditLog.createdAt),
        ),
      )
      .orderBy(asc(auditLog.createdAt));
    const [{ n: newClients }] = await this.db
      .select({ n: count() })
      .from(clients)
      .where(inMonth(clients.createdAt));
    const [{ n: newPets }] = await this.db
      .select({ n: count() })
      .from(pets)
      .where(inMonth(pets.createdAt));
    const balances = await this.purchasing.supplierBalances();

    const staffName = new Map(staff.map((e) => [e.id, e.name]));
    const who = (id: string | null | undefined) =>
      id ? (staffName.get(id) ?? 'Former employee') : '—';

    // Boarding audit rows only carry ids; one lookup turns them into pet names.
    const auditPetIds = [
      ...new Set(
        activity
          .flatMap((a) => [snapshot(a.after)?.petId, snapshot(a.before)?.petId])
          .filter((v): v is string => typeof v === 'string'),
      ),
    ];
    const auditPets = auditPetIds.length
      ? await this.db
          .select({ id: pets.id, name: pets.name })
          .from(pets)
          .where(inArray(pets.id, auditPetIds))
      : [];
    const petName = new Map(auditPets.map((p) => [p.id, p.name]));

    // ---- Money, computed from exactly the rows listed below so every total reconciles. ----
    const salesGross = sum(sales.map((t) => t.total));
    const refundsTotal = sum(refundRows.map((r) => r.total));
    const income = salesGross - refundsTotal;
    const stockCost = sum(orders.map((o) => o.costTotal));
    const liveExpenses = expenseRows.filter((e) => !e.voidedAt);
    const operating = sum(liveExpenses.map((e) => e.amount));
    const expensesTotal = stockCost + operating;
    const paidToSuppliers = sum(payments.map((p) => p.amount));
    const owedToSuppliers = sum(balances.map((b) => b.owed));
    const boardingBilled = sum(stays.map((s) => s.totalAmount));
    const boardingPaid = sum(stays.map((s) => s.paidAmount));
    const boardingLeft = sum(
      stays.map((s) => Math.max(0, s.totalAmount - s.paidAmount)),
    );
    const discountsGiven = sum(sales.map((t) => t.discountAmount ?? 0));

    const byMethod = (
      rows: { method: Method | null; amount: number }[],
      m: Method | null,
    ) => sum(rows.filter((r) => r.method === m).map((r) => r.amount));
    const saleM = sales.map((t) => ({
      method: t.paymentMethod,
      amount: t.total,
    }));
    const refundM = refundRows.map((r) => ({
      method: r.paymentMethod,
      amount: r.total,
    }));
    const orderM = orders.map((o) => ({
      method: o.paymentMethod,
      amount: o.costTotal,
    }));
    const expenseM = liveExpenses.map((e) => ({
      method: e.paymentMethod,
      amount: e.amount,
    }));
    const paymentM = payments.map((p) => ({
      method: p.paymentMethod,
      amount: p.amount,
    }));

    const fmt = this.formatters();

    const breakdown: ReportTable = {
      title: 'Money in / out by payment method',
      hideCount: true,
      note: 'Net income is sales minus refunds. Stock is the cost of shipments received this month; supplier payments are what was actually paid toward supplier balances.',
      columns: [
        { label: 'Method', flex: 2 },
        { label: 'Sales', flex: 1.5, align: 'right' },
        { label: 'Refunds', flex: 1.5, align: 'right' },
        { label: 'Net income', flex: 1.5, align: 'right' },
        { label: 'Stock (shipments)', flex: 1.5, align: 'right' },
        { label: 'Running costs', flex: 1.5, align: 'right' },
        { label: 'Supplier payments', flex: 1.5, align: 'right' },
      ],
      rows: [...METHODS, null].map((m) => ({
        cells: [
          methodLabel(m),
          egp(byMethod(saleM, m)),
          egp(byMethod(refundM, m)),
          egp(byMethod(saleM, m) - byMethod(refundM, m)),
          egp(byMethod(orderM, m)),
          egp(byMethod(expenseM, m)),
          egp(byMethod(paymentM, m)),
        ],
      })),
      totals: [
        'Total',
        egp(salesGross),
        egp(refundsTotal),
        egp(income),
        egp(stockCost),
        egp(operating),
        egp(paidToSuppliers),
      ],
      empty: '',
    };

    const sections: ReportTable[] = [
      {
        title: 'Sales',
        columns: [
          { label: 'Time', flex: 1.4 },
          { label: 'Invoice', flex: 1.2 },
          { label: 'Customer', flex: 1.6 },
          { label: 'Items', flex: 3.4 },
          { label: 'Paid with', flex: 1.1 },
          { label: 'Discount', flex: 1, align: 'right' },
          { label: 'Total', flex: 1.1, align: 'right' },
          { label: 'Sold by', flex: 1.2 },
        ],
        rows: sales.map((t) => ({
          cells: [
            fmt.time(t.createdAt),
            invoiceNo(t.invoiceYear, t.invoiceNo),
            t.customerName,
            t.items
              .map(
                (it) =>
                  `${it.quantity} × ${it.product.name} @ ${egp(it.unitPrice)}`,
              )
              .join('\n'),
            methodLabel(t.paymentMethod),
            t.discountAmount ? egp(t.discountAmount) : '—',
            egp(t.total),
            who(t.soldBy),
          ],
        })),
        totals: ['', '', '', '', '', egp(discountsGiven), egp(salesGross), ''],
        empty: 'No sales this month.',
      },
      {
        title: 'Refunds',
        columns: [
          { label: 'Time', flex: 1.4 },
          { label: 'Invoice', flex: 1.2 },
          { label: 'Customer', flex: 1.6 },
          { label: 'Items', flex: 3 },
          { label: 'Reason', flex: 1.8 },
          { label: 'Paid back with', flex: 1.1 },
          { label: 'Amount', flex: 1.1, align: 'right' },
          { label: 'Refunded by', flex: 1.2 },
        ],
        rows: refundRows.map((r) => ({
          cells: [
            fmt.time(r.createdAt),
            invoiceNo(
              one(r.transaction).invoiceYear,
              one(r.transaction).invoiceNo,
            ),
            one(r.transaction).customerName,
            r.items
              .map((it) => `${it.quantity} × ${it.product.name}`)
              .join('\n'),
            r.reason ?? '—',
            methodLabel(r.paymentMethod),
            egp(r.total),
            who(r.refundedBy),
          ],
        })),
        totals: ['', '', '', '', '', '', egp(refundsTotal), ''],
        empty: 'No refunds this month.',
      },
      {
        title: 'Boarding stays',
        note: 'Every stay with at least one day in this month, or logged during it. Boarding is tracked separately and is not part of sales income.',
        columns: [
          { label: 'Logged', flex: 1.4 },
          { label: 'Pet', flex: 1.2 },
          { label: 'Client', flex: 1.5 },
          { label: 'Stay', flex: 2 },
          { label: 'Total', flex: 1, align: 'right' },
          { label: 'Paid', flex: 1, align: 'right' },
          { label: 'Left', flex: 1, align: 'right' },
          { label: 'Comments', flex: 2.2 },
          { label: 'Logged by', flex: 1.2 },
        ],
        rows: stays.map((s) => {
          const nights = Math.round(
            (Date.parse(`${s.endDate}T00:00:00Z`) -
              Date.parse(`${s.startDate}T00:00:00Z`)) /
              86_400_000,
          );
          return {
            cells: [
              fmt.time(s.createdAt),
              one(s.pet).name,
              one(s.client).name,
              `${fmt.day(s.startDate)} – ${fmt.day(s.endDate)}\n${nights === 0 ? 'Same day' : `${nights} night${nights === 1 ? '' : 's'}`}`,
              egp(s.totalAmount),
              egp(s.paidAmount),
              egp(Math.max(0, s.totalAmount - s.paidAmount)),
              s.note ?? '—',
              who(s.createdBy),
            ],
          };
        }),
        totals: [
          '',
          '',
          '',
          '',
          egp(boardingBilled),
          egp(boardingPaid),
          egp(boardingLeft),
          '',
          '',
        ],
        empty: 'No boarding stays this month.',
      },
      {
        title: 'Supplier orders',
        columns: [
          { label: 'Received', flex: 1.4 },
          { label: 'Supplier', flex: 1.6 },
          { label: 'Product', flex: 2.4 },
          { label: 'Qty', flex: 0.6, align: 'right' },
          { label: 'Unit cost', flex: 1, align: 'right' },
          { label: 'Total', flex: 1.1, align: 'right' },
          { label: 'Paid with', flex: 1.1 },
          { label: 'Logged by', flex: 1.2 },
        ],
        rows: orders.map((o) => ({
          cells: [
            fmt.time(o.receivedAt),
            one(o.supplier).name,
            one(o.product).brand
              ? `${one(o.product).brand} · ${one(o.product).name}`
              : one(o.product).name,
            String(o.quantity),
            egp(Math.round(o.costTotal / o.quantity)),
            egp(o.costTotal),
            methodLabel(o.paymentMethod),
            who(o.loggedBy),
          ],
        })),
        totals: ['', '', '', '', '', egp(stockCost), '', ''],
        empty: 'No supplier orders this month.',
      },
      {
        title: 'Supplier payments',
        note: `Still owed to suppliers as of this export: ${egp(owedToSuppliers)}.`,
        columns: [
          { label: 'Paid', flex: 1.4 },
          { label: 'Supplier', flex: 2.4 },
          { label: 'Paid with', flex: 1.2 },
          { label: 'Amount', flex: 1.2, align: 'right' },
          { label: 'Logged by', flex: 1.4 },
        ],
        rows: payments.map((p) => ({
          cells: [
            fmt.time(p.paidAt),
            one(p.supplier).name,
            methodLabel(p.paymentMethod),
            egp(p.amount),
            who(p.loggedBy),
          ],
        })),
        totals: ['', '', '', egp(paidToSuppliers), ''],
        empty: 'No supplier payments this month.',
      },
      {
        title: 'Running costs',
        note: 'Voided entries are listed greyed out and are not counted in the total.',
        columns: [
          { label: 'Paid on', flex: 1 },
          { label: 'Description', flex: 2.4 },
          { label: 'Category', flex: 1.3 },
          { label: 'Payee', flex: 1.3 },
          { label: 'Paid with', flex: 1.1 },
          { label: 'Amount', flex: 1.1, align: 'right' },
          { label: 'Recorded by', flex: 1.2 },
          { label: 'Status', flex: 1.8 },
        ],
        rows: expenseRows.map((e) => ({
          muted: !!e.voidedAt,
          cells: [
            fmt.day(e.paidOn),
            e.note ? `${e.description}\n${e.note}` : e.description,
            EXPENSE_CATEGORY_LABELS[e.category] ?? e.category,
            e.payee ?? '—',
            methodLabel(e.paymentMethod),
            egp(e.amount),
            who(e.recordedBy),
            e.voidedAt
              ? `Voided ${fmt.time(e.voidedAt)} by ${who(e.voidedBy)}${e.voidReason ? ` — ${e.voidReason}` : ''}`
              : `Recorded ${fmt.time(e.createdAt)}`,
          ],
        })),
        totals: ['', '', '', '', '', egp(operating), '', ''],
        empty: 'No running costs this month.',
      },
      {
        title: 'Discounts created',
        columns: [
          { label: 'Created', flex: 1.4 },
          { label: 'Client', flex: 2 },
          { label: 'Discount', flex: 1.1 },
          { label: 'Note', flex: 2.6 },
          { label: 'Status', flex: 1.1 },
          { label: 'Created by', flex: 1.3 },
        ],
        rows: discountRows.map((d) => ({
          cells: [
            fmt.time(d.createdAt),
            one(d.client).name,
            d.kind === 'percent' ? `${d.value}% off` : `${egp(d.value)} off`,
            d.note ?? '—',
            d.usedInTransactionId ? 'Used' : 'Not used yet',
            who(d.createdBy),
          ],
        })),
        empty: 'No discounts created this month.',
      },
      {
        title: 'Pet logs',
        columns: [
          { label: 'Time', flex: 1.4 },
          { label: 'Pet', flex: 1.2 },
          { label: 'Owner', flex: 1.5 },
          { label: 'Type', flex: 1 },
          { label: 'Description', flex: 3.2 },
          { label: 'Next due', flex: 1.1 },
          { label: 'Logged by', flex: 1.2 },
        ],
        rows: logs.map((l) => ({
          cells: [
            fmt.time(l.performedAt),
            one(l.pet).name,
            one(one(l.pet).client).name,
            capitalize(l.logType),
            l.description,
            l.nextDueDate ? fmt.dayOf(l.nextDueDate) : '—',
            who(l.performedBy),
          ],
        })),
        empty: 'No pet logs this month.',
      },
      {
        title: 'Reminders',
        note: 'Reminders created or completed this month.',
        columns: [
          { label: 'Created', flex: 1.4 },
          { label: 'Client', flex: 1.5 },
          { label: 'Pet', flex: 1.1 },
          { label: 'Reminder', flex: 2.8 },
          { label: 'Due', flex: 1.4 },
          { label: 'Created by', flex: 1.2 },
          { label: 'Completed', flex: 2 },
        ],
        rows: reminderRows.map((r) => ({
          cells: [
            fmt.time(r.createdAt),
            one(r.client).name,
            one(r.pet)?.name ?? '—',
            r.description,
            fmt.time(r.dueAt),
            who(r.createdBy),
            r.completedAt
              ? `${fmt.time(r.completedAt)} by ${who(r.completedBy)}`
              : 'Open',
          ],
        })),
        empty: 'No reminders this month.',
      },
      {
        title: 'Appointments',
        note: 'Booking requests received this month, or booked for a slot in it.',
        columns: [
          { label: 'Requested', flex: 1.4 },
          { label: 'Owner', flex: 1.5 },
          { label: 'Phone', flex: 1.2 },
          { label: 'Pet', flex: 1.2 },
          { label: 'Service', flex: 1.6 },
          { label: 'Slot', flex: 1.4 },
          { label: 'Status', flex: 1 },
          { label: 'Handled by', flex: 1.2 },
        ],
        rows: appointmentRows.map((a) => ({
          cells: [
            fmt.time(a.createdAt),
            a.ownerName,
            a.phone,
            `${a.petName} (${a.species})`,
            a.serviceName,
            fmt.time(a.requestedAt),
            capitalize(a.status),
            who(a.handledBy),
          ],
        })),
        empty: 'No appointments this month.',
      },
      {
        title: 'Stock adjustments',
        note: 'Manual stock corrections and stocktakes. Stock changes from sales, refunds and shipments are covered by those sections.',
        columns: [
          { label: 'Time', flex: 1.4 },
          { label: 'Product', flex: 2.6 },
          { label: 'Change', flex: 0.8, align: 'right' },
          { label: 'Reason', flex: 1 },
          { label: 'Note', flex: 2.6 },
          { label: 'By', flex: 1.2 },
        ],
        rows: adjustments.map((m) => ({
          cells: [
            fmt.time(m.createdAt),
            one(m.product).name,
            m.delta > 0 ? `+${m.delta}` : String(m.delta),
            capitalize(m.reason),
            m.note ?? '—',
            who(m.actorId),
          ],
        })),
        empty: 'No stock adjustments this month.',
      },
      {
        title: 'Other activity',
        note: 'Catalog, client, staff and account changes from the audit trail.',
        columns: [
          { label: 'Time', flex: 1.4 },
          { label: 'By', flex: 1.2 },
          { label: 'Action', flex: 1.8 },
          { label: 'Subject', flex: 1.6 },
          { label: 'Details', flex: 4 },
        ],
        rows: activity.map((a) => {
          const before = snapshot(a.before);
          const after = snapshot(a.after);
          const petId = (after?.petId ?? before?.petId) as string | undefined;
          const subject =
            (after?.name as string | undefined) ??
            (before?.name as string | undefined) ??
            (after?.description as string | undefined) ??
            (before?.description as string | undefined) ??
            (petId ? petName.get(petId) : undefined) ??
            (a.entityType === 'employee' && a.entityId
              ? staffName.get(a.entityId)
              : undefined) ??
            discountLabel(before ?? after) ??
            '—';
          return {
            cells: [
              fmt.time(a.createdAt),
              who(a.actorId),
              OTHER_ACTIVITY_LABELS[a.action] ?? a.action,
              subject,
              describeChange(before, after),
            ],
          };
        }),
        empty: 'No other activity this month.',
      },
    ];

    const monthLabel = new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, monthNo - 1, 15)));

    return {
      periodLabel: monthLabel,
      rangeLabel: `${fmt.day(range.from!)} – ${fmt.day(range.to!)}`,
      generatedAt: fmt.time(new Date()),
      generatedBy: who(actor.id),
      figures: [
        {
          label: 'Income (after refunds)',
          value: egp(income),
          hint: `${sales.length} sale${sales.length === 1 ? '' : 's'} · ${egp(refundsTotal)} refunded`,
        },
        {
          label: 'Expenses',
          value: egp(expensesTotal),
          hint: `${egp(stockCost)} stock · ${egp(operating)} running costs`,
        },
        {
          label: 'Net',
          value: egp(income - expensesTotal),
          hint: 'Income minus expenses',
        },
        {
          label: 'Discounts given',
          value: egp(discountsGiven),
          hint: `${discountRows.length} new discount${discountRows.length === 1 ? '' : 's'} created`,
        },
        {
          label: 'Paid to suppliers',
          value: egp(paidToSuppliers),
          hint: `${payments.length} payment${payments.length === 1 ? '' : 's'} this month`,
        },
        {
          label: 'Owed to suppliers',
          value: egp(owedToSuppliers),
          hint: 'Live balance at the time of export',
        },
        {
          label: 'Boarding',
          value: egp(boardingBilled),
          hint: `${stays.length} stay${stays.length === 1 ? '' : 's'} · ${egp(boardingPaid)} paid · ${egp(boardingLeft)} left`,
        },
        {
          label: 'Clinic activity',
          value: `${newClients} new client${newClients === 1 ? '' : 's'}`,
          hint: `${newPets} new pets · ${logs.length} pet logs · ${appointmentRows.length} appointments`,
        },
      ],
      breakdown,
      sections,
    };
  }

  /** Every timestamp in the report is shown in the clinic's own timezone, never the server's. */
  private formatters() {
    const timeFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const dayOfFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    // Plain DATE columns have no time of day; noon UTC keeps them on the right calendar day.
    const dayFmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return {
      time: (d: Date | string) => timeFmt.format(new Date(d)),
      dayOf: (d: Date | string) => dayOfFmt.format(new Date(d)),
      day: (key: string) => dayFmt.format(new Date(`${key}T12:00:00Z`)),
    };
  }
}

/** Drizzle's relational types widen a narrowed `one()` relation to `T | T[]` (the same
 *  problem invoices.service.tsx works around); at runtime it is always the single row. */
function one<T>(rel: T | T[]): T {
  return Array.isArray(rel) ? rel[0] : rel;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Piastres to "EGP 1,234" or "EGP 1,234.50". Negative amounts keep their sign in front. */
function egp(piastres: number): string {
  const whole = piastres % 100 === 0;
  const text = (Math.abs(piastres) / 100).toLocaleString('en-US', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
  return piastres < 0 ? `-EGP ${text}` : `EGP ${text}`;
}

/** "10% off" / "EGP 50 off" from a discount snapshot; undefined for anything else. */
function discountLabel(
  snap: Record<string, unknown> | undefined,
): string | undefined {
  if (!snap || typeof snap.value !== 'number') return undefined;
  if (snap.kind === 'percent') return `${snap.value}% off`;
  if (snap.kind === 'fixed') return `${egp(snap.value)} off`;
  return undefined;
}

function invoiceNo(year: number, no: number): string {
  return `INV-${year}-${String(no).padStart(5, '0')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
}

function snapshot(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** "Name: A to B · Unit price: EGP 200 to EGP 250" from an audit row's before/after
 *  snapshots. Plain "to" rather than an arrow: the built-in PDF font has no arrow glyph. */
function describeChange(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): string {
  if (!before && !after) return '—';
  if (!before || !after) return '—';
  const changes = Object.keys(after)
    .filter(
      (key) =>
        !IGNORED_DIFF_FIELDS.has(key) &&
        JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    )
    .map(
      (key) =>
        `${humanize(key)}: ${showValue(key, before[key])} to ${showValue(key, after[key])}`,
    );
  const text = changes.join(' · ') || 'No field changes';
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function showValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (MONEY_FIELDS.has(key) && typeof value === 'number') return egp(value);
  if (Array.isArray(value))
    return value.length
      ? value
          .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
          .join(', ')
      : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
