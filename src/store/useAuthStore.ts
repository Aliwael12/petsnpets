import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Role } from '../types';

export interface SessionEmployee {
  id: string;
  name: string;
  role: Role;
  enabledFeatures: string[];
}

interface AuthState {
  token: string | null;
  expiresAt: string | null;
  employee: SessionEmployee | null;
  setSession: (session: { token: string; expiresAt: string; employee: SessionEmployee }) => void;
  clearSession: () => void;
  isExpired: () => boolean;
}

/** The operator's PIN session — persisted across page reloads (a register staying "signed
 * in" between refreshes is normal POS behavior), but never longer than the token's own
 * expiry, which the backend enforces independently on every request regardless of what's
 * cached here. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      expiresAt: null,
      employee: null,
      setSession: ({ token, expiresAt, employee }) => set({ token, expiresAt, employee }),
      clearSession: () => set({ token: null, expiresAt: null, employee: null }),
      isExpired: () => {
        const { expiresAt } = get();
        return !expiresAt || new Date(expiresAt).getTime() <= Date.now();
      },
    }),
    { name: 'pets-and-pets-session' },
  ),
);
