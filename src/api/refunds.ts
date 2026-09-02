import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { PaymentMethod, Refund } from '../types';

export interface RefundFilters {
  /** Inclusive Cairo calendar days (YYYY-MM-DD) on created_at. */
  from?: string | null;
  to?: string | null;
}

export function useRefunds(filters: RefundFilters = {}) {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  return useQuery({
    queryKey: ['refunds', filters],
    queryFn: () => api.get<Refund[]>(`/refunds${qs ? `?${qs}` : ''}`),
  });
}

export interface CreateRefundInput {
  transactionId: string;
  items: { productId: string; quantity: number }[];
  reason?: string;
  /** Omitted means "same way the sale was paid", which the server fills in. */
  paymentMethod?: PaymentMethod;
}

export function useCreateRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRefundInput) => api.post<Refund>('/refunds', input, { idempotent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
