import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Pet, Species } from '../types';

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
