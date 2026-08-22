import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { canEditProducts } from '../lib/permissions';
import { Badge, Button, Card, EmptyState, Input, Modal, Select, formatCurrency } from '../components/ui';
import type { Product, ProductCategory } from '../types';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';

const categories: ProductCategory[] = ['food', 'accessories', 'medicine', 'grooming'];

const emptyForm = { name: '', category: 'food' as ProductCategory, sku: '', unitPrice: '', stockQuantity: '', lowStockThreshold: '' };

export function Products() {
  const products = useStore((s) => s.products);
  const addProduct = useStore((s) => s.addProduct);
  const updateProduct = useStore((s) => s.updateProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const role = useStore((s) => s.currentUser()?.role);
  const canEdit = canEditProducts(role);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ProductCategory>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

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
      category: p.category,
      sku: p.sku,
      unitPrice: String(p.unitPrice),
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
    const payload = {
      name: form.name.trim(),
      category: form.category,
      sku: form.sku.trim(),
      unitPrice: Number(form.unitPrice) || 0,
      stockQuantity: Number(form.stockQuantity) || 0,
      lowStockThreshold: Number(form.lowStockThreshold) || 0,
    };
    if (editing) {
      updateProduct(editing.id, payload);
      toast.success('Product updated');
    } else {
      addProduct(payload);
      toast.success('Product added');
    }
    setModalOpen(false);
  };

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
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)} className="w-44">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
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
                    <tr key={p.id}>
                      <td className="px-5 py-3 font-medium text-navy-950">{p.name}</td>
                      <td className="px-5 py-3 text-slate-500">{p.sku}</td>
                      <td className="px-5 py-3 capitalize text-slate-600">{p.category}</td>
                      <td className="px-5 py-3 text-slate-600">{formatCurrency(p.unitPrice)}</td>
                      <td className="px-5 py-3">
                        {low ? <Badge tone="low">{p.stockQuantity} left</Badge> : <span className="text-slate-600">{p.stockQuantity}</span>}
                      </td>
                      {canEdit && (
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openEdit(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-800">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => setDeleteTarget(p)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 size={15} />
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
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">SKU</label>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Category</label>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Price (EGP)</label>
                <Input type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Stock</label>
                <Input type="number" value={form.stockQuantity} onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Low at</label>
                <Input type="number" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit}>{editing ? 'Save changes' : 'Add product'}</Button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete product" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600">
            Remove <span className="font-medium text-navy-950">{deleteTarget.name}</span> from inventory? This cannot be undone.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteProduct(deleteTarget.id);
                toast.success('Product removed');
                setDeleteTarget(null);
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
