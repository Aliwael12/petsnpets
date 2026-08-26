import type { ReactNode } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { canAccess } from '../lib/permissions';
import { NotAuthorized } from '../pages/NotAuthorized';

export function RoleGuard({ path, children }: { path: string; children: ReactNode }) {
  const employee = useAuthStore((s) => s.employee);
  if (!canAccess(employee, path)) return <NotAuthorized />;
  return <>{children}</>;
}
