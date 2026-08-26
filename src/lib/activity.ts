import type { ActivityEntry, Discount, PetLog, Refund, Transaction } from '../types';

interface BuildActivityInput {
  sales: Transaction[];
  refunds: Refund[];
  discounts: Discount[];
  petLogs: PetLog[];
}

/** Composes a client's unified history from four already-scoped API responses. Used by the
 * Clients profile page — the equivalent employee-facing view (Analytics' employee summary)
 * gets its feed pre-built by the backend instead, since that one aggregates across the
 * whole business rather than record types for a single client. */
export function buildActivity({ sales, refunds, discounts, petLogs }: BuildActivityInput): ActivityEntry[] {
  const saleEntries: ActivityEntry[] = sales.map((t) => ({
    id: `sale-${t.id}`,
    type: 'sale',
    title: `Sale to ${t.customerName}`,
    detail: t.items.map((it) => `${it.product?.name ?? it.productId} ×${it.quantity}`).join(', '),
    actorId: t.soldBy,
    clientId: t.clientId ?? undefined,
    amount: t.total,
    at: t.createdAt,
  }));

  const refundEntries: ActivityEntry[] = refunds.map((r) => ({
    id: `refund-${r.id}`,
    type: 'refund',
    title: `Refund${r.transaction ? ` — ${r.transaction.customerName}` : ''}`,
    detail: r.items.map((it) => `${it.product?.name ?? it.productId} ×${it.quantity}`).join(', '),
    actorId: r.refundedBy,
    clientId: r.transaction?.clientId ?? undefined,
    amount: r.total,
    at: r.createdAt,
  }));

  const petLogEntries: ActivityEntry[] = petLogs.map((l) => ({
    id: `log-${l.id}`,
    type: 'pet-log',
    title: `${l.logType[0].toUpperCase()}${l.logType.slice(1)} — ${l.pet?.name ?? 'Pet'}`,
    detail: l.description,
    actorId: l.performedBy,
    clientId: l.pet?.clientId,
    petId: l.petId,
    at: l.performedAt,
  }));

  const discountEntries: ActivityEntry[] = discounts.map((d) => ({
    id: `disc-${d.id}`,
    type: 'discount',
    title: `Discount granted — ${d.kind === 'percent' ? `${d.value}%` : `EGP ${d.value / 100}`}${d.usedInTransactionId ? ' (used)' : ''}`,
    detail: d.note ?? undefined,
    actorId: d.createdBy,
    clientId: d.clientId,
    amount: d.value,
    at: d.createdAt,
  }));

  return [...saleEntries, ...refundEntries, ...petLogEntries, ...discountEntries].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
