import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { canManageDiscounts, canViewAllAnalytics, canViewFinancials } from '../lib/permissions';
import { useProducts } from '../api/catalog';
import { useSales } from '../api/sales';
import { useClients } from '../api/clients';
import { useCreateDiscount, useDiscounts, useRevokeDiscount } from '../api/discounts';
import { isTodayInBusinessTz } from '../lib/timezone';
import { ApiError } from '../api/client';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmployeeTag,
  EmptyState,
  Input,
  Modal,
  Select,
  StatTile,
  formatCurrency,
  formatDateTime,
} from '../components/ui';
import type { DiscountKind } from '../types';
import { MoneyOverview } from '../components/MoneyOverview';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { Link } from 'react-router-dom';

const emptyDiscountForm = { clientId: '', kind: 'percent' as DiscountKind, value: '', note: '' };

export function Dashboard() {
  const employee = useAuthStore((s) => s.employee);
  const canDiscount = canManageDiscounts(employee?.role);
  const canSeeMoney = canViewFinancials(employee);
  const seesEveryone = canViewAllAnalytics(employee);

  const { data: products = [] } = useProducts({ activeOnly: true });
  // Without clinic-wide analytics this tile counts only what you rang up yourself — the
  // filter is pushed to the API rather than applied here, so the clinic-wide figure is
  // never fetched by someone who isn't allowed to see it.
  const { data: sales = [] } = useSales({ sinceDays: 2, ...(seesEveryone ? {} : { soldBy: employee?.id }) });
  const { data: clients = [] } = useClients();
  const { data: discounts = [] } = useDiscounts();
  const createDiscount = useCreateDiscount();
  const revokeDiscount = useRevokeDiscount();

  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountForm, setDiscountForm] = useState(emptyDiscountForm);

  const lowStock = products.filter((p) => p.kind === 'good' && p.stockQuantity <= p.lowStockThreshold);
  const todaysSales = sales.filter((t) => isTodayInBusinessTz(t.createdAt));
  const todaysRevenue = todaysSales.reduce((sum, t) => sum + t.total, 0);
  const recent = [...sales].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 8);

  const submitDiscount = () => {
    if (!discountForm.clientId) {
      toast.error('Select a client');
      return;
    }
    const enteredValue = Number(discountForm.value);
    if (!enteredValue || enteredValue <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (discountForm.kind === 'percent' && enteredValue > 100) {
      toast.error('Percent discount cannot exceed 100');
      return;
    }
    // Percent is stored as-is (0-100); a fixed amount is EGP typed by the doctor, converted
    // to piastres — every money field in the API is piastres, this input is the exception
    // that has to convert because it's what a human types.
    const value = discountForm.kind === 'percent' ? enteredValue : Math.round(enteredValue * 100);

    createDiscount.mutate(
      { clientId: discountForm.clientId, kind: discountForm.kind, value, note: discountForm.note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Discount created — available at POS checkout');
          setDiscountForm(emptyDiscountForm);
          setDiscountModalOpen(false);
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create discount'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-navy-950">Welcome back, {employee?.name.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">Here&apos;s what&apos;s happening at the store today.</p>
      </div>

      {lowStock.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-red-500" size={18} />
          <div className="flex-1 text-sm text-red-700">
            <span className="font-medium">{lowStock.length} product{lowStock.length > 1 ? 's' : ''} low on stock:</span>{' '}
            {lowStock.map((p) => p.name).join(', ')}.{' '}
            <Link to="/products" className="underline">
              View products
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label={seesEveryone ? "Today's sales" : 'Your sales today'}
          value={formatCurrency(todaysRevenue)}
          hint={`${todaysSales.length} transaction${todaysSales.length === 1 ? '' : 's'}`}
          tone="gold"
        />
        <StatTile label="Products low on stock" value={String(lowStock.length)} tone={lowStock.length ? 'warn' : 'default'} />
        <StatTile label="Total products" value={String(products.length)} />
      </div>

      {canSeeMoney && <MoneyOverview />}

      {canDiscount && (
        <Card>
          <CardHeader
            title="Discounts"
            subtitle="Grant a client discount to redeem at POS checkout — doctor only"
            action={
              <Button onClick={() => setDiscountModalOpen(true)}>
                <Plus size={15} /> New discount
              </Button>
            }
          />
          {discounts.length === 0 ? (
            <EmptyState title="No discounts yet" subtitle="Create one to make it available at POS checkout" />
          ) : (
            <div className="divide-y divide-slate-100">
              {discounts.map((d) => {
                const used = !!d.usedInTransactionId;
                return (
                  <div key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="mb-1 flex items-center gap-2">
                        <Badge tone="discount">{d.kind === 'percent' ? `${d.value}%` : formatCurrency(d.value)} off</Badge>
                        <Badge tone={used ? 'used' : 'active'}>{used ? 'Used' : 'Active'}</Badge>
                      </div>
                      <p className="text-sm text-navy-950">
                        {d.client?.name ?? 'Unknown client'}
                        {d.note ? ` — ${d.note}` : ''}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <EmployeeTag name={d.createdByEmployee?.name ?? 'Unknown'} />
                        <span className="text-xs text-slate-400">{formatDateTime(d.createdAt)}</span>
                      </div>
                    </div>
                    {!used && (
                      <button
                        onClick={() => revokeDiscount.mutate(d.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader
          title="Recent transactions"
          subtitle={seesEveryone ? 'Latest sales across the store' : 'Your most recent sales'}
        />
        {recent.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-navy-950">{t.customerName}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <EmployeeTag name={t.soldByEmployee?.name ?? 'Unknown'} />
                    <span className="text-xs text-slate-400">{formatDateTime(t.createdAt)}</span>
                  </div>
                </div>
                <p className="font-semibold text-navy-950">{formatCurrency(t.total)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {discountModalOpen && (
        <Modal title="New discount" onClose={() => setDiscountModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Client</label>
              <Select value={discountForm.clientId} onChange={(e) => setDiscountForm({ ...discountForm, clientId: e.target.value })}>
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
                <Select value={discountForm.kind} onChange={(e) => setDiscountForm({ ...discountForm, kind: e.target.value as DiscountKind })}>
                  <option value="percent">Percent off</option>
                  <option value="fixed">Fixed amount off</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {discountForm.kind === 'percent' ? 'Percent (%)' : 'Amount (EGP)'}
                </label>
                <Input type="number" value={discountForm.value} onChange={(e) => setDiscountForm({ ...discountForm, value: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Note (optional)</label>
              <Input
                value={discountForm.note}
                onChange={(e) => setDiscountForm({ ...discountForm, note: e.target.value })}
                placeholder="e.g. Loyalty discount"
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDiscountModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitDiscount} disabled={createDiscount.isPending}>
                {createDiscount.isPending ? 'Creating…' : 'Create discount'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
