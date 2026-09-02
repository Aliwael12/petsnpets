import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Supplier, SupplierOrder } from '../types';

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
  /** ISO instants — inclusive bounds on when the shipment was received. */
  from?: string;
  to?: string;
}

export function useSupplierOrders(filters: SupplierOrderFilters = {}) {
  const params = new URLSearchParams();
  if (filters.supplierId) params.set('supplierId', filters.supplierId);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
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
    unitPrice: number;
    lowStockThreshold?: number;
  };
  quantity: number;
  costTotal: number;
  expiryDate?: string;
}

export function useCreateSupplierOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierOrderInput) => api.post<SupplierOrder>('/purchasing/supplier-orders', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-orders'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
