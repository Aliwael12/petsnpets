import { useState } from 'react';
import toast from 'react-hot-toast';
import { useCreateReminder, useReminderPets } from '../api/reminders';
import { ApiError } from '../api/client';
import { todayKey } from '../lib/timezone';
import { ClientPicker } from './ClientPicker';
import { Button, Input, Modal, Select } from './ui';

export function AddReminderModal({ onClose, initialDate }: { onClose: () => void; initialDate?: string }) {
  const createReminder = useCreateReminder();

  const [clientId, setClientId] = useState('');
  const [petId, setPetId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate ?? todayKey());

  const { data: pets = [], isLoading: petsLoading } = useReminderPets(clientId);

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
