import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { PaymentMethod, Transaction } from '../types';

export interface SalesFilters {
  soldBy?: string;
  productId?: string;
  clientId?: string;
  sinceDays?: number;
}

function salesQueryString(filters: SalesFilters): string {
  const params = new URLSearchParams();
  if (filters.soldBy) params.set('soldBy', filters.soldBy);
  if (filters.productId) params.set('productId', filters.productId);
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.sinceDays) params.set('sinceDays', String(filters.sinceDays));
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
  clientId: string;
  items: { productId: string; quantity: number }[];
  discountId?: string;
  paymentMethod?: PaymentMethod;
}

export function useCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckoutInput) => api.post<Transaction>('/sales', input, { idempotent: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['discounts'] });
      queryClient.invalidateQueries({ queryKey: ['analytics', 'financial-summary'] });
    },
  });
}
