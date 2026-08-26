import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Employee, Role } from '../types';

export function useEmployees() {
  return useQuery({ queryKey: ['employees', 'all'], queryFn: () => api.get<Employee[]>('/employees') });
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

export function useUpdateEmployeeFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabledFeatures }: { id: string; enabledFeatures: string[] }) =>
      api.patch<Employee>(`/employees/${id}/features`, { enabledFeatures }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });
}
