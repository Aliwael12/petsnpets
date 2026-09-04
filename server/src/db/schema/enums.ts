import { pgEnum } from 'drizzle-orm/pg-core';

/** Ordered most- to least-privileged. 'admin' is the clinic owner: the only role that can
 *  manage staff, the catalog and the books without an explicit grant. Everything below it
 *  starts with no privileges at all and receives them one at a time — see
 *  employees/permissions.ts. */
export const roleEnum = pgEnum('role', ['admin', 'doctor', 'nurse', 'cashier']);
export type Role = (typeof roleEnum.enumValues)[number];

// NOTE: product categories used to be a pgEnum here. They are now rows in the
// product_categories table (see catalog.ts) so they can be managed from Settings —
// products.category is a text FK onto product_categories.name.

export const productKindEnum = pgEnum('product_kind', ['good', 'service']);

export const speciesEnum = pgEnum('species', ['dog', 'cat', 'bird', 'rabbit', 'other']);

export const logTypeEnum = pgEnum('log_type', ['vaccination', 'shower', 'other']);

export const phoneLabelEnum = pgEnum('phone_label', ['mobile', 'home', 'work', 'other']);

/** How money moved. 'card' rather than 'visa': the same terminal takes Mastercard and Meeza,
 * so storing 'visa' on a Mastercard sale would be a false record — the UI still shows the
 * owner's own vocabulary, "Card (Visa / Mastercard)". There is deliberately no 'other'
 * member: an enum value is selectable, and staff would pick it whenever unsure, at which
 * point the breakdown answers nothing. SQL NULL is unreachable from the API and therefore
 * can only ever mean "recorded before payment tracking existed". */
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'instapay', 'card']);
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];

export const discountKindEnum = pgEnum('discount_kind', ['percent', 'fixed']);

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'pending',
  'confirmed',
  'cancelled',
  'completed',
]);

export const stockReasonEnum = pgEnum('stock_reason', [
  'sale',
  'refund',
  'supplier_order',
  'adjustment',
  'stocktake',
]);
