import { useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Badge, Button, Card, Input, Modal, Select } from '../components/ui';
import type { Role } from '../types';
import { Plus, Trash2 } from 'lucide-react';

const roles: Role[] = ['doctor', 'nurse', 'cashier'];

export function Employees() {
  const employees = useStore((s) => s.employees);
  const addEmployee = useStore((s) => s.addEmployee);
  const toggleEmployeeActive = useStore((s) => s.toggleEmployeeActive);
  const removeEmployee = useStore((s) => s.removeEmployee);
  const currentUser = useStore((s) => s.currentUser());

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', role: 'cashier' as Role });
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const submit = () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    addEmployee(form.name.trim(), form.role);
    toast.success('Employee added');
    setForm({ name: '', role: 'cashier' });
    setModalOpen(false);
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
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((e) => (
                <tr key={e.id}>
                  <td className="px-5 py-3 font-medium text-navy-950">
                    {e.name} {e.id === currentUser?.id && <span className="text-xs text-slate-400">(you)</span>}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={e.role}>{e.role}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={e.active ? 'active' : 'inactive'}>{e.active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => toggleEmployeeActive(e.id)}>
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
              ))}
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
                    {r[0].toUpperCase() + r.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit}>Add employee</Button>
            </div>
          </div>
        </Modal>
      )}

      {removeTarget && (
        <Modal title="Remove employee" onClose={() => setRemoveTarget(null)}>
          <p className="text-sm text-slate-600">Remove this employee from the roster? This cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                removeEmployee(removeTarget);
                toast.success('Employee removed');
                setRemoveTarget(null);
              }}
            >
              Remove
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
