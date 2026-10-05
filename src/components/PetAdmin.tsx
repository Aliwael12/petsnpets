import { useState } from 'react';
import toast from 'react-hot-toast';
import { PawPrint, Search } from 'lucide-react';
import { useDeletePet, usePets, useUpdatePet } from '../api/pets';
import { ApiError } from '../api/client';
import { ClientPicker } from './ClientPicker';
import { Button, Input, Modal, Select } from './ui';
import type { Pet, PetSex, Species } from '../types';

const SPECIES: Species[] = ['dog', 'cat', 'bird', 'rabbit', 'other'];

type EditablePet = Pick<Pet, 'id' | 'name' | 'species' | 'breed' | 'sex' | 'birthDate' | 'clientId'>;

/**
 * Admin only: edit a pet's details, move it to another client (Owner), or delete it. A pet
 * with logs or boarding stays can't be deleted — the server says so, and moving it is the way
 * to take it off a client.
 */
export function EditPetModal({ pet, onClose, onDeleted }: { pet: EditablePet; onClose: () => void; onDeleted?: () => void }) {
  const updatePet = useUpdatePet();
  const deletePet = useDeletePet();
  const [form, setForm] = useState({
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? '',
    sex: (pet.sex ?? '') as PetSex | '',
    birthDate: pet.birthDate ?? '',
    clientId: pet.clientId,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fail = (fallback: string) => (err: unknown) => toast.error(err instanceof ApiError ? err.message : fallback);

  const save = () => {
    if (!form.name.trim()) return toast.error('The pet needs a name');
    if (!form.clientId) return toast.error('Pick the owner');
    updatePet.mutate(
      {
        id: pet.id,
        patch: {
          name: form.name.trim(),
          species: form.species,
          breed: form.breed.trim(),
          sex: form.sex || null,
          birthDate: form.birthDate || null,
          clientId: form.clientId,
        },
      },
      {
        onSuccess: () => {
          toast.success(form.clientId !== pet.clientId ? `${form.name.trim()} moved to the new owner` : 'Pet updated');
          onClose();
        },
        onError: fail('Could not update the pet'),
      },
    );
  };

  const remove = () =>
    deletePet.mutate(pet.id, {
      onSuccess: () => {
        toast.success(`${pet.name} deleted`);
        onDeleted?.();
        onClose();
      },
      onError: (err) => {
        setConfirmDelete(false);
        fail('Could not delete the pet')(err);
      },
    });

  return (
    <Modal title={`Edit ${pet.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Species</label>
            <Select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value as Species })}>
              {SPECIES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Breed</label>
            <Input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Sex</label>
            <Select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value as PetSex | '' })}>
              <option value="">Not set</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Birth date</label>
            <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Owner</label>
          <ClientPicker value={form.clientId} onChange={(clientId) => setForm({ ...form, clientId })} autoFocus={false} />
          <p className="mt-1 text-xs text-slate-400">
            {form.clientId !== pet.clientId
              ? 'The pet and its open reminders move to this client. Past logs, stays and sales stay as they were.'
              : 'To take this pet off the client, pick its right owner here.'}
          </p>
        </div>

        {confirmDelete ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
            Delete {pet.name} for good? This can&rsquo;t be undone.
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep
              </Button>
              <Button variant="danger" disabled={deletePet.isPending} onClick={remove}>
                {deletePet.isPending ? 'Deleting…' : 'Delete pet'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-2">
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              Delete pet
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} disabled={updatePet.isPending}>
                {updatePet.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Admin only: find any existing pet and move it to this client. */
export function AssignPetModal({ clientId, clientName, onClose }: { clientId: string; clientName: string; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const { data: pets = [] } = usePets(search.trim() || undefined);
  const updatePet = useUpdatePet();
  const matches = search.trim() ? pets.filter((p) => p.clientId !== clientId).slice(0, 8) : [];

  const assign = (pet: Pet) =>
    updatePet.mutate(
      { id: pet.id, patch: { clientId } },
      {
        onSuccess: () => {
          toast.success(`${pet.name} is now ${clientName}'s`);
          onClose();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not move the pet'),
      },
    );

  return (
    <Modal title={`Assign a pet to ${clientName}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-500">Search a pet by its name or its current owner&rsquo;s name, then pick it to move it to {clientName}.</p>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input autoFocus placeholder="Search pets" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        {search.trim() && (
          <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-400">No matching pet</p>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={updatePet.isPending}
                  onClick={() => assign(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  <PawPrint size={14} className="shrink-0 text-navy-500" />
                  <span className="font-medium text-navy-950">{p.name}</span>
                  <span className="text-xs capitalize text-slate-400">{p.species}</span>
                  <span className="ml-auto truncate text-xs text-slate-400">now {p.client?.name ?? 'unknown'}</span>
                </button>
              ))
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
