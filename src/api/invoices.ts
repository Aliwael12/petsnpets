import { api } from './client';

/** Fetches a fresh short-lived signed URL and opens it in a new tab — invoices are rendered
 * and stored server-side now, so there's nothing to generate client-side (see the old
 * lib/invoice.tsx, which is no longer used for this). */
export async function openInvoice(transactionId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/invoices/${transactionId}`);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Same flow for a refund's credit note — rendered and stored server-side on first request. */
export async function openRefundInvoice(refundId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/invoices/refunds/${refundId}`);
  window.open(url, '_blank', 'noopener,noreferrer');
}
