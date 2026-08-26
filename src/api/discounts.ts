import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Discount, DiscountKind } from '../types';

export function useDiscounts(filters: { clientId?: string; availableOnly?: boolean } = {}, options: { enabled?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.clientId) params.set('clientId', filters.clientId);
  if (filters.availableOnly) params.set('availableOnly', 'true');
  const qs = params.toString();
  return useQuery({
    queryKey: ['discounts', filters],
    queryFn: () => api.get<Discount[]>(`/discounts${qs ? `?${qs}` : ''}`),
    enabled: options.enabled,
  });
}

export interface CreateDiscountInput {
  clientId: string;
  kind: DiscountKind;
  value: number;
  note?: string;
}

export function useCreateDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDiscountInput) => api.post<Discount>('/discounts', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discounts'] }),
  });
}

export function useRevokeDiscount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/discounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['discounts'] }),
  });
}
