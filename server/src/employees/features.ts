import type { Role } from '../db/schema';

/**
 * Nav tabs an admin can freely show or hide per employee.
 *
 * Dashboard is deliberately excluded — it's the guaranteed landing page and is never
 * individually disabled, so an employee with every other tab turned off still has somewhere
 * to go.
 *
 * /employees, /money and /expenses are excluded too, for a different reason: they are
 * permission-backed (see PERMISSION_TABS in permissions.ts) and appear exactly when the
 * matching permission is granted. Giving them a second, independent toggle here would let an
 * admin grant someone the books and still leave the tab invisible, with nothing on screen to
 * explain why.
 */
export const ALL_FEATURES = [
  '/products',
  '/pos',
  '/transactions',
  '/clients',
  '/pet-logs',
  '/calendar',
  '/price-checker',
  '/analytics',
  '/settings',
] as const;

export type Feature = (typeof ALL_FEATURES)[number];

/**
 * What a newly created employee of each role starts with.
 *
 * Note what these DON'T carry: no role below admin starts with any permission at all
 * (DEFAULT_PERMISSIONS_BY_ROLE), so a doctor sees the Analytics tab but only their own
 * sales in it, and the Products tab read-only, until an admin says otherwise.
 */
export const DEFAULT_FEATURES_BY_ROLE: Record<Role, Feature[]> = {
  admin: [...ALL_FEATURES],
  doctor: [...ALL_FEATURES],
  // Settings is available to everyone: its always-available half is "change my own PIN",
  // which every operator needs. The category-management half inside it is separately gated
  // by the categories:manage permission regardless of this flag.
  nurse: ['/products', '/pos', '/transactions', '/clients', '/pet-logs', '/calendar', '/price-checker', '/settings'],
  cashier: ['/products', '/pos', '/transactions', '/price-checker', '/settings'],
};
