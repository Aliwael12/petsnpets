import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { usePet, usePets, useCreatePet } from '../api/pets';
import { useClients } from '../api/clients';
import { useCreatePetLog, usePetLogs } from '../api/petLogs';
import { ApiError } from '../api/client';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  Modal,
  PhoneListInput,
  Select,
  formatDate,
  formatDateTime,
} from '../components/ui';
import type { LogType, Species } from '../types';
import { PawPrint, Plus, Search, UserCircle2 } from 'lucide-react';

const speciesOptions: Species[] = ['dog', 'cat', 'bird', 'rabbit', 'other'];
const logTypeOptions: LogType[] = ['vaccination', 'shower', 'other'];

const emptyPetForm = { name: '', species: 'dog' as Species, breed: '', clientId: '', phones: [] as string[] };
const emptyNewClientForm = { name: '', phones: [''] as string[] };

export function PetLogs() {
  const [search, setSearch] = useState('');
  const { data: pets = [] } = usePets(search);
  const { data: clients = [] } = useClients();
  const createPet = useCreatePet();

  const [searchParams] = useSearchParams();
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [petModalOpen, setPetModalOpen] = useState(false);
  const [newClientMode, setNewClientMode] = useState(false);

  const [logForm, setLogForm] = useState({ logType: 'vaccination' as LogType, description: '', nextDueDate: '' });
  const [petForm, setPetForm] = useState(emptyPetForm);
  const [newClientForm, setNewClientForm] = useState(emptyNewClientForm);

  useEffect(() => {
    const petParam = searchParams.get('pet');
    if (petParam) {
      setSelectedPetId(petParam);
    } else if (!selectedPetId && pets.length > 0) {
      setSelectedPetId(pets[0].id);
    }
  }, [searchParams, pets, selectedPetId]);

  const { data: selectedPet } = usePet(selectedPetId);
  const { data: selectedLogsRaw = [] } = usePetLogs(selectedPetId);
  const addPetLog = useCreatePetLog(selectedPetId ?? '');

  const selectedLogs = [...selectedLogsRaw].sort((a, b) => +new Date(b.performedAt) - +new Date(a.performedAt));

  const submitLog = () => {
    if (!selectedPet) return;
    if (!logForm.description.trim()) {
      toast.error('Description is required');
      return;
    }
    addPetLog.mutate(
      {
        logType: logForm.logType,
        description: logForm.description.trim(),
        nextDueDate: logForm.nextDueDate ? new Date(logForm.nextDueDate).toISOString() : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Log entry added');
          setLogForm({ logType: 'vaccination', description: '', nextDueDate: '' });
          setLogModalOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add log'),
      },
    );
  };

  const resetPetModal = () => {
    setPetForm(emptyPetForm);
    setNewClientForm(emptyNewClientForm);
    setNewClientMode(false);
    setPetModalOpen(false);
  };

  const submitPet = () => {
    if (!petForm.name.trim()) {
      toast.error('Pet name is required');
      return;
    }
    const phones = petForm.phones.map((p) => p.trim()).filter(Boolean);

    if (newClientMode) {
      const name = newClientForm.name.trim();
      const clientPhones = newClientForm.phones.map((p) => p.trim()).filter(Boolean);
      if (!name) {
        toast.error('Client name is required');
        return;
      }
      if (clientPhones.length === 0) {
        toast.error('At least one phone number is required');
        return;
      }
      createPet.mutate(
        { name: petForm.name.trim(), species: petForm.species, breed: petForm.breed.trim(), newClient: { name, phones: clientPhones }, phones },
        {
          onSuccess: (newPet) => {
            toast.success('Pet added');
            setSelectedPetId(newPet.id);
            resetPetModal();
          },
          onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add pet'),
        },
      );
      return;
    }

    if (!petForm.clientId) {
      toast.error('Select or add a client');
      return;
    }
    createPet.mutate(
      { name: petForm.name.trim(), species: petForm.species, breed: petForm.breed.trim(), clientId: petForm.clientId, phones },
      {
        onSuccess: (newPet) => {
          toast.success('Pet added');
          setSelectedPetId(newPet.id);
          resetPetModal();
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add pet'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Pet logs</h1>
          <p className="text-sm text-slate-500">Directory and service history — see the Calendar tab for upcoming due dates</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
          <Card className="flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="relative flex-1">
                <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Search pets or owners" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-sm" />
              </div>
              <button onClick={() => setPetModalOpen(true)} className="rounded-lg bg-navy-800 p-2 text-white hover:bg-navy-900">
                <Plus size={15} />
              </button>
            </div>
            <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {pets.length === 0 ? (
                <EmptyState title="No pets found" />
              ) : (
                pets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPetId(p.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                      p.id === selectedPetId ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-100 text-navy-800">
                      <PawPrint size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-950">{p.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {p.breed} · {p.client?.name ?? 'Unknown owner'}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card>
            {!selectedPet ? (
              <EmptyState title="Select a pet to view its history" />
            ) : (
              <>
                <CardHeader
                  title={selectedPet.name}
                  subtitle={`${selectedPet.breed} · Owner: ${selectedPet.client?.name ?? 'Unknown'} · ${selectedPet.client?.phones[0]?.phone ?? ''}`}
                  action={
                    <div className="flex gap-2">
                      {selectedPet.client && (
                        <Link
                          to={`/clients?client=${selectedPet.client.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-navy-800 hover:bg-slate-100"
                        >
                          <UserCircle2 size={15} /> View client
                        </Link>
                      )}
                      <Button onClick={() => setLogModalOpen(true)}>
                        <Plus size={15} /> Add log
                      </Button>
                    </div>
                  }
                />
                {selectedPet.phones && selectedPet.phones.length > 0 && (
                  <p className="border-b border-slate-100 px-5 py-2 text-xs text-slate-400">
                    Additional contact: {selectedPet.phones.map((p) => p.phone).join(' · ')}
                  </p>
                )}
                {selectedLogs.length === 0 ? (
                  <EmptyState title="No log entries yet" subtitle="Add a vaccination, shower or other service entry" />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {selectedLogs.map((log) => (
                      <div key={log.id} className="flex items-start justify-between gap-3 px-5 py-3">
                        <div>
                          <div className="mb-1 flex items-center gap-2">
                            <Badge tone={log.logType}>{log.logType}</Badge>
                            {log.nextDueDate && (
                              <span className="text-xs text-slate-400">Next due {formatDate(log.nextDueDate)}</span>
                            )}
                          </div>
                          <p className="text-sm text-navy-950">{log.description}</p>
                          <p className="text-xs text-slate-400">
                            {log.performedByEmployee?.name ?? 'Unknown'} · {formatDateTime(log.performedAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

      {logModalOpen && selectedPet && (
        <Modal title={`Add log for ${selectedPet.name}`} onClose={() => setLogModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
              <Select value={logForm.logType} onChange={(e) => setLogForm({ ...logForm, logType: e.target.value as LogType })}>
                {logTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Description</label>
              <Input value={logForm.description} onChange={(e) => setLogForm({ ...logForm, description: e.target.value })} placeholder="e.g. Rabies vaccine, annual booster" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Next due date (optional)</label>
              <Input type="date" value={logForm.nextDueDate} onChange={(e) => setLogForm({ ...logForm, nextDueDate: e.target.value })} />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setLogModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitLog} disabled={addPetLog.isPending}>
                {addPetLog.isPending ? 'Saving…' : 'Add log'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {petModalOpen && (
        <Modal title="Add pet" onClose={resetPetModal}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Pet name</label>
              <Input value={petForm.name} onChange={(e) => setPetForm({ ...petForm, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Species</label>
                <Select value={petForm.species} onChange={(e) => setPetForm({ ...petForm, species: e.target.value as Species })}>
                  {speciesOptions.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Breed</label>
                <Input value={petForm.breed} onChange={(e) => setPetForm({ ...petForm, breed: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-500">Owner / client</label>
                <button type="button" className="text-xs font-medium text-navy-700 hover:underline" onClick={() => setNewClientMode((v) => !v)}>
                  {newClientMode ? 'Choose existing' : '+ New client'}
                </button>
              </div>
              {newClientMode ? (
                <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
                  <Input
                    placeholder="Client name"
                    value={newClientForm.name}
                    onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })}
                  />
                  <PhoneListInput value={newClientForm.phones} onChange={(phones) => setNewClientForm({ ...newClientForm, phones })} />
                </div>
              ) : (
                <Select value={petForm.clientId} onChange={(e) => setPetForm({ ...petForm, clientId: e.target.value })}>
                  <option value="">Select client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Additional contact numbers (optional)</label>
              <PhoneListInput value={petForm.phones} onChange={(phones) => setPetForm({ ...petForm, phones })} />
            </div>

            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={resetPetModal}>
                Cancel
              </Button>
              <Button onClick={submitPet} disabled={createPet.isPending}>
                {createPet.isPending ? 'Saving…' : 'Add pet'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
