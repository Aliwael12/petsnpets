import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Plus } from 'lucide-react';
import { useBoardings, useCreateBoarding, useUpdateBoarding } from '../api/boardings';
import { useReminderPets } from '../api/reminders';
import { ApiError } from '../api/client';
import { todayKey } from '../lib/timezone';
import { ClientPicker } from '../components/ClientPicker';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, StatTile, TabSwitch, Textarea, formatCurrency, formatDate } from '../components/ui';
import type { Boarding as BoardingStay } from '../types';

type Status = 'staying' | 'upcoming' | 'done';
type Filter = Status | 'all';

function statusOf(stay: BoardingStay, today: string): Status {
  if (stay.startDate > today) return 'upcoming';
  if (stay.endDate < today) return 'done';
  return 'staying';
}

const STATUS_BADGE: Record<Status, { tone: string; label: string }> = {
  staying: { tone: 'active', label: 'Staying' },
  upcoming: { tone: 'vaccination', label: 'Upcoming' },
  done: { tone: 'inactive', label: 'Checked out' },
};

function nights(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000);
}

/** Date keys are plain calendar days; noon UTC keeps formatDate on the same day in Cairo. */
const showDay = (key: string) => formatDate(`${key}T12:00:00Z`);

export function Boarding() {
  const { data: stays = [], isLoading } = useBoardings();
  const [filter, setFilter] = useState<Filter>('staying');
  const [modal, setModal] = useState<{ editing: BoardingStay | null } | null>(null);

  const today = todayKey();
  const filtered = useMemo(
    () => (filter === 'all' ? stays : stays.filter((s) => statusOf(s, today) === filter)),
    [stays, filter, today],
  );

  const stayingNow = stays.filter((s) => statusOf(s, today) === 'staying');
  const checkingOutToday = stayingNow.filter((s) => s.endDate === today).length;
  const owed = stays.reduce((sum, s) => sum + Math.max(0, s.totalAmount - s.paidAmount), 0);
  const withBalance = stays.filter((s) => s.totalAmount > s.paidAmount).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Boarding</h1>
          <p className="text-sm text-slate-500">Pets staying at the clinic, and what each stay still owes</p>
        </div>
        <Button onClick={() => setModal({ editing: null })}>
          <Plus size={16} /> Add stay
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Staying now"
          value={String(stayingNow.length)}
          hint={checkingOutToday > 0 ? `${checkingOutToday} checking out today` : undefined}
          tone="gold"
        />
        <StatTile
          label="Still owed"
          value={formatCurrency(owed)}
          hint={withBalance > 0 ? `Across ${withBalance} stay${withBalance === 1 ? '' : 's'}` : 'Every stay is paid up'}
          tone={owed > 0 ? 'expense' : 'income'}
        />
        <StatTile label="Upcoming" value={String(stays.filter((s) => statusOf(s, today) === 'upcoming').length)} hint="Booked, not checked in yet" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-950">Stays</h2>
          <TabSwitch
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'staying', label: 'Staying' },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'done', label: 'Checked out' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        {isLoading ? (
          <EmptyState title="Loading…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={filter === 'staying' ? 'No pets staying right now' : 'No stays here'}
            subtitle="Log a stay with Add stay"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Pet</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Stay</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Paid</th>
                  <th className="px-5 py-3 text-right font-medium">Left</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((s) => {
                  const status = STATUS_BADGE[statusOf(s, today)];
                  const left = s.totalAmount - s.paidAmount;
                  const n = nights(s.startDate, s.endDate);
                  return (
                    <tr key={s.id}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-navy-950">{s.pet?.name ?? 'Unknown'}</p>
                        {s.note && <p className="whitespace-pre-line text-xs text-slate-400">{s.note}</p>}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{s.client?.name ?? 'Unknown'}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                        {showDay(s.startDate)} → {showDay(s.endDate)}
                        <span className="block text-xs text-slate-400">
                          {n === 0 ? 'Same day' : `${n} night${n === 1 ? '' : 's'}`}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-navy-950">{formatCurrency(s.totalAmount)}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-emerald-700">{formatCurrency(s.paidAmount)}</td>
                      <td
                        className={`whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums ${
                          left > 0 ? 'text-red-600' : 'text-slate-400'
                        }`}
                      >
                        {left > 0 ? formatCurrency(left) : 'Paid'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setModal({ editing: s })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-800"
                          title="Edit stay or record a payment"
                        >
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modal && <StayModal editing={modal.editing} onClose={() => setModal(null)} />}
    </div>
  );
}

/** EGP typed by a human → piastres, the unit every money field in the API uses. */
const toPiastres = (egp: string) => Math.round((Number(egp) || 0) * 100);

function StayModal({ editing, onClose }: { editing: BoardingStay | null; onClose: () => void }) {
  const createStay = useCreateBoarding();
  const updateStay = useUpdateBoarding();

  const [clientId, setClientId] = useState(editing?.clientId ?? '');
  const [petId, setPetId] = useState(editing?.petId ?? '');
  const [total, setTotal] = useState(editing ? String(editing.totalAmount / 100) : '');
  const [paid, setPaid] = useState(editing ? String(editing.paidAmount / 100) : '');
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayKey());
  const [endDate, setEndDate] = useState(editing?.endDate ?? '');
  const [note, setNote] = useState(editing?.note ?? '');

  const { data: pets = [], isLoading: petsLoading } = useReminderPets(editing ? '' : clientId);

  const totalAmount = toPiastres(total);
  const paidAmount = toPiastres(paid);
  const left = totalAmount - paidAmount;

  const submit = () => {
    if (!editing && !clientId) return toast.error('Pick the customer');
    if (!editing && !petId) return toast.error('Pick the pet that is staying');
    if (!total || totalAmount < 0) return toast.error('Enter the total for the stay');
    if (paidAmount < 0) return toast.error('Paid can’t be negative');
    if (!startDate || !endDate) return toast.error('Pick the start and end dates');
    if (endDate < startDate) return toast.error('The stay has to end on or after the day it starts');

    const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Could not save the stay');
    if (editing) {
      updateStay.mutate(
        { id: editing.id, patch: { totalAmount, paidAmount, startDate, endDate, note: note.trim() } },
        {
          onSuccess: () => {
            toast.success('Stay updated');
            onClose();
          },
          onError,
        },
      );
    } else {
      createStay.mutate(
        { clientId, petId, totalAmount, paidAmount, startDate, endDate, note: note.trim() || undefined },
        {
          onSuccess: () => {
            toast.success('Stay logged');
            onClose();
          },
          onError,
        },
      );
    }
  };

  const saving = createStay.isPending || updateStay.isPending;

  return (
    <Modal title={editing ? `${editing.pet?.name ?? 'Stay'} · ${editing.client?.name ?? ''}` : 'Add stay'} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {!editing && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Customer</label>
              <ClientPicker
                value={clientId}
                onChange={(id) => {
                  setClientId(id);
                  setPetId('');
                }}
              />
            </div>
            {clientId && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Pet</label>
                <Select value={petId} onChange={(e) => setPetId(e.target.value)} disabled={petsLoading}>
                  <option value="">{pets.length === 0 && !petsLoading ? 'No pets on file for this client' : 'Select pet'}</option>
                  {pets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.species})
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Start date</label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">End date</label>
            <Input type="date" min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Total for the stay (EGP)</label>
            <Input type="number" min="0" value={total} onChange={(e) => setTotal(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Paid so far (EGP)</label>
            <Input type="number" min="0" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0" />
          </div>
        </div>
        {total && (
          <p className={`text-sm font-medium ${left > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {left > 0 ? `Left to pay: ${formatCurrency(left)}` : left < 0 ? `Overpaid by ${formatCurrency(-left)}` : 'Paid in full'}
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Comments (optional)</label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Feeds twice a day, on medication, bring back his blanket"
            maxLength={500}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Log stay'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
