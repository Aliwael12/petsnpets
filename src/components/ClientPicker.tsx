import { useMemo, useState } from 'react';
import { Search, UserRound } from 'lucide-react';
import { useClients } from '../api/clients';
import { Input } from './ui';

/** Search-and-pick a client by name or phone. Renders the chosen client as a card with a
 *  "Change" link once one is picked. */
export function ClientPicker({ value, onChange }: { value: string; onChange: (clientId: string) => void }) {
  const { data: clients = [] } = useClients();
  const [search, setSearch] = useState('');

  const selected = clients.find((c) => c.id === value) ?? null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || c.phones.some((p) => p.phone.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [clients, search]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-navy-800">
            <UserRound size={15} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-950">{selected.name}</p>
            <p className="truncate text-xs text-slate-400">{selected.phones[0]?.phone}</p>
          </div>
        </div>
        <button onClick={() => onChange('')} className="shrink-0 text-xs font-medium text-navy-700 hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input
        autoFocus
        placeholder="Search customer by name or phone"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="pl-8"
      />
      {search.trim() && (
        <div className="absolute z-10 mt-1 max-h-48 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">No matching customer</p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onChange(c.id);
                  setSearch('');
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
  );
}
