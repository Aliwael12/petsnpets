import { useMemo, useState } from 'react';
import { Package, Search } from 'lucide-react';
import { Input } from './ui';
import type { Product } from '../types';

const label = (p: Product) => (p.brand ? `${p.brand} · ${p.name}` : p.name);

/** Search-and-pick a product by name, brand or SKU from `products`. Shows the chosen one as a
 *  card with a "Change" link, like ClientPicker. */
export function ProductPicker({ products, value, onChange }: { products: Product[]; value: string; onChange: (productId: string) => void }) {
  const [search, setSearch] = useState('');
  const selected = products.find((p) => p.id === value) ?? null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, search]);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Package size={15} className="shrink-0 text-navy-700" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-navy-950">{label(selected)}</p>
            <p className="truncate text-xs text-slate-400">
              {selected.sku} · {selected.stockQuantity} in stock
            </p>
          </div>
        </div>
        <button type="button" onClick={() => onChange('')} className="shrink-0 text-xs font-medium text-navy-700 hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <Input placeholder="Search product by name, brand or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
      {search.trim() && (
        <div className="absolute z-10 mt-1 max-h-60 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">No matching product</p>
          ) : (
            matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onChange(p.id);
                  setSearch('');
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-navy-950">{label(p)}</span>
                <span className="text-xs text-slate-400">
                  {p.sku} · {p.stockQuantity} in stock
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
