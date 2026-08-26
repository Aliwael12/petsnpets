import { api } from './client';

/** Fetches a fresh short-lived signed URL and opens it in a new tab — invoices are rendered
 * and stored server-side now, so there's nothing to generate client-side (see the old
 * lib/invoice.tsx, which is no longer used for this). */
export async function openInvoice(transactionId: string): Promise<void> {
  const { url } = await api.get<{ url: string }>(`/invoices/${transactionId}`);
  window.open(url, '_blank', 'noopener,noreferrer');
}
