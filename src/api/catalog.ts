import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Product, ProductCategory } from '../types';

export interface ProductFilters {
  category?: ProductCategory | 'all';
  search?: string;
  activeOnly?: boolean;
}

function productsQueryString(filters: ProductFilters): string {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.search) params.set('search', filters.search);
  if (filters.activeOnly !== undefined) params.set('activeOnly', String(filters.activeOnly));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useProducts(filters: ProductFilters = {}) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => api.get<Product[]>(`/catalog/products${productsQueryString(filters)}`),
  });
}

export function usePriceCheck(query: string) {
  return useQuery({
    queryKey: ['products', 'price-check', query],
    queryFn: () => api.get<Product[]>(`/catalog/products/price-check?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });
}

export interface CreateProductInput {
  name: string;
  category: ProductCategory;
  sku: string;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => api.post<Product>('/catalog/products', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<CreateProductInput> & { active?: boolean } }) =>
      api.patch<Product>(`/catalog/products/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}
