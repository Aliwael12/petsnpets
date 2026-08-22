import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Select, formatDate, formatDateTime } from '../components/ui';
import type { LogType, Species } from '../types';
import { CalendarClock, PawPrint, Plus, Search } from 'lucide-react';

const speciesOptions: Species[] = ['dog', 'cat', 'bird', 'rabbit', 'other'];
const logTypeOptions: LogType[] = ['vaccination', 'shower', 'other'];

export function PetLogs() {
  const pets = useStore((s) => s.pets);
  const petLogs = useStore((s) => s.petLogs);
  const employees = useStore((s) => s.employees);
  const currentUser = useStore((s) => s.currentUser());
  const addPet = useStore((s) => s.addPet);
  const addPetLog = useStore((s) => s.addPetLog);

  const [tab, setTab] = useState<'directory' | 'due'>('directory');
  const [search, setSearch] = useState('');
  const [selectedPetId, setSelectedPetId] = useState<string | null>(pets[0]?.id ?? null);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [petModalOpen, setPetModalOpen] = useState(false);

  const [logForm, setLogForm] = useState({ logType: 'vaccination' as LogType, description: '', nextDueDate: '' });
  const [petForm, setPetForm] = useState({ name: '', species: 'dog' as Species, breed: '', ownerName: '', ownerContact: '' });

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? 'Unknown';

  const filteredPets = useMemo(
    () =>
      pets.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) || p.ownerName.toLowerCase().includes(search.toLowerCase()),
      ),
    [pets, search],
  );

  const selectedPet = pets.find((p) => p.id === selectedPetId) ?? null;
  const selectedLogs = petLogs
    .filter((l) => l.petId === selectedPetId)
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());

  const upcoming = useMemo(() => {
    const now = Date.now();
    return petLogs
      .filter((l) => l.nextDueDate)
      .map((l) => ({ log: l, pet: pets.find((p) => p.id === l.petId)! }))
      .filter((entry) => entry.pet)
      .sort((a, b) => new Date(a.log.nextDueDate!).getTime() - new Date(b.log.nextDueDate!).getTime())
      .map((entry) => ({ ...entry, overdue: new Date(entry.log.nextDueDate!).getTime() < now }));
  }, [petLogs, pets]);

  const submitLog = () => {
    if (!selectedPet || !currentUser) return;
    if (!logForm.description.trim()) {
      toast.error('Description is required');
      return;
    }
    addPetLog({
      petId: selectedPet.id,
      logType: logForm.logType,
      description: logForm.description.trim(),
      performedBy: currentUser.id,
      performedAt: new Date().toISOString(),
      nextDueDate: logForm.nextDueDate ? new Date(logForm.nextDueDate).toISOString() : undefined,
    });
    toast.success('Log entry added');
    setLogForm({ logType: 'vaccination', description: '', nextDueDate: '' });
    setLogModalOpen(false);
  };

  const submitPet = () => {
    if (!petForm.name.trim() || !petForm.ownerName.trim()) {
      toast.error('Pet name and owner name are required');
      return;
    }
    const newPet = addPet({ ...petForm, name: petForm.name.trim(), ownerName: petForm.ownerName.trim() });
    toast.success('Pet added');
    setSelectedPetId(newPet.id);
    setPetForm({ name: '', species: 'dog', breed: '', ownerName: '', ownerContact: '' });
    setPetModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Pet logs</h1>
          <p className="text-sm text-slate-500">Directory, service history and upcoming vaccinations</p>
        </div>
        <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setTab('directory')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'directory' ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'}`}
          >
            Directory
          </button>
          <button
            onClick={() => setTab('due')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === 'due' ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'}`}
          >
            Upcoming due dates
          </button>
        </div>
      </div>

      {tab === 'directory' ? (
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
              {filteredPets.length === 0 ? (
                <EmptyState title="No pets found" />
              ) : (
                filteredPets.map((p) => (
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
                        {p.breed} · {p.ownerName}
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
                  subtitle={`${selectedPet.breed} · Owner: ${selectedPet.ownerName} · ${selectedPet.ownerContact}`}
                  action={
                    <Button onClick={() => setLogModalOpen(true)}>
                      <Plus size={15} /> Add log
                    </Button>
                  }
                />
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
                            {employeeName(log.performedBy)} · {formatDateTime(log.performedAt)}
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
      ) : (
        <Card>
          <CardHeader title="Upcoming vaccinations & follow-ups" subtitle="Sorted by soonest due date" />
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing due" />
          ) : (
            <div className="divide-y divide-slate-100">
              {upcoming.map(({ log, pet, overdue }) => (
                <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full ${overdue ? 'bg-red-100 text-red-600' : 'bg-navy-100 text-navy-800'}`}>
                      <CalendarClock size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-navy-950">
                        {pet.name} <span className="text-slate-400">· {pet.ownerName}</span>
                      </p>
                      <p className="text-xs text-slate-400">{log.description}</p>
                    </div>
                  </div>
                  <Badge tone={overdue ? 'low' : 'vaccination'}>{overdue ? 'Overdue' : formatDate(log.nextDueDate!)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

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
              <Button onClick={submitLog}>Add log</Button>
            </div>
          </div>
        </Modal>
      )}

      {petModalOpen && (
        <Modal title="Add pet" onClose={() => setPetModalOpen(false)}>
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
              <label className="mb-1 block text-xs font-medium text-slate-500">Owner name</label>
              <Input value={petForm.ownerName} onChange={(e) => setPetForm({ ...petForm, ownerName: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Owner contact</label>
              <Input value={petForm.ownerContact} onChange={(e) => setPetForm({ ...petForm, ownerContact: e.target.value })} />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPetModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitPet}>Add pet</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
