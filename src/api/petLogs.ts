import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { LogType, Pet, PetLog } from '../types';

export function usePetLogs(petId: string | null) {
  return useQuery({
    queryKey: ['pet-logs', petId],
    queryFn: () => api.get<PetLog[]>(`/pets/${petId}/logs`),
    enabled: !!petId,
  });
}

/** Logs for every pet in the list, combined and stamped with `pet` — used by the Clients
 * profile page, which shows one merged history across all of a client's pets. Each pet is
 * its own query (so the per-pet cache from usePetLogs is reused), fanned out with
 * useQueries since the pet list length is dynamic and hooks can't be called in a loop. */
export function usePetLogsForPets(pets: Pet[]) {
  const results = useQueries({
    queries: pets.map((pet) => ({
      queryKey: ['pet-logs', pet.id],
      queryFn: () => api.get<PetLog[]>(`/pets/${pet.id}/logs`),
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const logs = results.flatMap((r, i) => (r.data ?? []).map((log) => ({ ...log, pet: pets[i] })));
  return { logs, isLoading };
}

export function useUpcomingPetLogs() {
  return useQuery({ queryKey: ['pet-logs', 'upcoming'], queryFn: () => api.get<PetLog[]>('/pet-logs/upcoming') });
}

export interface CreatePetLogInput {
  logType: LogType;
  description: string;
  nextDueDate?: string;
}

export function useCreatePetLog(petId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePetLogInput) => api.post<PetLog>(`/pets/${petId}/logs`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pet-logs', petId] });
      queryClient.invalidateQueries({ queryKey: ['pet-logs', 'upcoming'] });
    },
  });
}
