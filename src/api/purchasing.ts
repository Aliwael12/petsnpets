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

export function useSupplierOrders() {
  return useQuery({ queryKey: ['supplier-orders'], queryFn: () => api.get<SupplierOrder[]>('/purchasing/supplier-orders') });
}

export interface CreateSupplierOrderInput {
  supplierId?: string;
  newSupplierName?: string;
  productId: string;
  quantity: number;
  costTotal: number;
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
