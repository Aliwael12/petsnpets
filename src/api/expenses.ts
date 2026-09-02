import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Expense, ExpenseCategory, PaymentMethod } from '../types';

export interface ExpenseFilters {
  /** YYYY-MM-DD, inclusive, matched against paidOn. */
  from?: string | null;
  to?: string | null;
  category?: ExpenseCategory;
  paymentMethod?: PaymentMethod;
}

function queryString(filters: ExpenseFilters): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.category) params.set('category', filters.category);
  if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useExpenses(filters: ExpenseFilters = {}) {
  return useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => api.get<Expense[]>(`/expenses${queryString(filters)}`),
  });
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number; // piastres
  paymentMethod: PaymentMethod;
  payee?: string;
  paidOn: string;
  note?: string;
}

/** Every expense mutation also invalidates the dashboard's financial summary — otherwise
 * the doctor records rent and the Net card keeps showing the old figure. */
function useExpenseMutation<TInput>(fn: (input: TInput) => Promise<Expense>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useCreateExpense() {
  return useExpenseMutation((input: CreateExpenseInput) => api.post<Expense>('/expenses', input, { idempotent: true }));
}

export interface UpdateExpenseInput {
  id: string;
  /** Cosmetic fields only — amount, date and payment method are void-and-re-enter by
   * design, so that editing an expense can never silently restate a past month. */
  category?: ExpenseCategory;
  description?: string;
  payee?: string;
  note?: string;
}

export function useUpdateExpense() {
  return useExpenseMutation(({ id, ...body }: UpdateExpenseInput) => api.patch<Expense>(`/expenses/${id}`, body));
}

export function useVoidExpense() {
  return useExpenseMutation(({ id, reason }: { id: string; reason: string }) =>
    api.post<Expense>(`/expenses/${id}/void`, { reason }),
  );
}
