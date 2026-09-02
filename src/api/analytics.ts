import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type {
  BestSeller,
  DayRange,
  EmployeeSummary,
  FinancialSummary,
  RevenueByCategory,
  RevenueByEmployee,
  RevenueSplit,
  RevenueTimeseriesPoint,
} from '../types';

/**
 * `?from=&to=` as inclusive Cairo day keys; omitting a side is open-ended there.
 *
 * Every hook below appends `range.from, range.to` to its EXISTING key prefix rather than
 * replacing it. TanStack invalidation is prefix-matching, so `['analytics', ...]` keeps
 * matching the money mutations' `invalidateQueries({ queryKey: ['analytics'] })`. A key
 * shaped `['financial-summary', {from, to}]` would break all four of them silently —
 * record rent, and the Net card never moves.
 */
function rangeQs(range: DayRange, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useRevenueTimeseries(range: DayRange) {
  return useQuery({
    queryKey: ['analytics', 'revenue-timeseries', range.from, range.to],
    queryFn: () => api.get<RevenueTimeseriesPoint[]>(`/analytics/revenue-timeseries${rangeQs(range)}`),
  });
}

export function useBestSellers(range: DayRange) {
  return useQuery({
    queryKey: ['analytics', 'best-sellers', range.from, range.to],
    queryFn: () => api.get<BestSeller[]>(`/analytics/best-sellers${rangeQs(range)}`),
  });
}

export function useRevenueByEmployee(range: DayRange) {
  return useQuery({
    queryKey: ['analytics', 'revenue-by-employee', range.from, range.to],
    queryFn: () => api.get<RevenueByEmployee[]>(`/analytics/revenue-by-employee${rangeQs(range)}`),
  });
}

export function useRevenueByCategory(range: DayRange) {
  return useQuery({
    queryKey: ['analytics', 'revenue-by-category', range.from, range.to],
    queryFn: () => api.get<RevenueByCategory[]>(`/analytics/revenue-by-category${rangeQs(range)}`),
  });
}

export function useRevenueSplit(kind: 'service' | 'shop', range: DayRange) {
  return useQuery({
    queryKey: ['analytics', 'revenue-split', kind, range.from, range.to],
    queryFn: () => api.get<RevenueSplit>(`/analytics/revenue-split${rangeQs(range, { kind })}`),
  });
}

/** Income, expenses and net for the selected range, the calendar month and all time, in one
 *  request — the Dashboard cards AND Money in / out's stat tiles both read this, so the two
 *  screens cannot show the owner two different Net figures for the same dates. */
export function useFinancialSummary(range: DayRange) {
  return useQuery({
    queryKey: ['analytics', 'financial-summary', range.from, range.to],
    queryFn: () => api.get<FinancialSummary>(`/analytics/financial-summary${rangeQs(range)}`),
  });
}

export function useEmployeeSummary(employeeId: string | null, range: DayRange) {
  return useQuery({
    queryKey: ['analytics', 'employee-summary', employeeId, range.from, range.to],
    queryFn: () =>
      api.get<EmployeeSummary>(`/analytics/employee-summary${rangeQs(range, { employeeId: employeeId! })}`),
    enabled: !!employeeId,
  });
}
