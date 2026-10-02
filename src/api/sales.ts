import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { PaymentLine, Transaction } from '../types';

export interface SalesFilters {
  soldBy?: string;
  productId?: string;
  clientId?: string;
  /** A rolling instant window. The Dashboard's "recent sales" list still uses this. */
  sinceDays?: number;
  /** Inclusive Cairo calendar days (YYYY-MM-DD) on created_at. */
  from?: string | null;
  to?: string | null;
}

function salesQueryString(filters: SalesFilters): string {
  const params = new URLSearchParams();
  if (filters.soldBy) params.set('soldBy', filters.soldBy);
  if (filters.productId) params.set('productId', filters.productId);
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.sinceDays) params.set('sinceDays', String(filters.sinceDays));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useSales(filters: SalesFilters = {}) {
  return useQuery({
    queryKey: ['sales', filters],
    queryFn: () => api.get<Transaction[]>(`/sales${salesQueryString(filters)}`),
  });
}

export interface CheckoutInput {
  clientId?: string;
  items: { productId: string; quantity: number }[];
  discountId?: string;
  /** Empty means "not recorded"; otherwise the lines must add up to the bill. */
  payments: PaymentLine[];
  soldBy?: string;
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) => api.post<Transaction>('/sales', input, { idempotent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      // The whole 'analytics' prefix, not just the summary: six of the seven analytics
      // queries had no invalidation at all, so ringing up a sale left "Best sellers"
      // stale until a refocus.
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export interface UpdateSaleInput {
  id: string;
  /** The client the sale belongs to; null makes it a walk-in. */
  clientId?: string | null;
  /** Admin only: the client discount to apply; null removes it. */
  discountId?: string | null;
  /** Cairo wall time, "YYYY-MM-DDTHH:mm" — the server applies the clinic's UTC offset. */
  occurredAt?: string;
  payments?: PaymentLine[];
}

export function useUpdateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateSaleInput) => api.patch<Transaction>(`/sales/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      // Moving a sale to another day or method moves it between the income figures.
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
    },
  });
}

/** Admin only: removes the sale, returns its stock and frees any discount it used. */
export function useDeleteSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/sales/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
    },
  });
}
