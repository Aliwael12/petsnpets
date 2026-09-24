import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Reminder, Species } from '../types';

export function useReminders() {
  return useQuery({ queryKey: ['reminders'], queryFn: () => api.get<Reminder[]>('/reminders') });
}

/** A client's pets for the reminder form — its own endpoint because GET /pets is doctor/nurse
 *  only, and anyone at the clinic can leave a reminder. */
export function useReminderPets(clientId: string) {
  return useQuery({
    queryKey: ['reminders', 'pets', clientId],
    queryFn: () => api.get<{ id: string; name: string; species: Species }[]>(`/reminders/pets?clientId=${clientId}`),
    enabled: !!clientId,
  });
}

export interface CreateReminderInput {
  clientId: string;
  petId?: string;
  description: string;
  dueAt: string;
}

export function useCreateReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReminderInput) => api.post<Reminder>('/reminders', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  });
}

export function useCompleteReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<Reminder>(`/reminders/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  });
}
