import { create } from 'zustand';
import { startOfMonthKey, todayKey } from '../lib/timezone';
import type { DayRange } from '../types';

const defaultRange = (): DayRange => ({ from: startOfMonthKey(), to: todayKey() });

interface DateRangeState {
  range: DayRange;
  setRange: (range: DayRange) => void;
  reset: () => void;
}

/**
 * One date range shared by the Dashboard money cards, Money in / out and Analytics — the
 * three screens answer the same question about the same money, and a range that resets on
 * navigation re-introduces exactly the two-different-Nets disagreement the comments in
 * MoneyInOut.tsx and analytics.service.ts were written to prevent.
 *
 * Deliberately NOT wrapped in zustand `persist`, unlike useAuthStore: a register staying
 * signed in across a refresh is expected POS behaviour; a filter chosen last Tuesday
 * silently governing today's dashboard is a way to read the wrong month with confidence.
 *
 * Defaults to month-to-date rather than empty: an empty default would mean an unbounded
 * first paint, and a Dashboard whose selected-range row merely duplicates its All time row.
 */
export const useDateRangeStore = create<DateRangeState>((set) => ({
  range: defaultRange(),
  setRange: (range) => set({ range }),
  reset: () => set({ range: defaultRange() }),
}));
