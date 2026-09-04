import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { useCreateEmployee, useEmployees, useRemoveEmployee, useToggleEmployeeActive, useUpdateEmployeeFeatures, useUpdateEmployeeRole } from '../api/employees';
import { ApiError } from '../api/client';
import { Badge, Button, Card, Input, Modal, Select, Toggle } from '../components/ui';
import { TOGGLEABLE_FEATURES } from '../lib/permissions';
import { ALL_PERMISSIONS, PERMISSION_LABELS, ROLE_LABELS, type Employee, type Permission, type Role } from '../types';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';

const roles: Role[] = ['admin', 'doctor', 'nurse', 'cashier'];
const emptyForm = { name: '', role: 'cashier' as Role, pin: '' };

export function Employees() {
  const currentUser = useAuthStore((s) => s.employee);
  const { data: employees = [] } = useEmployees();
  const createEmployee = useCreateEmployee();
  const toggleActive = useToggleEmployeeActive();
  const removeEmployee = useRemoveEmployee();
  const updateFeatures = useUpdateEmployeeFeatures();
  const updateRole = useUpdateEmployeeRole();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [permTarget, setPermTarget] = useState<Employee | null>(null);
  const [permSelection, setPermSelection] = useState<string[]>([]);
  const [grantSelection, setGrantSelection] = useState<string[]>([]);
  const [roleTarget, setRoleTarget] = useState<Employee | null>(null);
  const [roleValue, setRoleValue] = useState<Role>('cashier');
  const [roleResetFeatures, setRoleResetFeatures] = useState(true);

  const openRoleEditor = (e: Employee) => {
    setRoleTarget(e);
    setRoleValue(e.role);
    // Defaulting ON matches the common intent — a role change usually means the person's
    // job changed, so their tabs should follow. It can be turned off to preserve a
    // deliberately customised tab set.
    setRoleResetFeatures(true);
  };

  const saveRole = () => {
    if (!roleTarget) return;
    updateRole.mutate(
      { id: roleTarget.id, role: roleValue, resetFeatures: roleResetFeatures },
      {
        onSuccess: () => {
          toast.success(`${roleTarget.name} is now ${roleValue === 'admin' ? 'an' : 'a'} ${ROLE_LABELS[roleValue]}`);
          setRoleTarget(null);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not change the role'),
      },
    );
  };

  const openPermissions = (e: Employee) => {
    setPermTarget(e);
    setPermSelection(e.enabledFeatures ?? []);
    setGrantSelection(e.permissions ?? []);
  };

  const toggleGrant = (permission: Permission, checked: boolean) => {
    setGrantSelection((cur) => (checked ? [...cur, permission] : cur.filter((p) => p !== permission)));
  };

  const toggleFeature = (path: string, checked: boolean) => {
    setPermSelection((cur) => (checked ? [...cur, path] : cur.filter((p) => p !== path)));
  };

  const savePermissions = () => {
    if (!permTarget) return;
    updateFeatures.mutate(
      { id: permTarget.id, enabledFeatures: permSelection, permissions: grantSelection as Permission[] },
      {
        onSuccess: () => {
          toast.success('Permissions updated');
          setPermTarget(null);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not update permissions'),
      },
    );
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (form.pin.trim().length < 4) {
      toast.error('PIN must be at least 4 characters');
      return;
    }
    createEmployee.mutate(
      { name: form.name.trim(), role: form.role, pin: form.pin.trim() },
      {
        onSuccess: () => {
          toast.success('Employee added');
          setForm(emptyForm);
          setModalOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not add employee'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Employees</h1>
          <p className="text-sm text-slate-500">Manage staff accounts and roles</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Add employee
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Access</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => {
                const featureCount = e.enabledFeatures?.length ?? 0;
                return (
                  <tr key={e.id}>
                    <td className="px-5 py-3 font-medium text-navy-950">
                      {e.name} {e.id === currentUser?.id && <span className="text-xs text-slate-400">(you)</span>}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openRoleEditor(e)}
                        disabled={e.id === currentUser?.id}
                        title={e.id === currentUser?.id ? "You can't change your own role" : 'Change role'}
                        className="inline-flex items-center gap-1.5 rounded-lg disabled:cursor-not-allowed enabled:hover:opacity-80"
                      >
                        <Badge tone={e.role}>{e.role}</Badge>
                        {e.id !== currentUser?.id && <Pencil size={12} className="text-slate-400" />}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={e.active ? 'active' : 'inactive'}>{e.active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openPermissions(e)}
                        disabled={e.id === currentUser?.id}
                        className="flex items-center gap-1.5 text-sm text-navy-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                        title={e.id === currentUser?.id ? "You can't edit your own permissions" : undefined}
                      >
                        <Settings2 size={13} />
                        {e.role === 'admin'
                          ? 'Full access'
                          : featureCount === TOGGLEABLE_FEATURES.length
                            ? 'All tabs'
                            : `${featureCount} tab${featureCount === 1 ? '' : 's'}`}
                        {e.role !== 'admin' && (e.permissions?.length ?? 0) > 0
                          ? ` · ${e.permissions!.length} permission${e.permissions!.length === 1 ? '' : 's'}`
                          : ''}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => toggleActive.mutate(e.id)}>
                          {e.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <button
                          onClick={() => setRemoveTarget(e.id)}
                          disabled={e.id === currentUser?.id}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {modalOpen && (
        <Modal title="Add employee" onClose={() => setModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Role</label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">PIN (4+ letters or numbers, used to sign in)</label>
              <Input type="password" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder="••••" />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={createEmployee.isPending}>
                {createEmployee.isPending ? 'Adding…' : 'Add employee'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {removeTarget && (
        <Modal title="Remove employee" onClose={() => setRemoveTarget(null)}>
          <p className="text-sm text-slate-600">
            Remove this employee from the roster? If they have any sales, refunds or logs on record, removal isn&apos;t
            possible — deactivate them instead.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                removeEmployee.mutate(removeTarget, {
                  onSuccess: () => toast.success('Employee removed'),
                  onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not remove employee'),
                });
                setRemoveTarget(null);
              }}
            >
              Remove
            </Button>
          </div>
        </Modal>
      )}

      {roleTarget && (
        <Modal title={`Change role — ${roleTarget.name}`} onClose={() => setRoleTarget(null)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Role</label>
              <Select value={roleValue} onChange={(ev) => setRoleValue(ev.target.value as Role)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-slate-400">
                An admin can do everything. Every other role starts with nothing beyond their own work and is given
                access one permission at a time — set those under Access.
              </p>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3">
              <input
                type="checkbox"
                checked={roleResetFeatures}
                onChange={(ev) => setRoleResetFeatures(ev.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm text-slate-600">
                Also reset their visible tabs to the defaults for the new role
                <span className="mt-0.5 block text-xs text-slate-400">
                  Leave unticked to keep any custom tab access you set up for them.
                </span>
              </span>
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRoleTarget(null)}>
                Cancel
              </Button>
              <Button onClick={saveRole} disabled={updateRole.isPending}>
                {updateRole.isPending ? 'Saving…' : 'Save role'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {permTarget && (
        <Modal title={`Access — ${permTarget.name}`} onClose={() => setPermTarget(null)} wide>
          {permTarget.role === 'admin' ? (
            <p className="mb-4 rounded-xl border border-navy-200 bg-navy-50 px-4 py-3 text-sm text-navy-900">
              {permTarget.name.split(' ')[0]} is an admin and always has full access to everything. Change their role
              first if you need to limit what they can do.
            </p>
          ) : null}

          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Tabs</p>
          <p className="mb-3 text-sm text-slate-500">
            Which tabs {permTarget.name.split(' ')[0]} can see. A disabled tab disappears from their sidebar entirely.
          </p>
          <div className="flex flex-col divide-y divide-slate-100">
            {TOGGLEABLE_FEATURES.map((item) => (
              <div key={item.path} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-navy-950">{item.label}</span>
                <Toggle checked={permSelection.includes(item.path)} onChange={(checked) => toggleFeature(item.path, checked)} />
              </div>
            ))}
          </div>

          <p className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-slate-500">Permissions</p>
          <p className="mb-3 text-sm text-slate-500">
            What {permTarget.name.split(' ')[0]} is allowed to do. Unlike tabs, these are enforced by the server — the
            Money and Employees tabs appear on their own when the matching permission is granted.
          </p>
          <div className="flex flex-col divide-y divide-slate-100">
            {ALL_PERMISSIONS.map((permission) => (
              <div key={permission} className="flex items-center justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-navy-950">{PERMISSION_LABELS[permission].label}</p>
                  <p className="text-xs text-slate-400">{PERMISSION_LABELS[permission].detail}</p>
                </div>
                <Toggle
                  checked={permTarget.role === 'admin' || grantSelection.includes(permission)}
                  onChange={(checked) => toggleGrant(permission, checked)}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPermTarget(null)}>
              Cancel
            </Button>
            <Button onClick={savePermissions} disabled={updateFeatures.isPending}>
              {updateFeatures.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
