import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Appointment, AppointmentStatus, BookableService, DayAvailability, OpeningHours, Species } from '../types';

// --- Public (website, no session) -----------------------------------------
// These hit the API's `public/*` routes, which are the only unauthenticated
// surface. `api.get` simply omits the Authorization header when no token is set.

export function useBookableServices() {
  return useQuery({
    queryKey: ['public', 'services'],
    queryFn: () => api.get<BookableService[]>('/public/services'),
    staleTime: 5 * 60_000,
  });
}

export function useOpeningHours() {
  return useQuery({
    queryKey: ['public', 'opening-hours'],
    queryFn: () => api.get<OpeningHours>('/public/opening-hours'),
    staleTime: 60 * 60_000,
  });
}

export function useAvailability(date: string | null) {
  return useQuery({
    queryKey: ['public', 'availability', date],
    queryFn: () => api.get<DayAvailability>(`/public/availability?date=${date}`),
    enabled: !!date,
    // Slots go stale the moment someone else books one, so don't serve a cached
    // grid that would let a visitor pick a time that is already gone.
    staleTime: 0,
  });
}

export interface BookAppointmentInput {
  ownerName: string;
  phone: string;
  email?: string;
  petName: string;
  species: Species;
  serviceId?: string;
  requestedAt: string;
  notes?: string;
}

export interface BookingConfirmation {
  id: string;
  ownerName: string;
  petName: string;
  serviceName: string;
  requestedAt: string;
  status: AppointmentStatus;
}

export function useBookAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BookAppointmentInput) => api.post<BookingConfirmation>('/public/appointments', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public', 'availability'] }),
  });
}

// --- Staff (CRM, authenticated) -------------------------------------------

export function useAppointments(filters: { status?: AppointmentStatus; upcomingOnly?: boolean } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.upcomingOnly) params.set('upcomingOnly', 'true');
  const qs = params.toString();
  return useQuery({
    queryKey: ['appointments', filters],
    queryFn: () => api.get<Appointment[]>(`/appointments${qs ? `?${qs}` : ''}`),
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, clientId }: { id: string; status: AppointmentStatus; clientId?: string }) =>
      api.patch<Appointment>(`/appointments/${id}/status`, { status, clientId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });
}
