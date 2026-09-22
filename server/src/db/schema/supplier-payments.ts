import { bigint, index, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentMethodEnum } from './enums';
import { suppliers } from './suppliers';
import { employees } from './employees';

/**
 * A payment toward a supplier's running balance — NOT tied to a specific order. A shipment's
 * own cost (supplier_orders.cost_total) is what's owed; this is what's actually been paid
 * off against it. `sum(orders.cost_total) - sum(payments.amount)`, grouped by supplier, is
 * the whole "amount owed" model — see PurchasingService.supplierBalances().
 */
export const supplierPayments = pgTable(
  'supplier_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    /** Purely a record of how the money moved — unlike a sale or a shipment's own payment
     *  method, nothing downstream keys off this being set. */
    paymentMethod: paymentMethodEnum('payment_method'),
    loggedBy: uuid('logged_by')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('supplier_payments_supplier_id_idx').on(table.supplierId),
    index('supplier_payments_logged_by_idx').on(table.loggedBy),
  ],
);

export type SupplierPayment = typeof supplierPayments.$inferSelect;
export type NewSupplierPayment = typeof supplierPayments.$inferInsert;
