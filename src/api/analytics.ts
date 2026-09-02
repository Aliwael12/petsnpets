import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type {
  BestSeller,
  FinancialSummary,
  EmployeeSummary,
  RevenueByCategory,
  RevenueByEmployee,
  RevenueSplit,
  RevenueTimeseriesPoint,
} from '../types';

export function useRevenueTimeseries(days = 30) {
  return useQuery({
    queryKey: ['analytics', 'revenue-timeseries', days],
    queryFn: () => api.get<RevenueTimeseriesPoint[]>(`/analytics/revenue-timeseries?days=${days}`),
  });
}

export function useBestSellers() {
  return useQuery({ queryKey: ['analytics', 'best-sellers'], queryFn: () => api.get<BestSeller[]>('/analytics/best-sellers') });
}

export function useRevenueByEmployee() {
  return useQuery({
    queryKey: ['analytics', 'revenue-by-employee'],
    queryFn: () => api.get<RevenueByEmployee[]>('/analytics/revenue-by-employee'),
  });
}

export function useRevenueByCategory() {
  return useQuery({
    queryKey: ['analytics', 'revenue-by-category'],
    queryFn: () => api.get<RevenueByCategory[]>('/analytics/revenue-by-category'),
  });
}

export function useRevenueSplit(kind: 'service' | 'shop') {
  return useQuery({
    queryKey: ['analytics', 'revenue-split', kind],
    queryFn: () => api.get<RevenueSplit>(`/analytics/revenue-split?kind=${kind}`),
  });
}

/** Income, expenses and net for the current month and all time, in one request — the
 * dashboard's money cards all read from this so they can never disagree with each other. */
export function useFinancialSummary() {
  return useQuery({
    queryKey: ['analytics', 'financial-summary'],
    queryFn: () => api.get<FinancialSummary>('/analytics/financial-summary'),
  });
}

export function useEmployeeSummary(employeeId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'employee-summary', employeeId],
    queryFn: () => api.get<EmployeeSummary>(`/analytics/employee-summary?employeeId=${employeeId}`),
    enabled: !!employeeId,
  });
}
