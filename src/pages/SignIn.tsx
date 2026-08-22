import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Badge } from '../components/ui';
import { LogoLockup } from '../components/Logo';
import { Stethoscope, HeartPulse, Receipt } from 'lucide-react';

const roleIcon: Record<string, React.ReactNode> = {
  doctor: <Stethoscope size={20} />,
  nurse: <HeartPulse size={20} />,
  cashier: <Receipt size={20} />,
};

export function SignIn() {
  const employees = useStore((s) => s.employees);
  const signIn = useStore((s) => s.signIn);
  const navigate = useNavigate();

  const handlePick = (id: string) => {
    signIn(id);
    navigate('/dashboard');
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 px-4 py-14">
      <div className="mb-10 rounded-2xl bg-white/95 px-6 py-4 shadow-lg">
        <LogoLockup />
      </div>
      <h1 className="text-center text-2xl font-semibold text-white">Sign in as</h1>
      <p className="mt-1 text-center text-sm text-navy-100">
        Prototype login &mdash; pick a staff member to preview their view of the app.
      </p>

      <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {employees
          .filter((e) => e.active)
          .map((e) => (
            <button
              key={e.id}
              onClick={() => handlePick(e.id)}
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur transition-colors hover:bg-white/10"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-500 text-navy-950">
                {roleIcon[e.role]}
              </div>
              <div>
                <p className="font-medium text-white">{e.name}</p>
                <Badge tone={e.role}>{e.role}</Badge>
              </div>
            </button>
          ))}
      </div>

      <p className="mt-10 max-w-md text-center text-xs text-navy-200">
        This is a click-through demo. Nothing here is saved &mdash; all data resets when the page is refreshed.
      </p>
    </div>
  );
}
