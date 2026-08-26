import { useState } from 'react';
import { usePriceCheck } from '../api/catalog';
import { Badge, Card, formatCurrency } from '../components/ui';
import type { Product } from '../types';
import { Search, Tag, X } from 'lucide-react';

export function PriceChecker() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Product | null>(null);

  const { data: suggestions = [] } = usePriceCheck(query);

  const showSuggestions = !selected && suggestions.length > 0;

  const reset = () => {
    setQuery('');
    setSelected(null);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-navy-950">Price checker</h1>
        <p className="text-sm text-slate-500">Type a product or service name to see its price</p>
      </div>

      <div className="relative w-full max-w-md">
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search product or service name"
          className="w-full rounded-2xl border border-slate-300 bg-white py-3.5 pl-12 pr-10 text-base text-navy-950 shadow-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-100"
        />
        {query && (
          <button onClick={reset} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={16} />
          </button>
        )}

        {showSuggestions && (
          <div className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {suggestions.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelected(p);
                  setQuery(p.name);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-navy-950">{p.name}</p>
                  <p className="text-xs capitalize text-slate-400">{p.category}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-navy-800">{formatCurrency(p.unitPrice)}</span>
              </button>
            ))}
          </div>
        )}

        {query && !selected && suggestions.length === 0 && (
          <div className="absolute z-10 mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-center text-sm text-slate-400 shadow-lg">
            No matching products or services
          </div>
        )}
      </div>

      {selected && (
        <Card className="w-full max-w-md">
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-100 text-navy-800">
              <Tag size={22} />
            </div>
            <Badge tone={selected.category === 'service' ? 'service' : 'other'}>{selected.category}</Badge>
            <h2 className="text-lg font-medium text-navy-950">{selected.name}</h2>
            <p className="text-5xl font-bold tracking-tight text-navy-950">{formatCurrency(selected.unitPrice)}</p>
            <p className="text-sm text-slate-400">
              {selected.category === 'service' ? 'Service — always available' : `${selected.stockQuantity} in stock`}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
