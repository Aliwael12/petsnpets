// Mirrors the backend's Drizzle schema / DTO shapes (server/src/db/schema). Money fields are
// integer piastres, matching the database exactly — see formatCurrency in components/ui.tsx
// for the one place that divides by 100 for display.

/** Ordered most- to least-privileged. Admin is the clinic owner and the only role that can
 *  grant anything; every other role starts with nothing and is given capabilities one at a
 *  time. Mirrors server/src/db/schema/enums.ts. */
export type Role = 'admin' | 'doctor' | 'nurse' | 'cashier';

/** Server-ENFORCED capabilities, mirroring server/src/employees/permissions.ts. Distinct
 *  from `enabledFeatures`, which only decides which nav tabs are drawn. */
export const ALL_PERMISSIONS = [
  'products:write',
  'categories:manage',
  'employees:manage',
  'analytics:all',
  'financials:read',
] as const;
export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, { label: string; detail: string }> = {
  'products:write': { label: 'Add & edit products', detail: 'Otherwise the catalog is read-only' },
  'categories:manage': { label: 'Manage categories', detail: 'Add, rename or remove product categories' },
  'employees:manage': { label: 'Manage employees', detail: 'Can also grant these same permissions to others' },
  'analytics:all': { label: 'Clinic-wide analytics', detail: 'Otherwise they only see their own sales' },
  'financials:read': { label: 'Money & expenses', detail: 'Income, expenses, net and the salary ledger' },
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  cashier: 'Cashier',
};

export interface Employee {
  id: string;
  name: string;
  role: Role;
  active?: boolean;
  enabledFeatures?: string[];
  permissions?: string[];
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

/** How money moved. `null` on a row means "not recorded" — written before payment
 * tracking existed — and is deliberately not folded into 'cash'. */
export type PaymentMethod = 'cash' | 'instapay' | 'card';
export type PaymentBucket = PaymentMethod | 'unrecorded';

export const PAYMENT_METHOD_LABELS: Record<PaymentBucket, string> = {
  cash: 'Cash',
  instapay: 'InstaPay',
  // The owner says "Visa"; the terminal also takes Mastercard and Meeza, so the stored
  // value is 'card' and only the label carries the shorthand.
  card: 'Visa / Card',
  unrecorded: 'Not recorded',
};

export interface SupplierOrder {
  id: string;
  supplierId: string;
  productId: string;
  quantity: number;
  costTotal: number; // piastres
  loggedBy: string;
  receivedAt: string;
  expiryDate?: string | null;
  paymentMethod?: PaymentMethod | null;
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
  paymentMethod?: PaymentMethod | null;
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
  paymentMethod?: PaymentMethod | null;
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

/** Both bounds inclusive, YYYY-MM-DD, read as Cairo calendar days. null = open-ended. */
export interface DayRange {
  from: string | null;
  to: string | null;
}

export interface RevenueTimeseriesPoint {
  /** First Cairo day in the bucket. */
  date: string;
  /** Last Cairo day in the bucket — equal to `date` for daily buckets, later for the
   *  weekly and monthly buckets a long range collapses into. */
  endDate: string;
  total: number; // gross sales, piastres
  refunds: number;
  stock: number; // supplier shipments
  operating: number; // running costs
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
  from: string | null;
  to: string | null;
  /** Present only when the window is exactly a calendar month. */
  year?: number;
  month?: number;
  stats: {
    sales: { count: number; revenue: number };
    refunds: { count: number; amount: number };
    petLogs: { count: number };
    supplierOrders: { count: number; cost: number };
    discounts: { count: number };
  };
  activity: ActivityEntry[];
}

export const EXPENSE_CATEGORIES = [
  'rent',
  'salaries',
  'utilities',
  'maintenance',
  'clinic-supplies',
  'marketing',
  'transport',
  'government-fees',
  'owner-drawings',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  salaries: 'Salaries',
  utilities: 'Utilities',
  maintenance: 'Maintenance & repairs',
  'clinic-supplies': 'Clinic supplies',
  marketing: 'Marketing',
  transport: 'Transport',
  'government-fees': 'Government fees',
  'owner-drawings': 'Owner drawings',
  other: 'Other',
};

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number; // piastres
  paymentMethod: PaymentMethod;
  payee?: string | null;
  /** YYYY-MM-DD — a Cairo calendar day off the receipt, not an instant. */
  paidOn: string;
  note?: string | null;
  recordedBy: string;
  createdAt: string;
  voidedAt?: string | null;
  voidReason?: string | null;
  recordedByEmployee?: { id: string; name: string };
  voidedByEmployee?: { id: string; name: string };
}

export type MethodBreakdown = Record<PaymentBucket, number>;

export interface FinancialWindow {
  year?: number;
  month?: number;
  from?: string | null;
  to?: string | null;
  income: { gross: number; refunds: number; net: number; byMethod: MethodBreakdown };
  expenses: { stock: number; operating: number; total: number; byMethod: MethodBreakdown };
  net: number;
}

export interface FinancialSummary {
  /** The window the caller asked for. */
  range: FinancialWindow;
  /** A whole calendar month. */
  month: FinancialWindow;
  /** Never range-filtered. */
  allTime: FinancialWindow;
}
