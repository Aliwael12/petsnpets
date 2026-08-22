import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from '../store/useStore';
import { Button, Card, CardHeader, EmptyState, Input, formatCurrency } from '../components/ui';
import { downloadInvoice } from '../lib/invoice';
import { Minus, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';

interface CartLine {
  productId: string;
  quantity: number;
}

export function POS() {
  const products = useStore((s) => s.products);
  const completeSale = useStore((s) => s.completeSale);
  const currentUser = useStore((s) => s.currentUser());

  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = useMemo(
    () => products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) && p.stockQuantity > 0),
    [products, search],
  );

  const addToCart = (productId: string) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      const product = products.find((p) => p.id === productId)!;
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
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
          if (nextQty > product.stockQuantity) {
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

  const total = cartDetails.reduce((sum, l) => sum + l.product.unitPrice * l.quantity, 0);

  const completeSaleHandler = async () => {
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    if (!currentUser) return;
    setSubmitting(true);
    try {
      const items = cartDetails.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.product.unitPrice }));
      const name = customerName.trim() || 'Walk-in customer';
      const transaction = completeSale(name, items, currentUser.id);
      await downloadInvoice(transaction, products, currentUser.name);
      toast.success('Sale complete — invoice downloaded');
      setCart([]);
      setCustomerName('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="flex-1">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-navy-950">Point of Sale</h1>
          <p className="text-sm text-slate-500">Pick products to add them to the cart</p>
        </div>
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
              <span className="mt-1 text-xs text-slate-400">{p.stockQuantity} in stock</span>
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
          <label className="mb-1 block text-xs font-medium text-slate-500">Customer name (optional)</label>
          <Input placeholder="Walk-in customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Total</span>
            <span className="text-lg font-semibold text-navy-950">{formatCurrency(total)}</span>
          </div>

          <Button className="mt-4 w-full" onClick={completeSaleHandler} disabled={submitting || cart.length === 0}>
            {submitting ? 'Processing…' : 'Complete sale & download invoice'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
