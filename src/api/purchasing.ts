import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { PaymentMethod, Supplier, SupplierBalance, SupplierOrder, SupplierPayment } from '../types';

export function useSuppliers() {
  return useQuery({ queryKey: ['suppliers'], queryFn: () => api.get<Supplier[]>('/purchasing/suppliers') });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; contactInfo?: string }) => api.post<Supplier>('/purchasing/suppliers', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export interface SupplierOrderFilters {
  supplierId?: string;
  /** Inclusive Cairo calendar days (YYYY-MM-DD) on received_at. */
  from?: string | null;
  to?: string | null;
  paymentMethod?: PaymentMethod;
}

export function useSupplierOrders(filters: SupplierOrderFilters = {}) {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
  const qs = params.toString();
  return useQuery({
    queryKey: ['supplier-orders', filters],
    queryFn: () => api.get<SupplierOrder[]>(`/purchasing/supplier-orders${qs ? `?${qs}` : ''}`),
  });
}

export interface CreateSupplierOrderInput {
  supplierId?: string;
  newSupplierName?: string;
  /** Exactly one of productId (existing catalog item) or newProduct (free text). */
  productId?: string;
  newProduct?: {
    brand?: string;
    category: string;
    name: string;
    unitPrice?: number;
    lowStockThreshold?: number;
  };
  quantity: number;
  unitCost: number;
  expiryDate?: string;
  receivedAt?: string;
  paymentMethod?: PaymentMethod;
}

export function useCreateSupplierOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierOrderInput) => api.post<SupplierOrder>('/purchasing/supplier-orders', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-balances'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

/** A live balance per supplier — what they've shipped vs. what's been paid. Not
 *  date-ranged: owing money isn't a period fact the way income/expenses are. */
export function useSupplierBalances() {
  return useQuery({
    queryKey: ['supplier-balances'],
    queryFn: () => api.get<SupplierBalance[]>('/purchasing/supplier-balances'),
  });
}

export interface SupplierPaymentFilters {
  supplierId?: string;
  /** Inclusive Cairo calendar days (YYYY-MM-DD) on paid_at. */
  from?: string | null;
  to?: string | null;
}

export function useSupplierPayments(filters: SupplierPaymentFilters = {}) {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  return useQuery({
    queryKey: ['supplier-payments', filters],
    queryFn: () => api.get<SupplierPayment[]>(`/purchasing/supplier-payments${qs ? `?${qs}` : ''}`),
  });
}

export interface CreateSupplierPaymentInput {
  supplierId: string;
  amount: number;
  paymentMethod?: PaymentMethod;
}

export function useSettleSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierPaymentInput) => api.post<SupplierPayment>('/purchasing/supplier-payments', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-balances'] });
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] });
    },
  });
}
