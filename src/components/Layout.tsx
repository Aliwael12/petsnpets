import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useStore } from '../store/useStore';
import { NAV_ITEMS } from '../lib/permissions';
import { LogoLockup } from './Logo';
import { Badge } from './ui';
import { ChevronDown, LogOut, Menu, X } from 'lucide-react';

export function Layout() {
  const currentUser = useStore((s) => s.currentUser());
  const employees = useStore((s) => s.employees);
  const signIn = useStore((s) => s.signIn);
  const signOut = useStore((s) => s.signOut);
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!currentUser) return null;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(currentUser.role));

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-white border-r border-slate-200 transition-transform lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <LogoLockup />
          <button className="lg:hidden text-slate-400" onClick={() => setMobileNavOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="mt-2 flex flex-col gap-1 px-3">
          {visibleItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-navy-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-20 bg-black/30 lg:hidden" onClick={() => setMobileNavOpen(false)} />
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
          <button className="text-slate-500 lg:hidden" onClick={() => setMobileNavOpen(true)}>
            <Menu size={22} />
          </button>
          <div className="hidden lg:block" />
          <div className="relative">
            <button
              onClick={() => setSwitcherOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <div className="flex flex-col items-end leading-tight">
                <span className="font-medium text-navy-950">{currentUser.name}</span>
                <Badge tone={currentUser.role}>{currentUser.role}</Badge>
              </div>
              <ChevronDown size={16} className="text-slate-400" />
            </button>
            {switcherOpen && (
              <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Switch role (demo)
                </p>
                {employees
                  .filter((e) => e.active)
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        signIn(e.id);
                        setSwitcherOpen(false);
                        navigate('/dashboard');
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50 ${
                        e.id === currentUser.id ? 'bg-slate-50' : ''
                      }`}
                    >
                      <span className="text-navy-950">{e.name}</span>
                      <Badge tone={e.role}>{e.role}</Badge>
                    </button>
                  ))}
                <div className="mt-1 border-t border-slate-100 pt-1">
                  <button
                    onClick={() => {
                      signOut();
                      setSwitcherOpen(false);
                      navigate('/');
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={15} /> Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
