import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useUpcomingPetLogs } from '../api/petLogs';
import { useAppointments, useUpdateAppointmentStatus } from '../api/appointments';
import { ApiError } from '../api/client';
import { businessDayKey, formatSlotTime } from '../lib/timezone';
import { Badge, Button, Card, CardHeader, EmptyState, StatTile, formatDate } from '../components/ui';
import type { Appointment, Pet, PetLog } from '../types';
import { CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, Globe, Phone, X } from 'lucide-react';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

interface GridCell {
  year: number;
  month: number;
  day: number;
  inCurrentMonth: boolean;
}

function buildMonthGrid(year: number, month: number): GridCell[] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: GridCell[] = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    cells.push({ year: prevYear, month: prevMonth, day: daysInPrevMonth - i, inCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ year, month, day: d, inCurrentMonth: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1];
    const next = new Date(last.year, last.month, last.day + 1);
    cells.push({ year: next.getFullYear(), month: next.getMonth(), day: next.getDate(), inCurrentMonth: false });
  }
  return cells;
}

/** Reminders and booked appointments share the grid, so they're normalised to one shape
 * before rendering — the cell doesn't care which source an entry came from. */
type CalEvent =
  | { kind: 'reminder'; id: string; dateKey: string; label: string; sub: string; href: string; overdue: boolean }
  | { kind: 'appointment'; id: string; dateKey: string; label: string; sub: string; status: Appointment['status'] };

export function Calendar() {
  const { data: upcomingRaw = [] } = useUpcomingPetLogs();
  const { data: appointments = [] } = useAppointments();
  const updateStatus = useUpdateAppointmentStatus();

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const todayKey = businessDayKey(new Date().toISOString());
  const in7DaysKey = businessDayKey(new Date(Date.now() + 7 * 86_400_000).toISOString());

  const reminders = useMemo(
    () =>
      upcomingRaw
        .filter((l): l is PetLog & { nextDueDate: string; pet: Pet } => !!l.nextDueDate && !!l.pet)
        .map((l) => ({
          kind: 'reminder' as const,
          id: l.id,
          dateKey: businessDayKey(l.nextDueDate),
          label: l.pet.name,
          sub: l.description,
          href: `/pet-logs?pet=${l.pet.id}`,
          overdue: businessDayKey(l.nextDueDate) < todayKey,
          ownerName: l.pet.client?.name ?? 'Unknown',
        })),
    [upcomingRaw, todayKey],
  );

  // Cancelled bookings stay in the database as an audit trail but must not clutter the
  // grid — the calendar shows what is actually happening, not what was called off.
  const liveAppointments = useMemo(() => appointments.filter((a) => a.status !== 'cancelled'), [appointments]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const push = (e: CalEvent) => {
      const list = map.get(e.dateKey) ?? [];
      list.push(e);
      map.set(e.dateKey, list);
    };
    for (const r of reminders) push(r);
    for (const a of liveAppointments) {
      push({
        kind: 'appointment',
        id: a.id,
        dateKey: businessDayKey(a.requestedAt),
        label: `${formatSlotTime(a.requestedAt)} ${a.petName}`,
        sub: `${a.serviceName} · ${a.ownerName}`,
        status: a.status,
      });
    }
    return map;
  }, [reminders, liveAppointments]);

  const pending = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'pending')
        .sort((a, b) => +new Date(a.requestedAt) - +new Date(b.requestedAt)),
    [appointments],
  );

  const overdue = reminders.filter((r) => r.overdue).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const bookedThisWeek = liveAppointments.filter((a) => {
    const k = businessDayKey(a.requestedAt);
    return k >= todayKey && k <= in7DaysKey;
  }).length;
  const dueThisWeek = reminders.filter((r) => r.dateKey >= todayKey && r.dateKey <= in7DaysKey).length;

  const grid = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);

  const decide = (appointment: Appointment, status: 'confirmed' | 'cancelled') => {
    updateStatus.mutate(
      { id: appointment.id, status },
      {
        onSuccess: () =>
          toast.success(status === 'confirmed' ? `Confirmed — ${appointment.petName}` : 'Request declined'),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the request'),
      },
    );
  };

  const goToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const shiftMonth = (delta: number) => {
    setCursor((cur) => {
      const d = new Date(cur.year, cur.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold text-navy-950">Calendar</h1>
        <p className="text-sm text-slate-500">Website bookings and pet reminders coming due</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile
          label="Pending requests"
          value={String(pending.length)}
          hint={pending.length > 0 ? 'From the website' : undefined}
          tone={pending.length > 0 ? 'gold' : 'default'}
        />
        <StatTile label="Booked in 7 days" value={String(bookedThisWeek)} />
        <StatTile label="Reminders due in 7 days" value={String(dueThisWeek)} />
        <StatTile label="Overdue" value={String(overdue.length)} tone={overdue.length > 0 ? 'warn' : 'default'} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-navy-950">
                {MONTH_NAMES[cursor.month]} {cursor.year}
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-navy-700" /> Appointment
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-sky-400" /> Reminder
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={goToday} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-navy-700 hover:bg-slate-100">
                Today
              </button>
              <button onClick={() => shiftMonth(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Previous month">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => shiftMonth(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Next month">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-slate-100">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="bg-slate-50 px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {w}
              </div>
            ))}
            {grid.map((cell, i) => {
              const key = dayKey(cell.year, cell.month, cell.day);
              const dayEvents = eventsByDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <div key={i} className={`min-h-[108px] p-1.5 ${cell.inCurrentMonth ? 'bg-white' : 'bg-slate-50'}`}>
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                      isToday ? 'bg-navy-800 text-white' : cell.inCurrentMonth ? 'text-navy-950' : 'text-slate-300'
                    }`}
                  >
                    {cell.day}
                  </span>
                  <div className="mt-1 flex flex-col gap-1">
                    {dayEvents.slice(0, 3).map((e) =>
                      e.kind === 'appointment' ? (
                        <span
                          key={e.id}
                          title={`${e.label} — ${e.sub}`}
                          className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            e.status === 'pending'
                              ? 'border border-dashed border-navy-200 bg-navy-100 text-navy-800'
                              : e.status === 'completed'
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-navy-700 text-white'
                          }`}
                        >
                          {e.label}
                        </span>
                      ) : (
                        <Link
                          key={e.id}
                          to={e.href}
                          title={`${e.label} · ${e.sub}`}
                          className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${
                            e.overdue ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          {e.label}
                        </Link>
                      ),
                    )}
                    {dayEvents.length > 3 && (
                      <span className="px-1 text-[11px] text-slate-400">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader
              title="Booking requests"
              subtitle={pending.length > 0 ? 'Submitted from the website — confirm or decline' : undefined}
              action={<Globe size={16} className="text-slate-400" />}
            />
            {pending.length === 0 ? (
              <EmptyState title="No pending requests" subtitle="New website bookings land here" />
            ) : (
              <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                {pending.map((a) => (
                  <div key={a.id} className="px-5 py-3.5">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-300 text-navy-900">
                        <CalendarPlus size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy-950">
                          {a.petName} <span className="font-normal text-slate-400">· {a.ownerName}</span>
                        </p>
                        <p className="truncate text-xs text-slate-500">{a.serviceName}</p>
                        <p className="mt-0.5 text-xs font-medium text-navy-700">
                          {formatDate(a.requestedAt)} at {formatSlotTime(a.requestedAt)}
                        </p>
                        <a
                          href={`tel:${a.phone}`}
                          className="mt-1 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-navy-700"
                        >
                          <Phone size={11} /> {a.phone}
                        </a>
                        {a.notes && <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-500">{a.notes}</p>}
                      </div>
                    </div>
                    <div className="mt-2.5 flex gap-2 pl-12">
                      <Button onClick={() => decide(a, 'confirmed')} disabled={updateStatus.isPending} className="flex-1">
                        <Check size={14} /> Confirm
                      </Button>
                      <Button variant="ghost" onClick={() => decide(a, 'cancelled')} disabled={updateStatus.isPending}>
                        <X size={14} /> Decline
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Overdue reminders" subtitle={overdue.length > 0 ? `${overdue.length} past due` : undefined} />
            {overdue.length === 0 ? (
              <EmptyState title="Nothing overdue" subtitle="Every reminder is on schedule" />
            ) : (
              <div className="max-h-[320px] divide-y divide-slate-100 overflow-y-auto">
                {overdue.map((r) => (
                  <Link key={r.id} to={r.href} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                      <CalendarClock size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-950">
                        {r.label} <span className="text-slate-400">· {r.ownerName}</span>
                      </p>
                      <p className="truncate text-xs text-slate-400">{r.sub}</p>
                      <Badge tone="low">Was due {formatDate(`${r.dateKey}T00:00:00Z`)}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
