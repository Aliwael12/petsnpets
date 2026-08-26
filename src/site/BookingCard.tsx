import { useEffect, useMemo, useState } from 'react';
import { useAvailability, useBookAppointment, useBookableServices } from '../api/appointments';
import { ApiError } from '../api/client';
import { dayKeyParts, formatDayKey, formatSlotTime, nextBusinessDays } from '../lib/timezone';
import type { Species } from '../types';
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Loader2, PhoneCall } from 'lucide-react';

const SPECIES: { value: Species; label: string }[] = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'rabbit', label: 'Rabbit' },
  { value: 'other', label: 'Other' },
];

function money(piastres: number): string {
  return `EGP ${(piastres / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

type Step = 'when' | 'who' | 'done';

export function BookingCard() {
  const { data: services = [] } = useBookableServices();
  const book = useBookAppointment();

  const days = useMemo(() => nextBusinessDays(14), []);
  const [step, setStep] = useState<Step>('when');
  const [serviceId, setServiceId] = useState('');
  const [dayKey, setDayKey] = useState(days[0]);
  const [slot, setSlot] = useState<string | null>(null);
  const [form, setForm] = useState({ petName: '', species: 'dog' as Species, ownerName: '', phone: '', email: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ petName: string; serviceName: string; requestedAt: string } | null>(null);

  const { data: availability, isFetching } = useAvailability(dayKey);
  const slots = availability?.slots ?? [];
  const openSlots = slots.filter((s) => s.available);

  // A slot chosen on one day must not survive a switch to another day — that would
  // submit a time the visitor can no longer see selected.
  useEffect(() => {
    setSlot(null);
  }, [dayKey]);

  const selectedService = services.find((s) => s.id === serviceId);

  const submit = () => {
    setError(null);
    if (!form.petName.trim()) return setError('Please tell us your pet’s name.');
    if (form.ownerName.trim().length < 2) return setError('Please enter your full name.');
    if (form.phone.trim().length < 6) return setError('Please enter a phone number we can reach you on.');
    if (!slot) return setError('Please pick a time.');

    book.mutate(
      {
        ownerName: form.ownerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        petName: form.petName.trim(),
        species: form.species,
        serviceId: serviceId || undefined,
        requestedAt: slot,
        notes: form.notes.trim() || undefined,
      },
      {
        onSuccess: (res) => {
          setConfirmed({ petName: res.petName, serviceName: res.serviceName, requestedAt: res.requestedAt });
          setStep('done');
        },
        onError: (err) => {
          const message = err instanceof ApiError ? err.message : 'Something went wrong. Please call us instead.';
          setError(message);
          // The slot went while they were filling in details — send them back to pick
          // another rather than leaving them staring at a dead Confirm button.
          if (err instanceof ApiError && (err.code === 'SLOT_UNAVAILABLE' || err.code === 'VALIDATION_ERROR')) {
            setSlot(null);
            setStep('when');
          }
        },
      },
    );
  };

  const reset = () => {
    setStep('when');
    setSlot(null);
    setConfirmed(null);
    setError(null);
    setForm({ petName: '', species: 'dog', ownerName: '', phone: '', email: '', notes: '' });
  };

  return (
    <div
      id="book"
      className="w-full overflow-hidden rounded-3xl border border-line bg-white shadow-[0_30px_70px_-40px_rgb(10_47_94/0.55)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line bg-brand-50/70 px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white">
            <CalendarCheck size={16} />
          </span>
          <div>
            <p className="font-display text-[15px] font-bold text-brand-800">Book an appointment</p>
            <p className="text-xs text-mute">Takes under a minute · no account needed</p>
          </div>
        </div>
        {step !== 'done' && (
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className={`h-1.5 rounded-full transition-all duration-300 ${step === 'when' ? 'w-6 bg-brand-600' : 'w-1.5 bg-brand-200'}`} />
            <span className={`h-1.5 rounded-full transition-all duration-300 ${step === 'who' ? 'w-6 bg-brand-600' : 'w-1.5 bg-brand-200'}`} />
          </div>
        )}
      </div>

      {/* key on step so each panel mounts fresh and plays its own entrance */}
      <div key={step} className="animate-[bookingIn_260ms_cubic-bezier(0.23,1,0.32,1)_both] px-6 py-5">
        {step === 'when' && (
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="svc" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                What do you need?
              </label>
              <select
                id="svc"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              >
                <option value="">General consultation</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {money(s.unitPrice)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">Pick a day</span>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1.5">
                {days.map((key, i) => {
                  const { weekday, day, month } = dayKeyParts(key);
                  const active = key === dayKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDayKey(key)}
                      aria-pressed={active}
                      className={`pressable flex min-w-[62px] shrink-0 flex-col items-center rounded-xl border px-2.5 py-2 ${
                        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white text-ink hover:border-brand-300'
                      }`}
                    >
                      <span className={`text-[10px] font-semibold uppercase ${active ? 'text-brand-100' : 'text-mute'}`}>
                        {i === 0 ? 'Today' : weekday}
                      </span>
                      <span className="tnum text-lg font-bold leading-tight">{day}</span>
                      <span className={`text-[10px] ${active ? 'text-brand-100' : 'text-mute'}`}>{month}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                Available times <span className="normal-case tracking-normal text-mute/70">· Cairo time</span>
              </span>
              {isFetching && slots.length === 0 ? (
                <div className="flex items-center gap-2 py-6 text-sm text-mute">
                  <Loader2 size={15} className="animate-spin" /> Checking availability…
                </div>
              ) : openSlots.length === 0 ? (
                <p className="rounded-xl bg-ground px-3.5 py-4 text-sm text-mute">
                  Nothing free on {formatDayKey(dayKey)}. Try another day, or call us and we’ll fit you in.
                </p>
              ) : (
                <div className="grid max-h-44 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
                  {slots.map((s) => (
                    <button
                      key={s.at}
                      type="button"
                      disabled={!s.available}
                      onClick={() => setSlot(s.at)}
                      aria-pressed={slot === s.at}
                      className={`pressable tnum rounded-lg border px-1 py-2 text-[13px] font-medium ${
                        slot === s.at
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : s.available
                            ? 'border-line bg-white text-ink hover:border-brand-400 hover:text-brand-700'
                            : 'cursor-not-allowed border-transparent bg-ground text-mute/40 line-through'
                      }`}
                    >
                      {formatSlotTime(s.at)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              disabled={!slot}
              onClick={() => {
                setError(null);
                setStep('who');
              }}
              className="pressable mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-mute"
            >
              {slot ? `Continue · ${formatSlotTime(slot)}` : 'Pick a time to continue'}
              {slot && <ArrowRight size={16} />}
            </button>
          </div>
        )}

        {step === 'who' && (
          <div className="flex flex-col gap-3.5">
            <div className="rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800">
              <span className="font-semibold">{selectedService?.name ?? 'General consultation'}</span>
              <span className="text-brand-700/80">
                {' '}
                · {formatDayKey(dayKey)} at {slot ? formatSlotTime(slot) : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pet" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                  Pet’s name
                </label>
                <input
                  id="pet"
                  value={form.petName}
                  onChange={(e) => setForm({ ...form, petName: e.target.value })}
                  placeholder="Simba"
                  className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
              </div>
              <div>
                <label htmlFor="species" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                  Species
                </label>
                <select
                  id="species"
                  value={form.species}
                  onChange={(e) => setForm({ ...form, species: e.target.value as Species })}
                  className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                >
                  {SPECIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="owner" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                Your name
              </label>
              <input
                id="owner"
                value={form.ownerName}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                placeholder="Full name"
                className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="phone" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                  Phone
                </label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+20 1xx xxx xxxx"
                  className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                  Email <span className="normal-case text-mute/60">(optional)</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute">
                Anything we should know? <span className="normal-case text-mute/60">(optional)</span>
              </label>
              <textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Symptoms, past treatments, nervous around other animals…"
                className="w-full resize-none rounded-xl border border-line px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep('when');
                }}
                className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-line px-4 py-3 text-sm font-semibold text-ink hover:border-brand-300"
              >
                <ArrowLeft size={15} /> Back
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={book.isPending}
                className="pressable inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:bg-line disabled:text-mute"
              >
                {book.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> Requesting…
                  </>
                ) : (
                  'Request appointment'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && confirmed && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Check size={26} strokeWidth={2.5} />
            </span>
            <div>
              <h3 className="font-display text-xl font-bold text-brand-800">Request received</h3>
              <p className="mt-1 text-sm text-mute">
                We&apos;ve got <span className="font-semibold text-ink">{confirmed.petName}</span> down for{' '}
                <span className="font-semibold text-ink">{confirmed.serviceName}</span> on{' '}
                <span className="font-semibold text-ink">
                  {formatDayKey(confirmed.requestedAt.slice(0, 10))} at {formatSlotTime(confirmed.requestedAt)}
                </span>
                .
              </p>
            </div>
            <p className="rounded-xl bg-ground px-4 py-3 text-sm text-mute">
              Our team will call you shortly to confirm. Need it sooner? Ring us on{' '}
              <a href="tel:+201094118811" className="font-semibold text-brand-700 hover:underline">
                +20 109 411 8811
              </a>
              .
            </p>
            <button
              type="button"
              onClick={reset}
              className="pressable mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand-300"
            >
              Book another appointment
            </button>
          </div>
        )}
      </div>

      {step !== 'done' && (
        <p className="flex items-center justify-center gap-1.5 border-t border-line bg-ground px-6 py-3 text-xs text-mute">
          <PhoneCall size={12} /> Emergency? Call{' '}
          <a href="tel:+201094118811" className="font-semibold text-brand-700 hover:underline">
            +20 109 411 8811
          </a>{' '}
          — we answer 24/7.
        </p>
      )}
    </div>
  );
}
