import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link, useSearchParams } from 'react-router-dom';
import { useClient, useClients, useCreateClient, useDeleteClient, useUpdateClient } from '../api/clients';
import { useSales } from '../api/sales';
import { useRefunds } from '../api/refunds';
import { useDiscounts } from '../api/discounts';
import { usePetLogsForPets } from '../api/petLogs';
import { useEmployees } from '../api/employees';
import { buildActivity } from '../lib/activity';
import { ActivityFeed } from '../components/ActivityFeed';
import { Button, Card, CardHeader, EmptyState, Input, Modal, PhoneListInput } from '../components/ui';
import type { Client } from '../types';
import { PawPrint, Pencil, Phone, Plus, Search, Trash2, Users } from 'lucide-react';

const emptyForm = { name: '', phones: [''] as string[] };

export function Clients() {
  const [search, setSearch] = useState('');
  const { data: clients = [] } = useClients(search);
  const { data: employees = [] } = useEmployees();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const [searchParams] = useSearchParams();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  useEffect(() => {
    const clientParam = searchParams.get('client');
    if (clientParam) setSelectedClientId(clientParam);
    else if (!selectedClientId && clients.length > 0) setSelectedClientId(clients[0].id);
  }, [searchParams, clients, selectedClientId]);

  const { data: selectedClient } = useClient(selectedClientId);
  const linkedPets = selectedClient?.pets ?? [];

  const { data: sales = [] } = useSales({ clientId: selectedClientId ?? undefined });
  const { data: allRefunds = [] } = useRefunds();
  const { data: discounts = [] } = useDiscounts({ clientId: selectedClientId ?? undefined });
  const { logs: petLogs } = usePetLogsForPets(linkedPets);

  const clientActivity = useMemo(() => {
    if (!selectedClientId) return [];
    const refunds = allRefunds.filter((r) => r.transaction?.clientId === selectedClientId);
    return buildActivity({ sales, refunds, discounts, petLogs });
  }, [selectedClientId, sales, allRefunds, discounts, petLogs]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ name: c.name, phones: c.phones.length > 0 ? c.phones.map((p) => p.phone) : [''] });
    setModalOpen(true);
  };

  const submit = () => {
    const name = form.name.trim();
    const phones = form.phones.map((p) => p.trim()).filter(Boolean);
    if (!name) {
      toast.error('Client name is required');
      return;
    }
    if (phones.length === 0) {
      toast.error('At least one phone number is required');
      return;
    }
    if (editing) {
      updateClient.mutate(
        { id: editing.id, patch: { name, phones } },
        { onSuccess: () => toast.success('Client updated'), onError: () => toast.error('Could not update client') },
      );
      setModalOpen(false);
    } else {
      createClient.mutate(
        { name, phones },
        {
          onSuccess: (newClient) => {
            setSelectedClientId(newClient.id);
            toast.success('Client added');
          },
          onError: () => toast.error('Could not add client'),
        },
      );
      setModalOpen(false);
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteClient.mutate(deleteTarget.id, {
      onSuccess: (result) => {
        if (result.ok) {
          toast.success('Client removed');
          if (selectedClientId === deleteTarget.id) setSelectedClientId(null);
        } else {
          toast.error(result.reason);
        }
      },
    });
    setDeleteTarget(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Clients</h1>
          <p className="text-sm text-slate-500">Owner directory, linked pets and full history</p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Add client
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
        <Card className="flex flex-col">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 text-sm" />
            </div>
          </div>
          <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
            {clients.length === 0 ? (
              <EmptyState title="No clients found" />
            ) : (
              clients.map((c) => {
                const petCount = c.pets?.length ?? 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${
                      c.id === selectedClientId ? 'bg-slate-50' : ''
                    }`}
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-100 text-navy-800">
                      <Users size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-950">{c.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {c.phones[0]?.phone} {petCount > 0 && `· ${petCount} pet${petCount > 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            {!selectedClient ? (
              <EmptyState title="Select a client to view their profile" />
            ) : (
              <>
                <CardHeader
                  title={selectedClient.name}
                  subtitle={selectedClient.phones.map((p) => p.phone).join(' · ')}
                  action={
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={() => openEdit(selectedClient)}>
                        <Pencil size={14} /> Edit
                      </Button>
                      <Button variant="danger" onClick={() => setDeleteTarget(selectedClient)}>
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
                  }
                />
                <div className="px-5 py-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Linked pets ({linkedPets.length})
                  </p>
                  {linkedPets.length === 0 ? (
                    <p className="text-sm text-slate-400">No pets linked to this client yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {linkedPets.map((pet) => (
                        <Link
                          key={pet.id}
                          to={`/pet-logs?pet=${pet.id}`}
                          className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-navy-800 hover:border-navy-400 hover:bg-slate-50"
                        >
                          <PawPrint size={14} className="text-navy-500" />
                          {pet.name}
                          <span className="text-xs text-slate-400 capitalize">{pet.species}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
                    <Phone size={12} /> {selectedClient.phones.length} phone number{selectedClient.phones.length > 1 ? 's' : ''} on file
                  </div>
                </div>
              </>
            )}
          </Card>

          {selectedClient && (
            <Card>
              <CardHeader title="History" subtitle="Purchases, refunds, discounts and pet logs for this client" />
              <ActivityFeed entries={clientActivity} employees={employees} emptyTitle="No history yet" />
            </Card>
          )}
        </div>
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Edit client' : 'Add client'} onClose={() => setModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Phone numbers</label>
              <PhoneListInput value={form.phones} onChange={(phones) => setForm({ ...form, phones })} />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit}>{editing ? 'Save changes' : 'Add client'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete client" onClose={() => setDeleteTarget(null)}>
          <div className="text-sm text-slate-600">
            <p>
              Remove <span className="font-medium text-navy-950">{deleteTarget.name}</span>? This cannot be undone.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
