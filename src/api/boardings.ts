import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Boarding } from '../types';

export function useBoardings() {
  return useQuery({ queryKey: ['boardings'], queryFn: () => api.get<Boarding[]>('/boardings') });
}

export interface CreateBoardingInput {
  clientId: string;
  petId: string;
  totalAmount: number;
  paidAmount: number;
  startDate: string;
  endDate: string;
  note?: string;
}

export function useCreateBoarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBoardingInput) => api.post<Boarding>('/boardings', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardings'] }),
  });
}

export type UpdateBoardingInput = Partial<Pick<CreateBoardingInput, 'totalAmount' | 'paidAmount' | 'startDate' | 'endDate' | 'note'>>;

export function useUpdateBoarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateBoardingInput }) => api.patch<Boarding>(`/boardings/${id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardings'] }),
  });
}
