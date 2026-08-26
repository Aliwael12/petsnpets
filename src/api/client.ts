import { useAuthStore } from '../store/useAuthStore';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/v1';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Attaches a fresh Idempotency-Key header — use for every money-mutating POST
   * (checkout, refund) so a double-tap or network retry can't double-apply it. */
  idempotent?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token } = useAuthStore.getState();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.idempotent) headers.set('Idempotency-Key', crypto.randomUUID());

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const raw = await res.text();
  const parsed = raw ? JSON.parse(raw) : undefined;

  if (!res.ok) {
    const err = parsed?.error;
    if (res.status === 401) {
      // The operator session is gone (expired, revoked, or the account was deactivated
      // mid-shift) — drop it locally so the app falls back to the sign-in screen instead
      // of quietly retrying with a token the server will never accept.
      useAuthStore.getState().clearSession();
    }
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN_ERROR', err?.message ?? 'Something went wrong.', err?.details);
  }

  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'body' | 'method'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
