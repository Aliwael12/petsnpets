import { Fragment, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { canManageCategories as canManageCategoriesFor } from '../lib/permissions';
import { useChangePin } from '../api/auth';
import {
  useCategories,
  useCreateCategory,
  useCreateProduct,
  useDeleteCategory,
  useProducts,
  useUpdateCategory,
  useUpdateProduct,
} from '../api/catalog';
import { ApiError } from '../api/client';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Select, TabSwitch, Toggle, formatCurrency } from '../components/ui';
import type { Category, Product, ProductKind } from '../types';
import { ChevronDown, ChevronRight, KeyRound, Pencil, Plus, Tags, Trash2 } from 'lucide-react';

/** Mirrors the server's slug rule (see category.dto.ts) so the field can be derived from
 * the label as you type rather than asking for it twice. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function ChangePinCard() {
  const changePin = useChangePin();
  const [form, setForm] = useState({ currentPin: '', newPin: '', confirmPin: '' });

  const submit = () => {
    if (!/^[A-Za-z0-9]{4,12}$/.test(form.newPin)) {
      toast.error('The new PIN must be 4–12 letters and/or numbers');
      return;
    }
    if (form.newPin !== form.confirmPin) {
      toast.error('The two new PINs do not match');
      return;
    }
    if (form.newPin === form.currentPin) {
      toast.error('The new PIN must be different from the current one');
      return;
    }
    changePin.mutate(
      { currentPin: form.currentPin, newPin: form.newPin },
      {
        onSuccess: () => {
          toast.success('PIN updated — use it next time you sign in');
          setForm({ currentPin: '', newPin: '', confirmPin: '' });
        },
        onError: (err) =>
          toast.error(err instanceof ApiError && err.code === 'INVALID_PIN' ? 'That current PIN is incorrect' : 'Could not change PIN'),
      },
    );
  };

  return (
    <Card>
      <CardHeader
        title="Change your PIN"
        subtitle="This is the PIN you use to sign in at the terminal — letters and numbers are both fine"
        action={<KeyRound size={16} className="text-slate-400" />}
      />
      <div className="flex max-w-md flex-col gap-3 px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Current PIN</label>
          <Input
            type="password"
            autoComplete="current-password"
            value={form.currentPin}
            onChange={(e) => setForm({ ...form, currentPin: e.target.value })}
            placeholder="••••"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">New PIN</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.newPin}
              onChange={(e) => setForm({ ...form, newPin: e.target.value })}
              placeholder="4–12 letters or numbers"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Confirm new PIN</label>
            <Input
              type="password"
              autoComplete="new-password"
              value={form.confirmPin}
              onChange={(e) => setForm({ ...form, confirmPin: e.target.value })}
              placeholder="Repeat it"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
        </div>
        <div className="mt-1">
          <Button onClick={submit} disabled={changePin.isPending || !form.currentPin || !form.newPin}>
            {changePin.isPending ? 'Updating…' : 'Update PIN'}
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          You&apos;ll stay signed in on this device — the new PIN applies the next time you sign in.
        </p>
      </div>
    </Card>
  );
}

const emptyProductForm = { name: '', brand: '', sku: '', unitPrice: '', stockQuantity: '', lowStockThreshold: '' };

/** Human-readable and unlikely to collide, so the field can be skipped entirely for a
 *  product added from here. Mirrors deriveSku() in purchasing.service.ts. */
function deriveSku(brand: string, name: string): string {
  const slug = [brand, name]
    .filter(Boolean)
    .join(' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'ITEM'}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * The products inside one category, expanded inline under its row.
 *
 * "Removing" a product retires it (active = false) rather than deleting it: a product that
 * has ever been sold is referenced by transaction_items, and deleting it would tear a hole
 * in the sales history the analytics read from. Retired products stay listed here, greyed,
 * with a one-click restore — so the action is reversible and visibly so.
 */
function CategoryProducts({ category }: { category: Category }) {
  const { data: products = [], isLoading } = useProducts({ category: category.name, activeOnly: false });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyProductForm);

  const isService = category.kind === 'service';

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('Give the product a name');
      return;
    }
    createProduct.mutate(
      {
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        category: category.name,
        // Auto-derived when left blank: the SKU matters to the shelf, not to someone
        // filling in a category from Settings.
        sku: form.sku.trim() || deriveSku(form.brand.trim(), form.name.trim()),
        unitPrice: Math.round((Number(form.unitPrice) || 0) * 100),
        stockQuantity: isService ? 0 : Number(form.stockQuantity) || 0,
        lowStockThreshold: isService ? 0 : Number(form.lowStockThreshold) || 0,
      },
      {
        onSuccess: () => {
          toast.success(`Added to ${category.label}`);
          setForm(emptyProductForm);
          setAddOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add the product'),
      },
    );
  };

  const setActive = (product: Product, active: boolean) => {
    updateProduct.mutate(
      { id: product.id, patch: { active } },
      {
        onSuccess: () => toast.success(active ? `"${product.name}" restored` : `"${product.name}" removed from sale`),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update the product'),
      },
    );
  };

  return (
    <>
      <div className="bg-slate-50/70 px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {isService ? 'Services' : 'Products'} in {category.label}
          </p>
          <Button variant="ghost" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add {isService ? 'service' : 'product'}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : products.length === 0 ? (
          <p className="text-sm text-slate-400">
            Nothing in this category yet. Add the first one, or move an existing product here from the Products tab.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200/70">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className={p.active ? '' : 'opacity-50'}>
                  <span className="text-sm font-medium text-navy-950">
                    {p.brand && <span className="text-slate-400">{p.brand} · </span>}
                    {p.name}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">{p.sku}</span>
                  {!p.active && (
                    <span className="ml-2">
                      <Badge tone="used">Removed</Badge>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-slate-600">{formatCurrency(p.unitPrice)}</span>
                  {!isService && <span className="text-xs text-slate-400">{p.stockQuantity} in stock</span>}
                  {p.active ? (
                    <button
                      onClick={() => setActive(p, false)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove from sale — keeps its sales history"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setActive(p, true)}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-navy-800"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Removing takes an item off the POS and the catalog but keeps every sale it was ever part of, so past invoices
          and reports stay correct. You can restore it at any time.
        </p>
      </div>

      {addOpen && (
        <Modal title={`Add to ${category.label}`} onClose={() => setAddOpen(false)}>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Brand (optional)</label>
                <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Price (EGP)</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">SKU (optional)</label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  placeholder="Generated if left empty"
                />
              </div>
            </div>
            {!isService && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Opening stock</label>
                  <Input
                    type="number"
                    min="0"
                    value={form.stockQuantity}
                    onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Low-stock alert at</label>
                  <Input
                    type="number"
                    min="0"
                    value={form.lowStockThreshold}
                    onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
                  />
                </div>
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={createProduct.isPending}>
                {createProduct.isPending ? 'Adding…' : `Add ${isService ? 'service' : 'product'}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

const emptyCategoryForm = { label: '', name: '', kind: 'good' as ProductKind, sortOrder: '' };

function CategoriesCard() {
  const { data: categories = [] } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyCategoryForm);
  const [editing, setEditing] = useState<Category | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  /** Only one category is open at a time — each one fetches its own products, and a page
   *  of simultaneously expanded rows would be a page of simultaneous requests. */
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const submitNew = () => {
    const label = form.label.trim();
    const name = (form.name.trim() || slugify(label)).trim();
    if (!label) {
      toast.error('Give the category a name');
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      toast.error('The internal key may only contain lowercase letters, numbers and hyphens');
      return;
    }
    createCategory.mutate(
      { label, name, kind: form.kind, sortOrder: form.sortOrder ? Number(form.sortOrder) : 0 },
      {
        onSuccess: () => {
          toast.success(`"${label}" added`);
          setForm(emptyCategoryForm);
          setAddOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add category'),
      },
    );
  };

  const submitEdit = () => {
    if (!editing || !editLabel.trim()) return;
    updateCategory.mutate(
      { id: editing.id, patch: { label: editLabel.trim() } },
      {
        onSuccess: () => {
          toast.success('Category renamed');
          setEditing(null);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not rename category'),
      },
    );
  };

  const toggleActive = (category: Category) => {
    updateCategory.mutate(
      { id: category.id, patch: { active: !category.active } },
      {
        onSuccess: () => toast.success(category.active ? `"${category.label}" hidden from new products` : `"${category.label}" re-enabled`),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update category'),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteCategory.mutate(deleteTarget.id, {
      onSuccess: () => toast.success(`"${deleteTarget.label}" deleted`),
      onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not delete category'),
    });
    setDeleteTarget(null);
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Product categories"
          subtitle="Used to group products across the catalog, POS and analytics. Open one to add or remove its products."
          action={
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={15} /> Add category
            </Button>
          }
        />
        {categories.length === 0 ? (
          <EmptyState title="No categories yet" subtitle="Add one to start organising the catalog" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Products</th>
                  <th className="px-5 py-3 font-medium">Available</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <Fragment key={c.id}>
                  <tr>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => setExpandedId((id) => (id === c.id ? null : c.id))}
                        className="mr-2 rounded p-0.5 align-middle text-slate-400 hover:bg-slate-100 hover:text-navy-800"
                        aria-expanded={expandedId === c.id}
                        title={expandedId === c.id ? 'Hide products' : 'Show products'}
                      >
                        {expandedId === c.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      <span className="font-medium text-navy-950">{c.label}</span>
                      <span className="ml-2 text-xs text-slate-400">{c.name}</span>
                      {c.isSystem && (
                        <span className="ml-2">
                          <Badge tone="used">Built-in</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={c.kind === 'service' ? 'service' : 'other'}>{c.kind === 'service' ? 'Service' : 'Stocked good'}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{c.productCount}</td>
                    <td className="px-5 py-3">
                      <Toggle checked={c.active} onChange={() => toggleActive(c)} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditing(c);
                            setEditLabel(c.label);
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-800"
                          title="Rename"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(c)}
                          disabled={c.isSystem || c.productCount > 0}
                          title={
                            c.isSystem
                              ? 'Built-in categories cannot be deleted'
                              : c.productCount > 0
                                ? `${c.productCount} product(s) still use this category`
                                : 'Delete'
                          }
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={5} className="p-0">
                        <CategoryProducts category={c} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
          Turning a category off hides it when creating new products but leaves existing products (and their history)
          untouched. A category can only be deleted once nothing uses it.
        </p>
      </Card>

      {addOpen && (
        <Modal title="Add category" onClose={() => setAddOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value, name: slugify(e.target.value) })}
                placeholder="e.g. Toys"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Internal key</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="toys" />
              <p className="mt-1 text-xs text-slate-400">
                Stored on each product and used by analytics. Derived from the name — it can&apos;t be changed later.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
              <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProductKind })}>
                <option value="good">Stocked good — tracked in inventory</option>
                <option value="service">Service — no stock, never runs out</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Sort order (optional)</label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                placeholder="0"
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitNew} disabled={createCategory.isPending}>
                {createCategory.isPending ? 'Adding…' : 'Add category'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Rename "${editing.label}"`} onClose={() => setEditing(null)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Display name</label>
              <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitEdit()} />
              <p className="mt-1 text-xs text-slate-400">
                Only the display name changes — the internal key <span className="font-medium">{editing.name}</span> stays the
                same, so existing products and past analytics are unaffected.
              </p>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={submitEdit} disabled={updateCategory.isPending}>
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Delete category" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-slate-600">
            Delete <span className="font-medium text-navy-950">{deleteTarget.label}</span>? Nothing is using it, so this is
            safe — but it can&apos;t be undone.
          </p>
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
    </>
  );
}

export function Settings() {
  const employee = useAuthStore((s) => s.employee);
  const canManageCategories = canManageCategoriesFor(employee);
  const [tab, setTab] = useState<'pin' | 'categories'>('pin');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Settings</h1>
          <p className="text-sm text-slate-500">Your sign-in PIN and shared catalog settings</p>
        </div>
        {canManageCategories && (
          <TabSwitch
            value={tab}
            onChange={setTab}
            options={[
              { value: 'pin', label: 'Security' },
              { value: 'categories', label: 'Categories' },
            ]}
          />
        )}
      </div>

      {/* categories:manage is enforced on the API too — someone without it simply never
          sees the switcher, and the endpoints would reject them regardless. */}
      {canManageCategories && tab === 'categories' ? (
        <CategoriesCard />
      ) : (
        <>
          <ChangePinCard />
          {!canManageCategories && (
            <Card>
              <div className="flex items-center gap-3 px-5 py-4 text-sm text-slate-500">
                <Tags size={16} className="text-slate-400" />
                Product categories are managed by an admin.
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
