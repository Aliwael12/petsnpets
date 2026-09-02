import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { PaymentMethod, Refund } from '../types';

export function useRefunds() {
  return useQuery({ queryKey: ['refunds'], queryFn: () => api.get<Refund[]>('/refunds') });
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
      queryClient.invalidateQueries({ queryKey: ['analytics', 'financial-summary'] });
    },
  });
}
