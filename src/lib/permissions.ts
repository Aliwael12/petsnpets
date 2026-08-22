import type { Role } from '../types';

export interface NavItem {
  path: string;
  label: string;
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', roles: ['doctor', 'nurse', 'cashier'] },
  { path: '/products', label: 'Products', roles: ['doctor', 'nurse', 'cashier'] },
  { path: '/pos', label: 'POS', roles: ['doctor', 'nurse', 'cashier'] },
  { path: '/transactions', label: 'Transactions', roles: ['doctor', 'nurse', 'cashier'] },
  { path: '/pet-logs', label: 'Pet Logs', roles: ['doctor', 'nurse'] },
  { path: '/employees', label: 'Employees', roles: ['doctor'] },
  { path: '/analytics', label: 'Analytics', roles: ['doctor'] },
  { path: '/money', label: 'Money In / Out', roles: ['doctor'] },
];

export function canAccess(role: Role | undefined, path: string): boolean {
  if (!role) return false;
  const item = NAV_ITEMS.find((n) => n.path === path);
  if (!item) return true;
  return item.roles.includes(role);
}

export function canEditProducts(role: Role | undefined): boolean {
  return role === 'doctor';
}
