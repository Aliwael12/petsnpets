export type Role = 'doctor' | 'nurse' | 'cashier';

export interface Employee {
  id: string;
  name: string;
  role: Role;
  active: boolean;
}

export type ProductCategory = 'food' | 'accessories' | 'medicine' | 'grooming';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  sku: string;
  unitPrice: number;
  stockQuantity: number;
  lowStockThreshold: number;
}

export interface TransactionItem {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Transaction {
  id: string;
  soldBy: string;
  customerName: string;
  items: TransactionItem[];
  total: number;
  createdAt: string;
}

export type Species = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed: string;
  ownerName: string;
  ownerContact: string;
}

export type LogType = 'vaccination' | 'shower' | 'other';

export interface PetLog {
  id: string;
  petId: string;
  logType: LogType;
  description: string;
  performedBy: string;
  performedAt: string;
  nextDueDate?: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactInfo: string;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  productId: string;
  quantity: number;
  costTotal: number;
  loggedBy: string;
  receivedAt: string;
}
