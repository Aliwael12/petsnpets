import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Category, Product, ProductCategory, ProductKind } from '../types';

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
  brand?: string;
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


// --- Categories (Settings → Categories) -----------------------------------

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/catalog/categories'),
    // Categories change rarely but gate the product forms, so a slightly longer window is
    // safe and saves a request on every page that renders a category picker.
    staleTime: 60_000,
  });
}

export interface CreateCategoryInput {
  name: string;
  label: string;
  kind: ProductKind;
  sortOrder?: number;
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) => api.post<Category>('/catalog/categories', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { label?: string; active?: boolean; sortOrder?: number } }) =>
      api.patch<Category>(`/catalog/categories/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/categories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories'] }),
  });
}
