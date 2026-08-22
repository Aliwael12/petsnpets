import type { ReactNode } from 'react';

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
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'gold' | 'warn';
}) {
  const toneClasses: Record<string, string> = {
    default: 'bg-white border-slate-200',
    gold: 'bg-gradient-to-br from-navy-900 to-navy-700 border-navy-900 text-white',
    warn: 'bg-red-50 border-red-200',
  };
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClasses[tone]}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${tone === 'gold' ? 'text-gold-300' : 'text-slate-500'}`}>
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${tone === 'gold' ? 'text-white' : tone === 'warn' ? 'text-red-700' : 'text-navy-950'}`}>
        {value}
      </p>
      {hint && <p className={`mt-1 text-xs ${tone === 'gold' ? 'text-navy-100' : 'text-slate-400'}`}>{hint}</p>}
    </div>
  );
}

export function formatCurrency(value: number): string {
  return `EGP ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
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
