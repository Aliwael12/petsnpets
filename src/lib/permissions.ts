import type { Permission, Role } from '../types';

export interface NavItem {
  path: string;
  label: string;
  /** What a newly created employee of each role starts with — see
   * server/src/employees/features.ts, the source of truth this mirrors. An admin can
   * customize any individual employee's actual access from the Employees tab. */
  defaultRoles: Role[];
  /** When set, the tab is not a free toggle: it appears exactly when this permission is
   *  granted, and never otherwise. See PERMISSION_TABS on the server. */
  requires?: Permission;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', defaultRoles: ['admin', 'doctor', 'nurse', 'cashier'] },
  { path: '/products', label: 'Products', defaultRoles: ['admin', 'doctor', 'nurse', 'cashier'] },
  { path: '/pos', label: 'POS', defaultRoles: ['admin', 'doctor', 'nurse', 'cashier'] },
  { path: '/transactions', label: 'Transactions', defaultRoles: ['admin', 'doctor', 'nurse', 'cashier'] },
  { path: '/clients', label: 'Clients', defaultRoles: ['admin', 'doctor', 'nurse'] },
  { path: '/pet-logs', label: 'Pet Logs', defaultRoles: ['admin', 'doctor', 'nurse'] },
  { path: '/calendar', label: 'Calendar', defaultRoles: ['admin', 'doctor', 'nurse'] },
  { path: '/price-checker', label: 'Price Checker', defaultRoles: ['admin', 'doctor', 'nurse', 'cashier'] },
  { path: '/employees', label: 'Employees', defaultRoles: ['admin'], requires: 'employees:manage' },
  { path: '/analytics', label: 'Analytics', defaultRoles: ['admin', 'doctor'] },
  { path: '/money', label: 'Money In / Out', defaultRoles: ['admin'], requires: 'financials:read' },
  { path: '/expenses', label: 'Expenses', defaultRoles: ['admin'], requires: 'financials:read' },
  { path: '/settings', label: 'Settings', defaultRoles: ['admin', 'doctor', 'nurse', 'cashier'] },
];

/** Tabs a doctor can individually enable/disable per employee from the Employees tab.
 * Dashboard is excluded — it's the guaranteed landing page, always visible. So are the
 * permission-backed tabs: they follow their grant, and a second switch for them could only
 * ever contradict it. */
export const TOGGLEABLE_FEATURES = NAV_ITEMS.filter((item) => item.path !== '/dashboard' && !item.requires);

/** Paths that follow a grant rather than a toggle, keyed by the permission they need. */
const PERMISSION_TABS = new Map<string, Permission>(
  NAV_ITEMS.filter((item) => item.requires).map((item) => [item.path, item.requires!]),
);

/**
 * The single authority on "may this person do X" — the client-side mirror of
 * server/src/employees/permissions.ts hasPermission().
 *
 * Admin short-circuits to true rather than storing a list, so an admin can never be
 * accidentally stripped of their own access, and a permission added later needs no backfill.
 *
 * This only decides what the UI *offers*. Every one of these is independently enforced by
 * the API, so a stale session or a hand-edited store changes what is drawn, never what is
 * allowed.
 */
export function hasPermission(
  employee: { role?: Role; permissions?: string[] } | null | undefined,
  permission: Permission,
): boolean {
  if (!employee?.role) return false;
  if (employee.role === 'admin') return true;
  return (employee.permissions ?? []).includes(permission);
}

/**
 * Nav visibility. Permission-backed tabs follow their grant; everything else follows the
 * per-employee toggle list.
 *
 * `enabledFeatures` is optional because a session persisted in localStorage from before the
 * field existed rehydrates without it — treat that as "no access" rather than crashing the
 * whole app on a null dereference.
 */
export function canAccess(
  employee: { role?: Role; enabledFeatures?: string[]; permissions?: string[] } | null | undefined,
  path: string,
): boolean {
  if (!employee) return false;
  if (path === '/dashboard') return true;

  const required = PERMISSION_TABS.get(path);
  if (required) return hasPermission(employee, required);

  return (employee.enabledFeatures ?? []).includes(path);
}

export function isAdmin(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canEditProducts(employee: { role?: Role; permissions?: string[] } | null | undefined): boolean {
  return hasPermission(employee, 'products:write');
}

export function canManageCategories(employee: { role?: Role; permissions?: string[] } | null | undefined): boolean {
  return hasPermission(employee, 'categories:manage');
}

export function canManageEmployees(employee: { role?: Role; permissions?: string[] } | null | undefined): boolean {
  return hasPermission(employee, 'employees:manage');
}

/** Income, expenses and net — the salary ledger included. */
export function canViewFinancials(employee: { role?: Role; permissions?: string[] } | null | undefined): boolean {
  return hasPermission(employee, 'financials:read');
}

/** Clinic-wide analytics. Without it the Analytics page shows only your own sales. */
export function canViewAllAnalytics(employee: { role?: Role; permissions?: string[] } | null | undefined): boolean {
  return hasPermission(employee, 'analytics:all');
}

/** Creating client discounts and receiving supplier stock stay with the owner permanently —
 *  both set money the whole catalog is priced against. */
export function canManageDiscounts(role: Role | undefined): boolean {
  return role === 'admin';
}

export function canReceiveStock(role: Role | undefined): boolean {
  return role === 'admin';
}
