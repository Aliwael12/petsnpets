import type { Role } from '../db/schema';

/** Every toggle-able tab, keyed by its frontend route path. Dashboard is deliberately
 * excluded — it's the guaranteed landing page and is never individually disabled, so an
 * employee with every other feature turned off still has somewhere to go. */
export const ALL_FEATURES = [
  '/products',
  '/pos',
  '/transactions',
  '/clients',
  '/pet-logs',
  '/calendar',
  '/price-checker',
  '/employees',
  '/analytics',
  '/money',
  '/settings',
] as const;

export type Feature = (typeof ALL_FEATURES)[number];

/** What a newly created employee of each role starts with — mirrors the app's original
 * static role-based nav mapping. A doctor can customize any individual employee's access
 * from there via PATCH /employees/:id/features. */
export const DEFAULT_FEATURES_BY_ROLE: Record<Role, Feature[]> = {
  doctor: [...ALL_FEATURES],
  // Settings is available to everyone by default: its always-available half is
  // "change my own PIN", which every operator needs. The category-management half inside
  // it is separately gated to doctors by the API regardless of this flag.
  nurse: ['/products', '/pos', '/transactions', '/clients', '/pet-logs', '/calendar', '/price-checker', '/settings'],
  cashier: ['/products', '/pos', '/transactions', '/price-checker', '/settings'],
};
