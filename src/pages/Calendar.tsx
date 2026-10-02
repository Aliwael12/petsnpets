import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useUpcomingPetLogs } from '../api/petLogs';
import { useAppointments, useUpdateAppointmentStatus } from '../api/appointments';
import { useCompleteReminder, useReminders } from '../api/reminders';
import { ApiError } from '../api/client';
import { businessDayKey, formatSlotTime } from '../lib/timezone';
import { matchesPersonQuery, type PersonFields } from '../lib/search';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, StatTile, formatDate } from '../components/ui';
import { AddReminderModal } from '../components/AddReminderModal';
import type { Appointment, Pet, PetLog, Reminder } from '../types';
import { Bell, BellPlus, CalendarClock, CalendarPlus, Check, ChevronLeft, ChevronRight, Globe, Phone, Search, X } from 'lucide-react';

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
  | { kind: 'task'; id: string; dateKey: string; label: string; sub: string; overdue: boolean; reminder: Reminder }
  | { kind: 'appointment'; id: string; dateKey: string; label: string; sub: string; status: Appointment['status'] };

/** One row of the search results: a booking or a reminder, with who it's for. */
interface SearchHit {
  key: string;
  kind: 'booking' | 'reminder';
  dateKey: string;
  when: string;
  title: string;
  owner: string;
  phone?: string;
  legacyId?: number | null;
  detail: string;
  status?: Appointment['status'];
  overdue?: boolean;
  /** A pet-log follow-up opens that pet's log; an added reminder opens its own card. */
  href?: string;
  reminder?: Reminder;
}

const BOOKING_STATUS_TONE: Record<Appointment['status'], string> = {
  pending: 'sale',
  confirmed: 'active',
  completed: 'inactive',
  cancelled: 'low',
};

/** A plain date key read back in the clinic's timezone, with the year: "2 Oct 2026". */
const formatDayKeyLong = (dayKey: string) => formatDate(`${dayKey}T12:00:00Z`);

export function Calendar() {
  const { data: upcomingRaw = [] } = useUpcomingPetLogs();
  const { data: appointments = [] } = useAppointments();
  const { data: openReminders = [] } = useReminders();
  const updateStatus = useUpdateAppointmentStatus();
  const completeReminder = useCompleteReminder();

  const [addReminderOpen, setAddReminderOpen] = useState(false);
  const [viewing, setViewing] = useState<Reminder | null>(null);
  const [search, setSearch] = useState('');
  const query = search.trim();

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
          phone: l.pet.client?.phones?.[0]?.phone ?? l.pet.phones?.[0]?.phone,
          legacyId: l.pet.client?.legacyId ?? null,
          person: {
            names: [l.pet.name, l.pet.client?.name],
            phones: [...(l.pet.client?.phones ?? []).map((p) => p.phone), ...(l.pet.phones ?? []).map((p) => p.phone)],
            legacyId: l.pet.client?.legacyId,
          } satisfies PersonFields,
        })),
    [upcomingRaw, todayKey],
  );

  const tasks = useMemo(
    () =>
      openReminders.map((r) => ({
        kind: 'task' as const,
        id: r.id,
        dateKey: businessDayKey(r.dueAt),
        label: r.pet?.name ?? r.client?.name ?? 'Reminder',
        sub: r.description,
        overdue: businessDayKey(r.dueAt) < todayKey,
        ownerName: r.client?.name ?? 'Unknown',
        reminder: r,
        phone: r.client?.phones?.[0]?.phone,
        legacyId: r.client?.legacyId ?? null,
        person: {
          names: [r.pet?.name, r.client?.name],
          phones: (r.client?.phones ?? []).map((p) => p.phone),
          legacyId: r.client?.legacyId,
        } satisfies PersonFields,
      })),
    [openReminders, todayKey],
  );

  const markDone = (reminder: Reminder) => {
    completeReminder.mutate(reminder.id, {
      onSuccess: () => {
        toast.success('Reminder marked done');
        setViewing(null);
      },
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the reminder'),
    });
  };

  // Cancelled bookings stay in the database as an audit trail but must not clutter the
  // grid — the calendar shows what is actually happening, not what was called off.
  const liveAppointments = useMemo(() => appointments.filter((a) => a.status !== 'cancelled'), [appointments]);

  // Search covers every booking (cancelled ones too, since "did they cancel?" is a real
  // question) and every open reminder, by pet name, customer name, phone or client ID.
  const hits = useMemo<SearchHit[]>(() => {
    if (!query) return [];
    const list: SearchHit[] = [];
    for (const r of reminders) {
      if (!matchesPersonQuery(query, r.person)) continue;
      list.push({
        key: `reminder-${r.id}`,
        kind: 'reminder',
        dateKey: r.dateKey,
        when: formatDayKeyLong(r.dateKey),
        title: r.label,
        owner: r.ownerName,
        phone: r.phone,
        legacyId: r.legacyId,
        detail: r.sub,
        overdue: r.overdue,
        href: r.href,
      });
    }
    for (const t of tasks) {
      if (!matchesPersonQuery(query, t.person)) continue;
      list.push({
        key: `task-${t.id}`,
        kind: 'reminder',
        dateKey: t.dateKey,
        when: formatDayKeyLong(t.dateKey),
        title: t.label,
        owner: t.ownerName,
        phone: t.phone,
        legacyId: t.legacyId,
        detail: t.sub,
        overdue: t.overdue,
        reminder: t.reminder,
      });
    }
    for (const a of appointments) {
      const person: PersonFields = {
        names: [a.petName, a.ownerName, a.client?.name],
        phones: [a.phone, ...(a.client?.phones ?? []).map((p) => p.phone)],
        legacyId: a.client?.legacyId,
      };
      if (!matchesPersonQuery(query, person)) continue;
      list.push({
        key: `appointment-${a.id}`,
        kind: 'booking',
        dateKey: businessDayKey(a.requestedAt),
        when: `${formatDate(a.requestedAt)} · ${formatSlotTime(a.requestedAt)}`,
        title: a.petName,
        owner: a.client?.name ?? a.ownerName,
        phone: a.phone,
        legacyId: a.client?.legacyId,
        detail: a.serviceName,
        status: a.status,
      });
    }
    return list.sort((x, y) => x.dateKey.localeCompare(y.dateKey));
  }, [query, reminders, tasks, appointments]);
  const hitKeys = useMemo(() => new Set(hits.map((h) => h.key)), [hits]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    const push = (e: CalEvent) => {
      if (query && !hitKeys.has(`${e.kind}-${e.id}`)) return;
      const list = map.get(e.dateKey) ?? [];
      list.push(e);
      map.set(e.dateKey, list);
    };
    for (const r of reminders) push(r);
    for (const t of tasks) push(t);
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
  }, [reminders, tasks, liveAppointments, query, hitKeys]);

  const pending = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'pending')
        .sort((a, b) => +new Date(a.requestedAt) - +new Date(b.requestedAt)),
    [appointments],
  );

  const overdue = [...reminders, ...tasks].filter((r) => r.overdue).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const bookedThisWeek = liveAppointments.filter((a) => {
    const k = businessDayKey(a.requestedAt);
    return k >= todayKey && k <= in7DaysKey;
  }).length;
  const dueThisWeek = [...reminders, ...tasks].filter((r) => r.dateKey >= todayKey && r.dateKey <= in7DaysKey).length;

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

  /** Shows the month a search result falls in, so it can be seen in context on the grid. */
  const jumpTo = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    setCursor({ year: y, month: m - 1 });
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Calendar</h1>
          <p className="text-sm text-slate-500">Website bookings and pet reminders coming due</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search name, phone or client ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 text-sm"
              aria-label="Search bookings and reminders"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button onClick={() => setAddReminderOpen(true)}>
            <BellPlus size={16} /> Add reminder
          </Button>
        </div>
      </div>

      {query && (
        <Card>
          <CardHeader
            title="Search results"
            subtitle={`${hits.length} ${hits.length === 1 ? 'match' : 'matches'} for “${query}”. The calendar below shows only these.`}
          />
          {hits.length === 0 ? (
            <EmptyState title="No bookings or reminders match" subtitle="Try a pet name, the customer’s name, a phone number or a client ID like #123" />
          ) : (
            <div className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
              {hits.map((h) => {
                const body = (
                  <>
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        h.kind === 'booking' ? 'bg-navy-100 text-navy-800' : h.overdue ? 'bg-red-100 text-red-600' : 'bg-sky-100 text-sky-700'
                      }`}
                    >
                      {h.kind === 'booking' ? <CalendarPlus size={16} /> : <Bell size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-950">
                        {h.title} <span className="font-normal text-slate-400">· {h.owner}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">{h.detail}</p>
                      <p className="truncate text-xs text-slate-400">
                        {[h.legacyId != null ? `#${h.legacyId}` : null, h.phone].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-xs font-medium text-navy-700">{h.when}</span>
                      {h.kind === 'booking' && h.status ? (
                        <Badge tone={BOOKING_STATUS_TONE[h.status]}>{h.status}</Badge>
                      ) : (
                        <Badge tone={h.overdue ? 'low' : 'vaccination'}>{h.overdue ? 'Overdue' : 'Reminder'}</Badge>
                      )}
                    </div>
                  </>
                );
                const rowClass = 'flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50';
                return h.href ? (
                  <Link key={h.key} to={h.href} className={rowClass}>
                    {body}
                  </Link>
                ) : (
                  <button
                    key={h.key}
                    type="button"
                    className={rowClass}
                    onClick={() => {
                      jumpTo(h.dateKey);
                      if (h.reminder) setViewing(h.reminder);
                    }}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
          )}
        </Card>
      )}

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
                      ) : e.kind === 'task' ? (
                        <button
                          key={e.id}
                          onClick={() => setViewing(e.reminder)}
                          title={`${e.label} · ${e.sub}`}
                          className={`truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium ${
                            e.overdue ? 'bg-red-100 text-red-700' : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          {e.label}
                        </button>
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
                {overdue.map((r) => {
                  const body = (
                    <>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
                        <CalendarClock size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-navy-950">
                          {r.label} <span className="text-slate-400">· {r.ownerName}</span>
                        </p>
                        <p className="truncate text-xs text-slate-400">{r.sub}</p>
                        <Badge tone="low">Was due {formatDate(`${r.dateKey}T00:00:00Z`)}</Badge>
                      </div>
                    </>
                  );
                  return r.kind === 'task' ? (
                    <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                      {body}
                      <button
                        onClick={() => markDone(r.reminder)}
                        disabled={completeReminder.isPending}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-navy-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    <Link key={r.id} to={r.href} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                      {body}
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {addReminderOpen && <AddReminderModal onClose={() => setAddReminderOpen(false)} />}

      {viewing && (
        <Modal title="Reminder" onClose={() => setViewing(null)}>
          <div className="flex flex-col gap-3 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">What</p>
              <p className="text-navy-950">{viewing.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-slate-500">Customer</p>
                <p className="text-navy-950">{viewing.client?.name ?? 'Unknown'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Pet</p>
                <p className="text-navy-950">{viewing.pet?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Due</p>
                <p className="text-navy-950">{formatDate(viewing.dueAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Added by</p>
                <p className="text-navy-950">{viewing.createdByEmployee?.name ?? 'Unknown'}</p>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setViewing(null)}>
                Close
              </Button>
              <Button onClick={() => markDone(viewing)} disabled={completeReminder.isPending}>
                <Check size={14} /> Mark done
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
