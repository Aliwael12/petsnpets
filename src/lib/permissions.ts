import type { Role } from '../types';

export interface NavItem {
  path: string;
  label: string;
  /** What a newly created employee of each role starts with — see
   * server/src/employees/features.ts, the source of truth this mirrors. A doctor can
   * customize any individual employee's actual access from the Employees tab. */
  defaultRoles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', defaultRoles: ['doctor', 'nurse', 'cashier'] },
  { path: '/products', label: 'Products', defaultRoles: ['doctor', 'nurse', 'cashier'] },
  { path: '/pos', label: 'POS', defaultRoles: ['doctor', 'nurse', 'cashier'] },
  { path: '/transactions', label: 'Transactions', defaultRoles: ['doctor', 'nurse', 'cashier'] },
  { path: '/clients', label: 'Clients', defaultRoles: ['doctor', 'nurse'] },
  { path: '/pet-logs', label: 'Pet Logs', defaultRoles: ['doctor', 'nurse'] },
  { path: '/calendar', label: 'Calendar', defaultRoles: ['doctor', 'nurse'] },
  { path: '/price-checker', label: 'Price Checker', defaultRoles: ['doctor', 'nurse', 'cashier'] },
  { path: '/employees', label: 'Employees', defaultRoles: ['doctor'] },
  { path: '/analytics', label: 'Analytics', defaultRoles: ['doctor'] },
  { path: '/money', label: 'Money In / Out', defaultRoles: ['doctor'] },
  { path: '/settings', label: 'Settings', defaultRoles: ['doctor', 'nurse', 'cashier'] },
];

/** Tabs a doctor can individually enable/disable per employee from the Employees tab.
 * Dashboard is excluded — it's the guaranteed landing page, always visible. */
export const TOGGLEABLE_FEATURES = NAV_ITEMS.filter((item) => item.path !== '/dashboard');

/** Nav visibility is per-employee (employee.enabledFeatures), not derived from role — a
 * doctor can grant or revoke any tab for any individual employee from the Employees tab.
 * `enabledFeatures` is optional here because a session persisted in localStorage from
 * before this field existed will rehydrate without it — treat that the same as "no access"
 * rather than crashing the whole app on a null dereference. */
export function canAccess(employee: { enabledFeatures?: string[] } | null | undefined, path: string): boolean {
  if (!employee) return false;
  if (path === '/dashboard') return true;
  return (employee.enabledFeatures ?? []).includes(path);
}

export function canEditProducts(role: Role | undefined): boolean {
  return role === 'doctor';
}

export function canManageDiscounts(role: Role | undefined): boolean {
  return role === 'doctor';
}
