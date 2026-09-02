import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { canEditProducts } from '../lib/permissions';
import { useCategories, useCreateProduct, useProducts, useUpdateProduct } from '../api/catalog';
import { ApiError } from '../api/client';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, formatCurrency } from '../components/ui';
import type { Product, ProductCategory } from '../types';
import { Pencil, Plus, Power, Search } from 'lucide-react';

const emptyForm = { name: '', brand: '', category: '' as ProductCategory, sku: '', unitPrice: '', stockQuantity: '', lowStockThreshold: '' };

export function Products() {
  const role = useAuthStore((s) => s.employee?.role);
  const canEdit = canEditProducts(role);
  const { data: categories = [] } = useCategories();
  // Deactivated categories still have to appear in the *filter* (existing products may sit
  // in one), but only active ones are offered when creating something new.
  const selectableCategories = categories.filter((c) => c.active);
  const categoryLabel = (name: string) => categories.find((c) => c.name === name)?.label ?? name;
  const isServiceCategory = (name: string) => categories.find((c) => c.name === name)?.kind === 'service';

  // Doctors manage the full catalog including deactivated items; everyone else only sees
  // what's currently sellable.
  const { data: products = [] } = useProducts({ activeOnly: !canEdit });

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deactivateTarget, setDeactivateTarget] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, categoryFilter]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      brand: p.brand ?? '',
      category: p.category,
      sku: p.sku,
      unitPrice: String(p.unitPrice / 100),
      stockQuantity: String(p.stockQuantity),
      lowStockThreshold: String(p.lowStockThreshold),
    });
    setModalOpen(true);
  };

  const submit = () => {
    if (!form.name.trim() || !form.sku.trim()) {
      toast.error('Name and SKU are required');
      return;
    }
    if (!form.category) {
      toast.error('Pick a category');
      return;
    }
    const isService = isServiceCategory(form.category);
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || undefined,
      category: form.category,
      sku: form.sku.trim(),
      unitPrice: Math.round((Number(form.unitPrice) || 0) * 100),
      stockQuantity: isService ? 0 : Number(form.stockQuantity) || 0,
      lowStockThreshold: isService ? 0 : Number(form.lowStockThreshold) || 0,
    };
    const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : 'Something went wrong');

    if (editing) {
      updateProduct.mutate(
        { id: editing.id, patch: payload },
        {
          onSuccess: () => {
            toast.success('Product updated');
            setModalOpen(false);
          },
          onError,
        },
      );
    } else {
      createProduct.mutate(payload, {
        onSuccess: () => {
          toast.success('Product added');
          setModalOpen(false);
        },
        onError,
      });
    }
  };

  const saving = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Products</h1>
          <p className="text-sm text-slate-500">{canEdit ? 'Manage inventory' : 'Read-only view of inventory'}</p>
        </div>
        {canEdit && (
          <Button onClick={openAdd}>
            <Plus size={16} /> Add product
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as 'all' | ProductCategory)} className="w-44">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState title="No products found" subtitle="Try a different search or filter" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Product</th>
                  <th className="px-5 py-3 font-medium">SKU</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Price</th>
                  <th className="px-5 py-3 font-medium">Stock</th>
                  {canEdit && <th className="px-5 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  const low = p.stockQuantity <= p.lowStockThreshold;
                  return (
                    <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                      <td className="px-5 py-3 font-medium text-navy-950">
                        {p.name} {!p.active && <span className="text-xs font-normal text-slate-400">(inactive)</span>}
                      </td>
                      <td className="px-5 py-3 text-slate-500">{p.sku}</td>
                      <td className="px-5 py-3 text-slate-600">{categoryLabel(p.category)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatCurrency(p.unitPrice)}</td>
                      <td className="px-5 py-3">
                        {p.kind === 'service' ? (
                          <Badge tone="service">Unlimited</Badge>
                        ) : low ? (
                          <Badge tone="low">{p.stockQuantity} left</Badge>
                        ) : (
                          <span className="text-slate-600">{p.stockQuantity}</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-800">
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => (p.active ? setDeactivateTarget(p) : updateProduct.mutate({ id: p.id, patch: { active: true } }))}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title={p.active ? 'Deactivate' : 'Reactivate'}
                            >
                              <Power size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalOpen && (
        <Modal title={editing ? 'Edit product' : 'Add product'} onClose={() => setModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Brand (optional)</label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Royal Canin" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">SKU</label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}>
                <option value="">Select a category</option>
                {selectableCategories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className={isServiceCategory(form.category) ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-3'}>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Price (EGP)</label>
                <Input type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
              </div>
              {isServiceCategory(form.category) ? (
                <p className="text-xs text-slate-400">Services have unlimited availability — no stock to track.</p>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Stock</label>
                    <Input
                      type="number"
                      value={form.stockQuantity}
                      onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                      disabled={!!editing}
                      title={editing ? 'Stock changes go through sales, refunds and shipments — not a direct edit.' : undefined}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500">Low at</label>
                    <Input type="number" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add product'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deactivateTarget && (
        <Modal title="Deactivate product" onClose={() => setDeactivateTarget(null)}>
          <p className="text-sm text-slate-600">
            Deactivate <span className="font-medium text-navy-950">{deactivateTarget.name}</span>? It will stop appearing
            in POS and the sellable catalog, but its sales history is kept. You can reactivate it any time.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                updateProduct.mutate(
                  { id: deactivateTarget.id, patch: { active: false } },
                  { onSuccess: () => toast.success('Product deactivated') },
                );
                setDeactivateTarget(null);
              }}
            >
              Deactivate
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
