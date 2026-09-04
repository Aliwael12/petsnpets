import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useActiveEmployees, usePinLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { Badge, Button, Input, Modal } from '../components/ui';
import { LogoLockup } from '../components/Logo';
import type { Employee } from '../types';
import { Stethoscope, HeartPulse, Receipt, ShieldCheck } from 'lucide-react';

const roleIcon: Record<string, React.ReactNode> = {
  admin: <ShieldCheck size={20} />,
  doctor: <Stethoscope size={20} />,
  nurse: <HeartPulse size={20} />,
  cashier: <Receipt size={20} />,
};

export function SignIn() {
  const { data: employees, isLoading } = useActiveEmployees();
  const pinLogin = usePinLogin();
  const navigate = useNavigate();

  const [picked, setPicked] = useState<Employee | null>(null);
  const [pin, setPin] = useState('');

  const closeModal = () => {
    setPicked(null);
    setPin('');
  };

  const submitPin = () => {
    if (!picked) return;
    pinLogin.mutate(
      { employeeId: picked.id, pin },
      {
        onSuccess: () => {
          toast.success(`Welcome back, ${picked.name.split(' ')[0]}`);
          closeModal();
          navigate('/dashboard');
        },
        onError: (err) => {
          const message = err instanceof ApiError ? err.message : 'Something went wrong.';
          toast.error(message);
          setPin('');
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950 px-4 py-14">
      <div className="mb-10 rounded-2xl bg-white/95 px-6 py-4 shadow-lg">
        <LogoLockup className="h-16" />
      </div>
      <h1 className="text-center text-2xl font-semibold text-white">Sign in as</h1>
      <p className="mt-1 text-center text-sm text-navy-100">Pick your name, then enter your PIN.</p>

      <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading && <p className="col-span-full text-center text-sm text-navy-200">Loading staff…</p>}
        {employees?.map((e) => (
          <button
            key={e.id}
            onClick={() => setPicked(e)}
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
        Elite Blue Veterinary Center — store &amp; clinic management system.
      </p>
      <Link to="/" className="mt-3 text-xs font-medium text-navy-100 underline-offset-4 hover:underline">
        ← Back to the website
      </Link>

      {picked && (
        <Modal title={`Sign in as ${picked.name}`} onClose={closeModal}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">PIN</label>
              <Input
                type="password"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitPin()}
                placeholder="••••"
              />
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={closeModal}>
                Cancel
              </Button>
              <Button onClick={submitPin} disabled={pinLogin.isPending || pin.length < 4}>
                {pinLogin.isPending ? 'Checking…' : 'Sign in'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
