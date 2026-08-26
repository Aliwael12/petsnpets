/** Mirrors the frontend's src/lib/activity.ts ActivityEntry shape exactly, so
 * ActivityFeed.tsx can render this endpoint's response without modification. */
export type ActivityType = 'sale' | 'refund' | 'pet-log' | 'supplier-order' | 'discount';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  detail?: string;
  actorId: string;
  clientId?: string;
  petId?: string;
  amount?: number;
  at: string;
}
