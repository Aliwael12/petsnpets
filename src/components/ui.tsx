import type { ReactNode } from 'react';
import { Plus, User, X } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-navy-950">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const badgeStyles: Record<string, string> = {
  doctor: 'bg-navy-800 text-white',
  nurse: 'bg-gold-500 text-navy-950',
  cashier: 'bg-slate-200 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-200 text-slate-500',
  low: 'bg-red-100 text-red-700',
  vaccination: 'bg-sky-100 text-sky-700',
  shower: 'bg-teal-100 text-teal-700',
  other: 'bg-slate-100 text-slate-600',
  service: 'bg-violet-100 text-violet-700',
  sale: 'bg-gold-300 text-navy-900',
  refund: 'bg-red-100 text-red-700',
  'pet-log': 'bg-teal-100 text-teal-700',
  'supplier-order': 'bg-indigo-100 text-indigo-700',
  discount: 'bg-purple-100 text-purple-700',
  used: 'bg-slate-200 text-slate-500',
};

export function Badge({ tone = 'other', children }: { tone?: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${badgeStyles[tone] ?? badgeStyles.other}`}
    >
      {children}
    </span>
  );
}

export function EmployeeTag({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      <User size={11} />
      {name}
    </span>
  );
}

export function TabSwitch<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function PhoneListInput({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const phones = value.length > 0 ? value : [''];

  const update = (index: number, next: string) => {
    const copy = [...phones];
    copy[index] = next;
    onChange(copy);
  };

  const remove = (index: number) => {
    const copy = phones.filter((_, i) => i !== index);
    onChange(copy.length > 0 ? copy : ['']);
  };

  return (
    <div className="flex flex-col gap-2">
      {phones.map((phone, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={phone} onChange={(e) => update(i, e.target.value)} placeholder="+20 1xx xxx xxxx" />
          {phones.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...phones, ''])}
        className="flex items-center gap-1 self-start text-xs font-medium text-navy-700 hover:underline"
      >
        <Plus size={13} /> Add phone number
      </button>
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const variants: Record<string, string> = {
    primary: 'bg-navy-800 text-white hover:bg-navy-900 disabled:bg-slate-300',
    secondary: 'bg-gold-500 text-navy-950 hover:bg-gold-400 disabled:bg-slate-200',
    ghost: 'bg-transparent text-navy-800 hover:bg-slate-100 disabled:text-slate-300',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 disabled:text-slate-300',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-950 outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-100 ${props.className ?? ''}`}
    />
  );
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-navy-950 outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-100 ${props.className ?? ''}`}
    >
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-navy-800' : 'bg-slate-200'}`}
    >
      <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white shadow-xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-navy-950">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-14 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  action,
  footer,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'gold' | 'warn' | 'income' | 'expense';
  /** Rendered in the tile's top-right corner — a toggle or link that belongs to this
   * figure specifically, rather than to the whole card. */
  action?: ReactNode;
  /** Optional detail revealed under the figure, e.g. a payment-method breakdown. */
  footer?: ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    default: 'bg-white border-slate-200',
    gold: 'bg-gradient-to-br from-navy-900 to-navy-700 border-navy-900 text-white',
    warn: 'bg-red-50 border-red-200',
    income: 'bg-emerald-50/60 border-emerald-200',
    expense: 'bg-amber-50/60 border-amber-200',
  };
  const valueClasses: Record<string, string> = {
    default: 'text-navy-950',
    gold: 'text-white',
    warn: 'text-red-700',
    income: 'text-emerald-800',
    expense: 'text-amber-800',
  };
  return (
    <div className={`flex flex-col rounded-2xl border p-5 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-medium uppercase tracking-wide ${tone === 'gold' ? 'text-gold-300' : 'text-slate-500'}`}>
          {label}
        </p>
        {action}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueClasses[tone]}`}>{value}</p>
      {hint && <p className={`mt-1 text-xs ${tone === 'gold' ? 'text-navy-100' : 'text-slate-400'}`}>{hint}</p>}
      {footer}
    </div>
  );
}

/** `value` is piastres (the backend's money unit) — this is the one place that divides by
 * 100 for display. Never do that division anywhere else; pass piastres through unchanged. */
export function formatCurrency(value: number): string {
  return `EGP ${(value / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
