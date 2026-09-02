import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/useAuthStore';
import { useProducts } from '../api/catalog';
import { useClients, useCreateClient } from '../api/clients';
import { useDiscounts } from '../api/discounts';
import { useCheckout, useSales } from '../api/sales';
import { useCreateRefund, useRefunds } from '../api/refunds';
import { openInvoice } from '../api/invoices';
import { ApiError } from '../api/client';
import { Badge, Button, Card, CardHeader, EmployeeTag, EmptyState, Input, Modal, PhoneListInput, TabSwitch, formatCurrency, formatDateTime } from '../components/ui';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../types';
import { Minus, Plus, RotateCcw, Search, ShoppingCart, Trash2, UserPlus, UserRound } from 'lucide-react';

interface CartLine {
  productId: string;
  quantity: number;
}

const PAYMENT_OPTIONS: PaymentMethod[] = ['cash', 'instapay', 'card'];

/** Deliberately has no pre-selected default and the sale can't be completed without a
 * choice: silently defaulting to cash would fill the dashboard's breakdown with a method
 * nobody actually picked, which is worse than the one extra tap it saves. */
function PaymentPicker({
  value,
  onChange,
  label,
}: {
  value: PaymentMethod | '';
  onChange: (next: PaymentMethod) => void;
  label: string;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-slate-500">{label}</p>
      <div className="grid grid-cols-3 gap-1.5">
        {PAYMENT_OPTIONS.map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => onChange(method)}
            className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
              value === method ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-200 text-slate-600 hover:border-navy-400'
            }`}
          >
            {PAYMENT_METHOD_LABELS[method]}
          </button>
        ))}
      </div>
    </div>
  );
}

function discountAmountFor(subtotal: number, discount: { kind: 'percent' | 'fixed'; value: number } | undefined): number {
  if (!discount) return 0;
  const raw = discount.kind === 'percent' ? Math.round((subtotal * discount.value) / 100) : discount.value;
  return Math.min(subtotal, raw);
}

export function POS() {
  const employee = useAuthStore((s) => s.employee);
  const { data: products = [] } = useProducts({ activeOnly: true });
  const { data: clients = [] } = useClients();
  const { data: sales = [] } = useSales();
  const { data: refunds = [] } = useRefunds();
  const checkout = useCheckout();
  const createRefund = useCreateRefund();
  const createClient = useCreateClient();

  const [tab, setTab] = useState<'sale' | 'refund'>('sale');

  // --- Sale state ---
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [newClientModalOpen, setNewClientModalOpen] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: '', phones: [''] as string[] });
  const [discountId, setDiscountId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');

  const { data: availableDiscounts = [] } = useDiscounts({ clientId, availableOnly: true }, { enabled: !!clientId });

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const clientMatches = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return [];
    return clients.filter((c) => c.name.toLowerCase().includes(q) || c.phones.some((p) => p.phone.toLowerCase().includes(q))).slice(0, 6);
  }, [clients, clientSearch]);

  // --- Refund state ---
  const [refundSearch, setRefundSearch] = useState('');
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const [refundQty, setRefundQty] = useState<Record<string, number>>({});
  const [refundReason, setRefundReason] = useState('');
  /** Empty means "same way the sale was paid" — the server fills that in from the original
   * transaction, so the common case needs no input at all. */
  const [refundMethod, setRefundMethod] = useState<PaymentMethod | ''>('');

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) && (p.category === 'service' || p.stockQuantity > 0)),
    [products, search],
  );

  const addToCart = (productId: string) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      const product = products.find((p) => p.id === productId)!;
      if (existing) {
        if (product.category !== 'service' && existing.quantity >= product.stockQuantity) {
          toast.error('Not enough stock');
          return prev;
        }
        return prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { productId, quantity: 1 }];
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.productId !== productId) return l;
          const product = products.find((p) => p.id === productId)!;
          const nextQty = l.quantity + delta;
          if (product.category !== 'service' && nextQty > product.stockQuantity) {
            toast.error('Not enough stock');
            return l;
          }
          return { ...l, quantity: nextQty };
        })
        .filter((l) => l.quantity > 0),
    );
  };

  const removeLine = (productId: string) => setCart((prev) => prev.filter((l) => l.productId !== productId));

  const cartDetails = cart.map((line) => {
    const product = products.find((p) => p.id === line.productId)!;
    return { ...line, product };
  });

  const subtotal = cartDetails.reduce((sum, l) => sum + l.product.unitPrice * l.quantity, 0);
  const selectedDiscount = availableDiscounts.find((d) => d.id === discountId);
  const discountOff = discountAmountFor(subtotal, selectedDiscount);
  const total = subtotal - discountOff;

  const resetSale = () => {
    setCart([]);
    setClientId('');
    setClientSearch('');
    setDiscountId('');
    setPaymentMethod('');
  };

  const selectClient = (id: string) => {
    setClientId(id);
    setClientSearch('');
    setDiscountId('');
  };

  const changeClient = () => {
    setClientId('');
    setDiscountId('');
  };

  const openNewClientModal = () => {
    setNewClientForm({ name: clientSearch.trim(), phones: [''] });
    setNewClientModalOpen(true);
  };

  const submitNewClient = () => {
    const name = newClientForm.name.trim();
    const phones = newClientForm.phones.map((p) => p.trim()).filter(Boolean);
    if (!name) {
      toast.error('Customer name is required');
      return;
    }
    if (phones.length === 0) {
      toast.error('At least one phone number is required');
      return;
    }
    createClient.mutate(
      { name, phones },
      {
        onSuccess: (newClient) => {
          selectClient(newClient.id);
          setNewClientModalOpen(false);
          toast.success('Customer added');
        },
        onError: () => toast.error('Could not add customer'),
      },
    );
  };

  const completeSaleHandler = () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    if (!clientId) {
      toast.error('Search for or add a customer first');
      return;
    }
    if (!paymentMethod) {
      toast.error('Choose how the customer paid');
      return;
    }
    if (!employee) return;
    checkout.mutate(
      {
        clientId,
        items: cartDetails.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        discountId: selectedDiscount?.id,
        paymentMethod,
      },
      {
        onSuccess: async (transaction) => {
          toast.success('Sale complete — opening invoice');
          resetSale();
          try {
            await openInvoice(transaction.id);
          } catch {
            toast.error('Sale saved, but the invoice could not be opened. Find it later from Transactions.');
          }
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not complete sale'),
      },
    );
  };

  // --- Refund derived data ---
  const matchingTxns = useMemo(() => {
    const q = refundSearch.trim().toLowerCase();
    const list = q
      ? sales.filter((t) => t.id.toLowerCase().includes(q) || t.customerName.toLowerCase().includes(q) || `${t.invoiceYear}-${t.invoiceNo}`.includes(q))
      : sales;
    return [...list].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 30);
  }, [sales, refundSearch]);

  const selectedTxn = sales.find((t) => t.id === selectedTxnId) ?? null;
  const txnRefunds = refunds.filter((r) => r.transactionId === selectedTxnId);
  const alreadyRefundedQty = (productId: string) =>
    txnRefunds.reduce((sum, r) => sum + (r.items.find((it) => it.productId === productId)?.quantity ?? 0), 0);

  const selectTxn = (id: string) => {
    setSelectedTxnId(id);
    setRefundQty({});
    setRefundReason('');
  };

  const refundTotal = selectedTxn
    ? selectedTxn.items.reduce((sum, it) => sum + (refundQty[it.productId] ?? 0) * it.unitPrice, 0)
    : 0;

  const submitRefund = () => {
    if (!selectedTxn) return;
    const items = selectedTxn.items
      .map((it) => ({ productId: it.productId, quantity: refundQty[it.productId] ?? 0 }))
      .filter((it) => it.quantity > 0);
    if (items.length === 0) {
      toast.error('Select at least one item to refund');
      return;
    }
    createRefund.mutate(
      {
        transactionId: selectedTxn.id,
        items,
        reason: refundReason.trim() || undefined,
        paymentMethod: refundMethod || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Refund processed — stock updated');
          setSelectedTxnId(null);
          setRefundQty({});
          setRefundReason('');
          setRefundMethod('');
        },
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not process refund'),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-950">Point of Sale</h1>
          <p className="text-sm text-slate-500">{tab === 'sale' ? 'Pick products to add them to the cart' : 'Look up a past sale to process a refund'}</p>
        </div>
        <TabSwitch
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sale', label: 'Sale' },
            { value: 'refund', label: 'Refund' },
          ]}
        />
      </div>

      {tab === 'sale' ? (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex-1">
            <div className="relative mb-4 max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addToCart(p.id)}
                  className="flex flex-col items-start rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition-colors hover:border-navy-400 hover:shadow-md"
                >
                  <span className="text-xs text-slate-400 capitalize">{p.category}</span>
                  <span className="mt-1 line-clamp-2 text-sm font-medium text-navy-950">{p.name}</span>
                  <span className="mt-2 text-sm font-semibold text-navy-800">{formatCurrency(p.unitPrice)}</span>
                  <span className="mt-1 text-xs text-slate-400">{p.category === 'service' ? 'Service' : `${p.stockQuantity} in stock`}</span>
                </button>
              ))}
            </div>
          </div>

          <Card className="w-full lg:w-96 lg:sticky lg:top-6">
            <CardHeader title="Cart" subtitle={`${cart.length} item${cart.length === 1 ? '' : 's'}`} action={<ShoppingCart size={18} className="text-slate-400" />} />
            {cartDetails.length === 0 ? (
              <EmptyState title="Cart is empty" subtitle="Add products from the list" />
            ) : (
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {cartDetails.map((l) => (
                  <div key={l.productId} className="flex items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-950">{l.product.name}</p>
                      <p className="text-xs text-slate-400">{formatCurrency(l.product.unitPrice)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => changeQty(l.productId, -1)} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50">
                        <Minus size={13} />
                      </button>
                      <span className="w-5 text-center text-sm">{l.quantity}</span>
                      <button onClick={() => changeQty(l.productId, 1)} className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50">
                        <Plus size={13} />
                      </button>
                      <button onClick={() => removeLine(l.productId)} className="ml-1 rounded-md p-1 text-slate-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-slate-100 px-5 py-4">
              <label className="mb-1 block text-xs font-medium text-slate-500">Customer *</label>
              {selectedClient ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-navy-800">
                      <UserRound size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-navy-950">{selectedClient.name}</p>
                      <p className="truncate text-xs text-slate-400">{selectedClient.phones[0]?.phone}</p>
                    </div>
                  </div>
                  <button onClick={changeClient} className="shrink-0 text-xs font-medium text-navy-700 hover:underline">
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search customer by name or phone"
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="pl-8"
                  />
                  {clientSearch.trim() && (
                    <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      {clientMatches.length > 0 && (
                        <div className="max-h-48 divide-y divide-slate-100 overflow-y-auto">
                          {clientMatches.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => selectClient(c.id)}
                              className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
                            >
                              <span className="font-medium text-navy-950">{c.name}</span>
                              <span className="text-xs text-slate-400">{c.phones[0]?.phone}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={openNewClientModal}
                        className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-left text-sm font-medium text-navy-700 hover:bg-slate-50"
                      >
                        <UserPlus size={14} /> Add "{clientSearch.trim()}" as a new customer
                      </button>
                    </div>
                  )}
                </div>
              )}

              {clientId && availableDiscounts.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Available discount</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableDiscounts.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setDiscountId((cur) => (cur === d.id ? '' : d.id))}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          discountId === d.id ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-200 text-slate-600 hover:border-navy-400'
                        }`}
                      >
                        {d.kind === 'percent' ? `${d.value}% off` : `${formatCurrency(d.value)} off`}
                        {d.note ? ` — ${d.note}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <PaymentPicker value={paymentMethod} onChange={setPaymentMethod} label="Paid with" />

              <div className="mt-4 flex flex-col gap-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="text-navy-950">{formatCurrency(subtotal)}</span>
                </div>
                {discountOff > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Discount</span>
                    <span className="text-red-600">-{formatCurrency(discountOff)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500">Total</span>
                  <span className="text-lg font-semibold text-navy-950">{formatCurrency(total)}</span>
                </div>
              </div>

              <Button className="mt-4 w-full" onClick={completeSaleHandler} disabled={checkout.isPending || cart.length === 0 || !clientId || !paymentMethod}>
                {checkout.isPending ? 'Processing…' : 'Complete sale & open invoice'}
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[380px_1fr]">
          <Card className="flex flex-col">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Search by invoice, ID or customer" value={refundSearch} onChange={(e) => setRefundSearch(e.target.value)} className="pl-8 text-sm" />
              </div>
            </div>
            <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
              {matchingTxns.length === 0 ? (
                <EmptyState title="No transactions found" />
              ) : (
                matchingTxns.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTxn(t.id)}
                    className={`flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-slate-50 ${
                      t.id === selectedTxnId ? 'bg-slate-50' : ''
                    }`}
                  >
                    <p className="text-sm font-medium text-navy-950">{t.customerName}</p>
                    <p className="text-xs text-slate-400">
                      INV-{t.invoiceYear}-{String(t.invoiceNo).padStart(5, '0')} · {formatCurrency(t.total)} · {formatDateTime(t.createdAt)}
                    </p>
                  </button>
                ))
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-5">
            <Card>
              {!selectedTxn ? (
                <EmptyState title="Select a transaction to process a refund" />
              ) : (
                <>
                  <CardHeader
                    title={`Refund — ${selectedTxn.customerName}`}
                    subtitle={`INV-${selectedTxn.invoiceYear}-${String(selectedTxn.invoiceNo).padStart(5, '0')} · Sold by ${selectedTxn.soldByEmployee?.name ?? 'Unknown'} · ${formatDateTime(selectedTxn.createdAt)}`}
                  />
                  <div className="divide-y divide-slate-100">
                    {selectedTxn.items.map((it) => {
                      const already = alreadyRefundedQty(it.productId);
                      const remaining = it.quantity - already;
                      const qty = refundQty[it.productId] ?? 0;
                      return (
                        <div key={it.productId} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-navy-950">{productName(it.productId)}</p>
                            <p className="text-xs text-slate-400">
                              Sold ×{it.quantity} at {formatCurrency(it.unitPrice)}
                              {already > 0 && ` · ${already} already refunded`}
                            </p>
                          </div>
                          {remaining <= 0 ? (
                            <Badge tone="used">Fully refunded</Badge>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setRefundQty((r) => ({ ...r, [it.productId]: Math.max(0, (r[it.productId] ?? 0) - 1) }))}
                                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                              >
                                <Minus size={13} />
                              </button>
                              <span className="w-5 text-center text-sm">{qty}</span>
                              <button
                                onClick={() => setRefundQty((r) => ({ ...r, [it.productId]: Math.min(remaining, (r[it.productId] ?? 0) + 1) }))}
                                className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="border-t border-slate-100 px-5 py-4">
                    <label className="mb-1 block text-xs font-medium text-slate-500">Reason (optional)</label>
                    <Input placeholder="e.g. Wrong item purchased" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />

                    <div className="mt-3">
                      <p className="mb-1.5 text-xs font-medium text-slate-500">Refunded with</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setRefundMethod('')}
                          className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                            refundMethod === '' ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-200 text-slate-600 hover:border-navy-400'
                          }`}
                        >
                          {selectedTxn.paymentMethod ? `Same (${PAYMENT_METHOD_LABELS[selectedTxn.paymentMethod]})` : 'Same as sale'}
                        </button>
                        {PAYMENT_OPTIONS.map((method) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() => setRefundMethod(method)}
                            className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                              refundMethod === method
                                ? 'border-navy-800 bg-navy-800 text-white'
                                : 'border-slate-200 text-slate-600 hover:border-navy-400'
                            }`}
                          >
                            {PAYMENT_METHOD_LABELS[method]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Refund total</span>
                      <span className="text-lg font-semibold text-navy-950">{formatCurrency(refundTotal)}</span>
                    </div>
                    <Button variant="danger" className="mt-4 w-full" onClick={submitRefund} disabled={createRefund.isPending || refundTotal === 0}>
                      <RotateCcw size={15} /> {createRefund.isPending ? 'Processing…' : 'Process refund'}
                    </Button>
                  </div>
                </>
              )}
            </Card>

            {refunds.length > 0 && (
              <Card>
                <CardHeader title="Recent refunds" />
                <div className="divide-y divide-slate-100">
                  {refunds.slice(0, 10).map((r) => (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-navy-950">
                          {r.items.map((it) => `${it.product?.name ?? productName(it.productId)} ×${it.quantity}`).join(', ')}
                        </p>
                        <p className="text-xs text-slate-400">
                          Ref. {r.transaction ? `INV-${r.transaction.invoiceYear}-${String(r.transaction.invoiceNo).padStart(5, '0')}` : r.transactionId}{' '}
                          {r.reason ? `· ${r.reason}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold text-navy-950">-{formatCurrency(r.total)}</span>
                        <EmployeeTag name={r.refundedByEmployee?.name ?? 'Unknown'} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {newClientModalOpen && (
        <Modal title="Add new customer" onClose={() => setNewClientModalOpen(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <Input value={newClientForm.name} onChange={(e) => setNewClientForm({ ...newClientForm, name: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Phone numbers</label>
              <PhoneListInput value={newClientForm.phones} onChange={(phones) => setNewClientForm({ ...newClientForm, phones })} />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setNewClientModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitNewClient} disabled={createClient.isPending}>
                {createClient.isPending ? 'Saving…' : 'Add & select'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
