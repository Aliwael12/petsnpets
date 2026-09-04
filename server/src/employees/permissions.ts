import type { Role } from '../db/schema';

/**
 * Capabilities an admin can hand to an individual employee.
 *
 * These are deliberately NOT the same thing as `enabledFeatures` (see features.ts).
 * enabledFeatures only decides which nav tabs a person sees — it is cosmetic, and the API
 * has never consulted it. A permission is the opposite: the server enforces it, and it is
 * the only way anyone other than an admin gets to do these things.
 *
 * An admin implicitly holds every permission, always. Granting a permission never widens
 * what an admin can do, and revoking one can never lock the clinic out of its own admin
 * account — see hasPermission().
 */
export const ALL_PERMISSIONS = [
  /** Create, edit and deactivate products. Everyone else sees the catalog read-only. */
  'products:write',
  /** Add, rename, deactivate and delete product categories from Settings. */
  'categories:manage',
  /** Add staff, change roles, set access, deactivate accounts. Grant with care: whoever
   *  holds this can grant themselves everything else on this list. */
  'employees:manage',
  /** See clinic-wide analytics instead of only the sales you personally rang up. */
  'analytics:all',
  /** The money surfaces: the dashboard's income/expenses/net cards, Money in / out, and
   *  the Expenses ledger (which holds salaries). */
  'financials:read',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/** Human labels for the grant checkboxes in the Employees modal, kept beside the list they
 *  describe so a new permission can't ship without one. */
export const PERMISSION_LABELS: Record<Permission, { label: string; detail: string }> = {
  'products:write': { label: 'Add & edit products', detail: 'Otherwise the catalog is read-only' },
  'categories:manage': { label: 'Manage categories', detail: 'Add, rename or remove product categories' },
  'employees:manage': { label: 'Manage employees', detail: 'Can also grant these same permissions to others' },
  'analytics:all': { label: 'Clinic-wide analytics', detail: 'Otherwise they only see their own sales' },
  'financials:read': { label: 'Money & expenses', detail: 'Income, expenses, net and the salary ledger' },
};

/**
 * Nav tabs that are NOT a free toggle — they exist only for people holding the matching
 * permission. Keeping them out of the toggle list is what stops the "granted but the tab is
 * still hidden" trap that two independent switches would otherwise create.
 */
export const PERMISSION_TABS: Record<string, Permission> = {
  '/employees': 'employees:manage',
  '/money': 'financials:read',
  '/expenses': 'financials:read',
};

/** What each role starts with. Only an admin is born with anything — everything else is a
 *  deliberate grant, so a new hire can never quietly arrive holding the keys. */
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  doctor: [],
  nurse: [],
  cashier: [],
};

/**
 * The single authority on "may this person do X".
 *
 * Admin short-circuits to true rather than being seeded with a stored list, so an admin
 * cannot be accidentally stripped of their own access by a bad grant edit, and adding a new
 * permission to ALL_PERMISSIONS never requires backfilling existing admin rows.
 */
export function hasPermission(
  actor: { role: Role; permissions?: readonly string[] } | null | undefined,
  permission: Permission,
): boolean {
  if (!actor) return false;
  if (actor.role === 'admin') return true;
  return (actor.permissions ?? []).includes(permission);
}
