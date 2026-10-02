/**
 * One search box, three kinds of query — the same rules the server uses for the Clients tab:
 *   "#123"          → that client ID only
 *   "0100 123 4567" → digits only (spaces, dashes, + and brackets allowed): a client ID or a
 *                     phone, compared digits-only so it matches however the number was saved
 *   anything else   → a name
 */
export interface PersonFields {
  names: (string | null | undefined)[];
  phones: (string | null | undefined)[];
  legacyId?: number | null;
}

export function matchesPersonQuery(query: string, fields: PersonFields): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  const idOnly = /^#\s*\d+$/.test(q);
  const phoneLike = !idOnly && /^[\d\s+()-]+$/.test(q) && digits.length > 0;

  if (idOnly || phoneLike) {
    if (fields.legacyId != null && fields.legacyId === Number(digits)) return true;
    if (idOnly) return false;
    return fields.phones.some((p) => !!p && p.replace(/\D/g, '').includes(digits));
  }
  return fields.names.some((n) => !!n && n.toLowerCase().includes(q));
}

/** True when the query names exactly this client ID — used to list that client first. */
export function isExactIdQuery(query: string, legacyId: number | null | undefined): boolean {
  const q = query.trim();
  return legacyId != null && /^#?\s*\d+$/.test(q) && Number(q.replace(/\D/g, '')) === legacyId;
}
