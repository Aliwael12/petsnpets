import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Pet, PetSex, Species } from '../types';

export function usePets(search?: string) {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return useQuery({ queryKey: ['pets', search ?? ''], queryFn: () => api.get<Pet[]>(`/pets${qs}`) });
}

export function usePet(id: string | null) {
  return useQuery({
    queryKey: ['pets', id],
    queryFn: () => api.get<Pet>(`/pets/${id}`),
    enabled: !!id,
  });
}

export interface CreatePetInput {
  name: string;
  species: Species;
  breed: string;
  sex?: PetSex;
  birthDate?: string;
  clientId?: string;
  newClient?: { name: string; phones: string[] };
  phones: string[];
}

export function useCreatePet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePetInput) => api.post<Pet>('/pets', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export interface UpdatePetInput {
  name?: string;
  species?: Species;
  breed?: string;
  sex?: PetSex | null;
  birthDate?: string | null;
  /** Moves the pet to this client. */
  clientId?: string;
}

/** Admin only: edit a pet or move it to another client. */
export function useUpdatePet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePetInput }) => api.patch<Pet>(`/pets/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}

/** Admin only: delete a pet that has no logs or stays. */
export function useDeletePet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/pets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pets'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    },
  });
}
