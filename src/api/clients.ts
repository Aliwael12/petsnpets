import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from './client';
import type { Client } from '../types';

export function useClients(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return useQuery({
    queryKey: ['clients', search ?? ''],
    queryFn: () => api.get<Client[]>(`/clients${qs}`),
  });
}

export function useClient(id: string | null) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => api.get<Client>(`/clients/${id}`),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; phones: string[] }) => api.post<Client>('/clients', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; phones?: string[] } }) =>
      api.patch<Client>(`/clients/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients'] }),
  });
}

/** Returns `{ ok: true }` on success or `{ ok: false, reason }` if the client still has
 * linked pets — callers show that reason rather than treating it as an unexpected error. */
export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<{ ok: true } | { ok: false; reason: string }> => {
      try {
        await api.delete(`/clients/${id}`);
        return { ok: true };
      } catch (err) {
        if (err instanceof ApiError && err.code === 'CLIENT_HAS_PETS') {
          return { ok: false, reason: err.message };
        }
        throw err;
      }
    },
    onSuccess: (result) => {
      if (result.ok) queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}
