import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { useAuthStore } from '../store/useAuthStore';
import type { Employee } from '../types';

export function useActiveEmployees() {
  return useQuery({
    queryKey: ['employees', 'active'],
    queryFn: () => api.get<Employee[]>('/employees/active'),
  });
}

interface PinLoginResponse {
  token: string;
  expiresAt: string;
  employee: { id: string; name: string; role: Employee['role']; enabledFeatures: string[] };
}

function deviceId(): string {
  const key = 'pets-and-pets-device-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function usePinLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (vars: { employeeId: string; pin: string }) =>
      api.post<PinLoginResponse>('/sessions/pin', { ...vars, deviceId: deviceId() }),
    onSuccess: (data) => setSession(data),
  });
}

export function useLogout() {
  const clearSession = useAuthStore((s) => s.clearSession);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/sessions/logout'),
    onSettled: () => {
      clearSession();
      queryClient.clear();
    },
  });
}
