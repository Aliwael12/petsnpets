import type { PaymentMethod } from '../db/schema';

/** 'unrecorded' is not an enum member — it's the bucket for SQL NULL, i.e. rows written
 * before payment tracking existed. It is surfaced rather than folded into 'cash' so the
 * breakdown never claims a payment method nobody ever entered. */
export type PaymentBucket = PaymentMethod | 'unrecorded';

export type MethodBreakdown = Record<PaymentBucket, number>;

export interface FinancialWindow {
  /** Present only on the `month` window. */
  year?: number;
  month?: number;
  /** Present only on the `range` window. null on a side means open-ended there. */
  from?: string | null;
  to?: string | null;
  income: {
    /** Gross sales before refunds. */
    gross: number;
    /** Refunds, as a positive number. Contra-revenue — never an expense. */
    refunds: number;
    /** gross - refunds. This is the figure the Income card shows. */
    net: number;
    /** Per method, already net of refunds paid back by that method, so the values sum
     * exactly to `net`. */
    byMethod: MethodBreakdown;
  };
  expenses: {
    /** Supplier shipments — stock bought for resale. */
    stock: number;
    /** Rent, salaries, utilities… — the expenses table, voided rows excluded. */
    operating: number;
    total: number;
    /** Sums exactly to `total`. */
    byMethod: MethodBreakdown;
  };
  /** income.net - expenses.total. */
  net: number;
}

export interface FinancialSummary {
  /** The window the caller asked for. An omitted side is unbounded, so with no from/to at
   *  all this is ALL TIME — field-for-field equal to `allTime`, not to `month`. */
  range: FinancialWindow;
  /** A whole calendar month. Semantics unchanged from before ranges existed. */
  month: FinancialWindow;
  /** NEVER range-filtered — it is the figure the selected range is judged against. */
  allTime: FinancialWindow;
}
