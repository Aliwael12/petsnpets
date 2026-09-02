import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { employees, products, refundItems, refunds, transactions } from '../db/schema';
import { NotFoundAppError, AppError } from '../common/errors/app-error';
import { HttpStatus } from '@nestjs/common';
import { SUPABASE_ADMIN } from '../supabase/supabase.module';
// @react-pdf/renderer (and, transitively, invoice-document.tsx) are NOT statically
// imported here — see invoice-document.tsx's header comment for why: it's an ESM-only
// package that CommonJS require() can't load on Vercel's actual runtime. Both are loaded
// via dynamic import() inside renderAndStore() below instead, which works everywhere.

@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(SUPABASE_ADMIN) private readonly supabase: SupabaseClient,
    private readonly config: ConfigService,
  ) {}

  private objectPath(invoiceYear: number, invoiceNo: number): string {
    return `${invoiceYear}/${String(invoiceNo).padStart(5, '0')}.pdf`;
  }

  /** Credit notes live in their own prefix, keyed by refund id — one sale can be refunded
   * several times (partial refunds), so they can't be keyed by invoice number. */
  private refundObjectPath(invoiceYear: number, refundId: string): string {
    return `refunds/${invoiceYear}/${refundId}.pdf`;
  }

  /**
   * Renders the invoice PDF and stores it (upsert — safe to call again for the same
   * transaction, e.g. to backfill one created before this ran). Returns the storage path,
   * not a URL — signed URLs are short-lived and generated on demand by getSignedUrl().
   */
  async renderAndStore(transactionId: string): Promise<string> {
    const txn = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
      with: { items: { with: { product: { columns: { name: true } } } }, soldByEmployee: { columns: { name: true } } },
    });
    if (!txn) throw new NotFoundAppError('Transaction', transactionId);

    const reactPdf = await import('@react-pdf/renderer');
    const { createInvoiceDocument } = await import('./invoice-document.js');
    const InvoiceDocument = createInvoiceDocument(reactPdf);

    const buffer = await reactPdf.pdf(
      <InvoiceDocument
        transaction={{
          invoiceYear: txn.invoiceYear,
          invoiceNo: txn.invoiceNo,
          customerName: txn.customerName,
          createdAt: txn.createdAt,
          subtotal: txn.subtotal,
          discountAmount: txn.discountAmount,
          total: txn.total,
          paymentMethod: txn.paymentMethod,
          items: txn.items.map((it) => ({ productName: it.product.name, quantity: it.quantity, unitPrice: it.unitPrice })),
        }}
        soldByName={txn.soldByEmployee.name}
      />,
    ).toBuffer();

    const bucket = this.config.getOrThrow<string>('INVOICE_BUCKET');
    const path = this.objectPath(txn.invoiceYear, txn.invoiceNo);

    const { error } = await this.supabase.storage.from(bucket).upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (error) {
      throw new AppError('INVOICE_STORAGE_FAILED', `Could not store invoice PDF: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
    return path;
  }

  /** Returns a short-lived signed URL, rendering+storing the PDF first if it doesn't exist
   * yet (e.g. the very first request for a freshly-completed sale). */
  async getSignedUrl(transactionId: string, expiresInSeconds = 300): Promise<string> {
    const txn = await this.db.query.transactions.findFirst({
      where: eq(transactions.id, transactionId),
      columns: { invoiceYear: true, invoiceNo: true },
    });
    if (!txn) throw new NotFoundAppError('Transaction', transactionId);

    const bucket = this.config.getOrThrow<string>('INVOICE_BUCKET');
    const path = this.objectPath(txn.invoiceYear, txn.invoiceNo);

    const exists = await this.supabase.storage.from(bucket).list(String(txn.invoiceYear), {
      search: `${String(txn.invoiceNo).padStart(5, '0')}.pdf`,
    });
    if (!exists.data || exists.data.length === 0) {
      await this.renderAndStore(transactionId);
    }

    const { data, error } = await this.supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new AppError('INVOICE_STORAGE_FAILED', `Could not sign invoice URL: ${error?.message}`, HttpStatus.BAD_GATEWAY);
    }
    return data.signedUrl;
  }

  /**
   * Renders and stores the credit note for a refund. Same upsert semantics as invoices.
   *
   * Uses plain joins rather than db.query.refunds.findFirst({ with: ... }): Drizzle's
   * relational builder can't narrow `transaction`/`refundedByEmployee` to a single row here
   * and infers `T | T[]`, which doesn't type-check. The same workaround is used in
   * PetsService.list() for the same reason.
   */
  async renderAndStoreRefund(refundId: string): Promise<{ path: string; invoiceYear: number }> {
    const [refund] = await this.db
      .select({
        id: refunds.id,
        total: refunds.total,
        reason: refunds.reason,
        paymentMethod: refunds.paymentMethod,
        createdAt: refunds.createdAt,
        invoiceYear: transactions.invoiceYear,
        invoiceNo: transactions.invoiceNo,
        customerName: transactions.customerName,
        refundedByName: employees.name,
      })
      .from(refunds)
      .innerJoin(transactions, eq(transactions.id, refunds.transactionId))
      .innerJoin(employees, eq(employees.id, refunds.refundedBy))
      .where(eq(refunds.id, refundId))
      .limit(1);
    if (!refund) throw new NotFoundAppError('Refund', refundId);

    const items = await this.db
      .select({
        productName: products.name,
        quantity: refundItems.quantity,
        unitPrice: refundItems.unitPrice,
      })
      .from(refundItems)
      .innerJoin(products, eq(products.id, refundItems.productId))
      .where(eq(refundItems.refundId, refundId));

    const reactPdf = await import('@react-pdf/renderer');
    const { createRefundDocument } = await import('./refund-document.js');
    const RefundDocument = createRefundDocument(reactPdf);

    const buffer = await reactPdf
      .pdf(
        <RefundDocument
          refund={{
            invoiceYear: refund.invoiceYear,
            invoiceNo: refund.invoiceNo,
            customerName: refund.customerName,
            createdAt: refund.createdAt,
            total: refund.total,
            reason: refund.reason,
            paymentMethod: refund.paymentMethod,
            items,
          }}
          refundedByName={refund.refundedByName}
        />,
      )
      .toBuffer();

    const bucket = this.config.getOrThrow<string>('INVOICE_BUCKET');
    const path = this.refundObjectPath(refund.invoiceYear, refund.id);

    const { error } = await this.supabase.storage.from(bucket).upload(path, buffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (error) {
      throw new AppError('INVOICE_STORAGE_FAILED', `Could not store credit note PDF: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
    return { path, invoiceYear: refund.invoiceYear };
  }

  /** Signed URL for a refund's credit note, rendering it on first request. */
  async getRefundSignedUrl(refundId: string, expiresInSeconds = 300): Promise<string> {
    const [refund] = await this.db
      .select({ id: refunds.id, invoiceYear: transactions.invoiceYear })
      .from(refunds)
      .innerJoin(transactions, eq(transactions.id, refunds.transactionId))
      .where(eq(refunds.id, refundId))
      .limit(1);
    if (!refund) throw new NotFoundAppError('Refund', refundId);

    const bucket = this.config.getOrThrow<string>('INVOICE_BUCKET');
    const path = this.refundObjectPath(refund.invoiceYear, refund.id);

    const exists = await this.supabase.storage
      .from(bucket)
      .list(`refunds/${refund.invoiceYear}`, { search: `${refund.id}.pdf` });
    if (!exists.data || exists.data.length === 0) {
      await this.renderAndStoreRefund(refundId);
    }

    const { data, error } = await this.supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data) {
      throw new AppError('INVOICE_STORAGE_FAILED', `Could not sign credit note URL: ${error?.message}`, HttpStatus.BAD_GATEWAY);
    }
    return data.signedUrl;
  }
}
