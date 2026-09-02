// Mirrors the backend's Drizzle schema / DTO shapes (server/src/db/schema). Money fields are
// integer piastres, matching the database exactly — see formatCurrency in components/ui.tsx
// for the one place that divides by 100 for display.

export type Role = 'doctor' | 'nurse' | 'cashier';

export interface Employee {
  id: string;
  name: string;
  role: Role;
  active?: boolean;
  enabledFeatures?: string[];
  createdAt?: string;
}

/** Categories are managed rows now (Settings → Categories), not a fixed union — this is
 * the category's `name`, the value stored on the product. */
export type ProductCategory = string;
export type ProductKind = 'good' | 'service';

export interface Category {
  id: string;
  name: string;
  label: string;
  kind: ProductKind;
  active: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  /** How many products reference this category — the API sends it so the UI can explain
   * why a category can't be deleted without a second request. */
  productCount: number;
}

export interface Product {
  id: string;
  name: string;
  brand?: string | null;
  category: ProductCategory;
  kind: ProductKind;
  sku: string;
  unitPrice: number; // piastres
  stockQuantity: number;
  lowStockThreshold: number;
  active: boolean;
  createdAt: string;
}

export interface ClientPhone {
  id: string;
  clientId: string;
  phone: string;
  label: 'mobile' | 'home' | 'work' | 'other';
  isPrimary: boolean;
}

export interface Client {
  id: string;
  name: string;
  createdAt: string;
  phones: ClientPhone[];
  pets?: Pet[];
}

export type Species = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';

export interface PetPhone {
  id: string;
  petId: string;
  phone: string;
}

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed: string;
  clientId: string;
  createdAt: string;
  client?: Client;
  phones?: PetPhone[];
}

export type LogType = 'vaccination' | 'shower' | 'other';

export interface PetLog {
  id: string;
  petId: string;
  logType: LogType;
  description: string;
  performedBy: string;
  performedAt: string;
  nextDueDate?: string | null;
  performedByEmployee?: { id: string; name: string };
  pet?: Pet & { client?: Client };
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Appointment {
  id: string;
  ownerName: string;
  phone: string;
  email?: string | null;
  petName: string;
  species: Species;
  serviceId?: string | null;
  serviceName: string;
  requestedAt: string;
  notes?: string | null;
  status: AppointmentStatus;
  clientId?: string | null;
  handledBy?: string | null;
  createdAt: string;
  client?: { id: string; name: string } | null;
  handledByEmployee?: { id: string; name: string } | null;
}

export interface BookableService {
  id: string;
  name: string;
  unitPrice: number; // piastres
}

export interface OpeningHours {
  timezone: string;
  slotMinutes: number;
  /** Keyed by weekday index, 0 = Sunday → [openHour, closeHour). */
  hoursByWeekday: Record<string, [number, number]>;
}

export interface DayAvailability {
  date: string;
  slots: { at: string; available: boolean }[];
}

export interface Supplier {
  id: string;
  name: string;
  contactInfo: string;
  createdAt: string;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  productId: string;
  quantity: number;
  costTotal: number; // piastres
  loggedBy: string;
  receivedAt: string;
  expiryDate?: string | null;
  supplier?: { id: string; name: string };
  product?: { id: string; name: string; brand?: string | null; category?: string };
  loggedByEmployee?: { id: string; name: string };
}

export type DiscountKind = 'percent' | 'fixed';

export interface Discount {
  id: string;
  clientId: string;
  kind: DiscountKind;
  value: number; // percent (0-100) or piastres, depending on kind
  note?: string | null;
  createdBy: string;
  createdAt: string;
  usedInTransactionId?: string | null;
  client?: { id: string; name: string };
  createdByEmployee?: { id: string; name: string };
}

export interface TransactionItem {
  id: string;
  transactionId: string;
  productId: string;
  quantity: number;
  unitPrice: number; // piastres, snapshotted at sale time
  product?: { id: string; name: string };
}

export interface Transaction {
  id: string;
  invoiceYear: number;
  invoiceNo: number;
  soldBy: string;
  clientId?: string | null;
  customerName: string;
  subtotal: number; // piastres
  discountId?: string | null;
  discountAmount?: number | null; // piastres
  total: number; // piastres
  createdAt: string;
  items: TransactionItem[];
  soldByEmployee?: { id: string; name: string };
  client?: { id: string; name: string };
}

export interface RefundItem {
  id: string;
  refundId: string;
  productId: string;
  quantity: number;
  unitPrice: number; // piastres
  product?: { id: string; name: string };
}

export interface Refund {
  id: string;
  transactionId: string;
  total: number; // piastres
  refundedBy: string;
  reason?: string | null;
  createdAt: string;
  items: RefundItem[];
  refundedByEmployee?: { id: string; name: string };
  transaction?: { id: string; customerName: string; invoiceYear: number; invoiceNo: number; clientId?: string | null };
}

export type ActivityType = 'sale' | 'refund' | 'pet-log' | 'supplier-order' | 'discount';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  detail?: string;
  actorId: string;
  clientId?: string;
  petId?: string;
  amount?: number; // piastres
  at: string;
}

export interface RevenueTimeseriesPoint {
  date: string;
  total: number; // piastres
}

export interface BestSeller {
  id: string;
  name: string;
  quantity: number;
  revenue: number; // piastres
}

export interface RevenueByEmployee {
  id: string;
  name: string;
  revenue: number; // piastres
}

export interface RevenueByCategory {
  category: ProductCategory;
  value: number; // piastres
}

export interface RevenueSplit {
  total: number; // piastres
  items: { id: string; name: string; revenue: number }[];
}

export interface EmployeeSummary {
  year: number;
  month: number;
  stats: {
    sales: { count: number; revenue: number };
    refunds: { count: number; amount: number };
    petLogs: { count: number };
    supplierOrders: { count: number; cost: number };
    discounts: { count: number };
  };
  activity: ActivityEntry[];
}
