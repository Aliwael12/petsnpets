import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pdf } from '@react-pdf/renderer';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.constants';
import type { Database } from '../db/db.types';
import { transactions } from '../db/schema';
import { NotFoundAppError, AppError } from '../common/errors/app-error';
import { HttpStatus } from '@nestjs/common';
import { SUPABASE_ADMIN } from '../supabase/supabase.module';
import { InvoiceDocument } from './invoice-document';

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

    const buffer = await pdf(
      <InvoiceDocument
        transaction={{
          invoiceYear: txn.invoiceYear,
          invoiceNo: txn.invoiceNo,
          customerName: txn.customerName,
          createdAt: txn.createdAt,
          subtotal: txn.subtotal,
          discountAmount: txn.discountAmount,
          total: txn.total,
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
}
