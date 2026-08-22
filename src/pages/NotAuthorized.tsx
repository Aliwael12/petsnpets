import { ShieldAlert } from 'lucide-react';

export function NotAuthorized() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
      <ShieldAlert className="text-gold-600" size={36} />
      <h1 className="text-lg font-semibold text-navy-950">Not authorized for this role</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Your current role doesn&apos;t have access to this page. Switch to a role with permission using the
        control in the top right.
      </p>
    </div>
  );
}
