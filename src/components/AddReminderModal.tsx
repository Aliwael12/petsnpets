import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, UserRound } from 'lucide-react';
import { useClients } from '../api/clients';
import { useCreateReminder, useReminderPets } from '../api/reminders';
import { ApiError } from '../api/client';
import { todayKey } from '../lib/timezone';
import { Button, Input, Modal, Select } from './ui';

export function AddReminderModal({ onClose, initialDate }: { onClose: () => void; initialDate?: string }) {
  const { data: clients = [] } = useClients();
  const createReminder = useCreateReminder();

  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [petId, setPetId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate ?? todayKey());

  const { data: pets = [], isLoading: petsLoading } = useReminderPets(clientId);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const clientMatches = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || c.phones.some((p) => p.phone.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [clients, clientSearch]);

  const submit = () => {
    if (!clientId) {
      toast.error('Pick the customer this reminder is for');
      return;
    }
    if (!description.trim()) {
      toast.error('Say what needs to be done');
      return;
    }
    if (!date) {
      toast.error('Pick when it is due');
      return;
    }
    createReminder.mutate(
      {
        clientId,
        petId: petId || undefined,
        description: description.trim(),
        // Midday UTC lands on the same calendar day in Cairo, so the reminder shows on the
        // day that was picked regardless of the viewer's own timezone.
        dueAt: new Date(`${date}T12:00:00Z`).toISOString(),
      },
      {
        onSuccess: () => {
          toast.success('Reminder added');
          onClose();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add the reminder'),
      },
    );
  };

  return (
    <Modal title="Add reminder" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer</label>
          {selectedClient ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-navy-800">
                  <UserRound size={15} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-950">{selectedClient.name}</p>
                  <p className="truncate text-xs text-slate-400">{selectedClient.phones[0]?.phone}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setClientId('');
                  setPetId('');
                }}
                className="shrink-0 text-xs font-medium text-navy-700 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                autoFocus
                placeholder="Search customer by name or phone"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="pl-8"
              />
              {clientSearch.trim() && (
                <div className="absolute z-10 mt-1 max-h-48 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {clientMatches.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-slate-400">No matching customer</p>
                  ) : (
                    clientMatches.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setClientId(c.id);
                          setClientSearch('');
                          setPetId('');
                        }}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                      >
                        <span className="font-medium text-navy-950">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.phones[0]?.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {clientId && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Pet</label>
            <Select value={petId} onChange={(e) => setPetId(e.target.value)} disabled={petsLoading}>
              <option value="">{pets.length === 0 && !petsLoading ? 'No pets on file' : 'Not about a specific pet'}</option>
              {pets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.species})
                </option>
              ))}
            </Select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">What should be done</label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Rabies booster, call to check on stitches"
            maxLength={500}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">When</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createReminder.isPending}>
            {createReminder.isPending ? 'Saving…' : 'Add reminder'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
