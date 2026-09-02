import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['doctor', 'nurse', 'cashier']);
export type Role = (typeof roleEnum.enumValues)[number];

// NOTE: product categories used to be a pgEnum here. They are now rows in the
// product_categories table (see catalog.ts) so they can be managed from Settings —
// products.category is a text FK onto product_categories.name.

export const productKindEnum = pgEnum('product_kind', ['good', 'service']);

export const speciesEnum = pgEnum('species', ['dog', 'cat', 'bird', 'rabbit', 'other']);

export const logTypeEnum = pgEnum('log_type', ['vaccination', 'shower', 'other']);

export const phoneLabelEnum = pgEnum('phone_label', ['mobile', 'home', 'work', 'other']);

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
