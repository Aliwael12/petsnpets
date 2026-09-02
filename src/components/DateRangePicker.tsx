import { useId, useState } from 'react';
import { Button, Input } from './ui';
import { todayKey } from '../lib/timezone';
import type { DayRange } from '../types';

export interface DateRangePickerProps {
  /** Controlled. Both sides may be null — an open-ended range is a legal state. */
  value: DayRange;
  /** Fired only with a VALID pair. An inverted or half-typed draft never reaches here. */
  onChange: (next: DayRange) => void;
  /** Latest selectable day. Defaults to today in the clinic's timezone: there is no money
   *  in the future, and a future bound makes every range label overstate its window. */
  max?: string;
  /** 'compact' drops the helper line and tightens the inputs so the picker sits beside a
   *  heading. 'default' keeps the helper line, for where the picker is the main control. */
  size?: 'default' | 'compact';
  className?: string;
}

/**
 * The one date control in the app. Two native date inputs and a Clear — no presets, no
 * calendar popover, no date library: every other date field here is a bare
 * `<input type="date">` and a bespoke overlay would be the only one of its kind.
 */
export function DateRangePicker({
  value,
  onChange,
  max = todayKey(),
  size = 'default',
  className = '',
}: DateRangePickerProps) {
  // The committed range only moves when the draft is valid. Without this, typing a year
  // digit by digit fires onChange with "0002-09-01" and every card on the page refetches
  // several times per keystroke.
  //
  // Re-synced during render rather than in an effect (React's "adjusting state when a prop
  // changes" pattern): an effect would paint the stale draft first, then immediately
  // re-render, which is visible as a flicker on a control someone is typing into.
  // Unique per instance: nothing renders two pickers on one screen today, but hardcoded
  // ids would silently point both labels at the first one the day something does.
  const id = useId();
  const [draft, setDraft] = useState<DayRange>(value);
  const [synced, setSynced] = useState<DayRange>(value);
  if (synced.from !== value.from || synced.to !== value.to) {
    setSynced(value);
    setDraft(value);
  }

  const inverted = !!draft.from && !!draft.to && draft.from > draft.to;
  // ui.tsx's Input hard-codes `w-full` ahead of the caller's className, so the width has to
  // live on the wrapper rather than on the input itself.
  const width = size === 'compact' ? 'w-[9.5rem]' : 'w-44';

  const commit = (next: DayRange) => {
    setDraft(next);
    // Never auto-swap an inverted pair: silently rewriting what someone typed is how a
    // doctor confidently reads the wrong month.
    if (next.from && next.to && next.from > next.to) return;
    onChange(next);
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className={width}>
          <label htmlFor={`${id}-from`} className="mb-1 block text-xs font-medium text-slate-500">
            From
          </label>
          <Input
            id={`${id}-from`}
            data-testid="range-from"
            type="date"
            value={draft.from ?? ''}
            max={draft.to || max}
            onChange={(e) => commit({ ...draft, from: e.target.value || null })}
          />
        </div>
        <div className={width}>
          <label htmlFor={`${id}-to`} className="mb-1 block text-xs font-medium text-slate-500">
            To
          </label>
          <Input
            id={`${id}-to`}
            data-testid="range-to"
            type="date"
            value={draft.to ?? ''}
            min={draft.from || undefined}
            max={max}
            aria-invalid={inverted || undefined}
            className={inverted ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}
            onChange={(e) => commit({ ...draft, to: e.target.value || null })}
          />
        </div>
        <Button variant="ghost" onClick={() => commit({ from: null, to: null })}>
          Clear
        </Button>
      </div>

      {inverted ? (
        <p className="text-xs font-medium text-red-600">The start date is after the end date.</p>
      ) : size === 'default' ? (
        <p className="text-xs text-slate-400">
          Leave either side empty for an open-ended range. Dates are read in the clinic&apos;s timezone.
        </p>
      ) : null}
    </div>
  );
}
