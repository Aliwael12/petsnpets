import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { useChangePin } from '../api/auth';
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../api/catalog';
import { ApiError } from '../api/client';
import { Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Select, TabSwitch, Toggle } from '../components/ui';
import type { Category, ProductKind } from '../types';
import { KeyRound, Pencil, Plus, Tags, Trash2 } from 'lucide-react';

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
    if (!/^\d{4,12}$/.test(form.newPin)) {
      toast.error('The new PIN must be 4–12 digits');
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
        subtitle="This is the PIN you use to sign in at the terminal"
        action={<KeyRound size={16} className="text-slate-400" />}
      />
      <div className="flex max-w-md flex-col gap-3 px-5 py-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Current PIN</label>
          <Input
            type="password"
            inputMode="numeric"
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
              inputMode="numeric"
              autoComplete="new-password"
              value={form.newPin}
              onChange={(e) => setForm({ ...form, newPin: e.target.value })}
              placeholder="4–12 digits"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Confirm new PIN</label>
            <Input
              type="password"
              inputMode="numeric"
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
          subtitle="Used to group products across the catalog, POS and analytics"
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
                  <tr key={c.id}>
                    <td className="px-5 py-3">
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
  const role = useAuthStore((s) => s.employee?.role);
  const canManageCategories = role === 'doctor';
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

      {/* Category management is doctor-only on the API too — a non-doctor simply never sees
          the switcher, and the endpoints would reject them regardless. */}
      {canManageCategories && tab === 'categories' ? (
        <CategoriesCard />
      ) : (
        <>
          <ChangePinCard />
          {!canManageCategories && (
            <Card>
              <div className="flex items-center gap-3 px-5 py-4 text-sm text-slate-500">
                <Tags size={16} className="text-slate-400" />
                Product categories are managed by a doctor.
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
