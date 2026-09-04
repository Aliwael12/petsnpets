import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Employee, Permission, Role } from '../types';

/** The roster is behind employees:manage. Pass `enabled: false` anywhere it is merely
 *  nice-to-have, so a page doesn't fire a request that can only come back 403. */
export function useEmployees(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['employees', 'all'],
    queryFn: () => api.get<Employee[]>('/employees'),
    enabled: options.enabled ?? true,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; role: Role; pin: string }) => api.post<Employee>('/employees', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useToggleEmployeeActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Employee>(`/employees/${id}/toggle-active`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useRemoveEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/employees/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}

export function useUpdateEmployeeRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role, resetFeatures }: { id: string; role: Role; resetFeatures?: boolean }) =>
      api.patch<Employee>(`/employees/${id}/role`, { role, resetFeatures: resetFeatures ?? false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}

/** Tabs and permission grants save together — one screen, one request. */
export function useUpdateEmployeeFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabledFeatures, permissions }: { id: string; enabledFeatures: string[]; permissions?: Permission[] }) =>
      api.patch<Employee>(`/employees/${id}/features`, { enabledFeatures, permissions }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}
