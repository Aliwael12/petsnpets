import type { ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { canAccess } from '../lib/permissions';
import { NotAuthorized } from '../pages/NotAuthorized';

export function RoleGuard({ path, children }: { path: string; children: ReactNode }) {
  const role = useStore((s) => s.currentUser()?.role);
  if (!canAccess(role, path)) return <NotAuthorized />;
  return <>{children}</>;
}
