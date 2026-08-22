import { create } from 'zustand';
import {
  employees as seedEmployees,
  products as seedProducts,
  transactions as seedTransactions,
  pets as seedPets,
  petLogs as seedPetLogs,
  suppliers as seedSuppliers,
  supplierOrders as seedSupplierOrders,
} from '../data/mockData';
import type {
  Employee,
  Pet,
  PetLog,
  Product,
  Role,
  Supplier,
  SupplierOrder,
  Transaction,
  TransactionItem,
} from '../types';

let idCounter = 1000;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

interface StoreState {
  currentUserId: string | null;
  employees: Employee[];
  products: Product[];
  transactions: Transaction[];
  pets: Pet[];
  petLogs: PetLog[];
  suppliers: Supplier[];
  supplierOrders: SupplierOrder[];

  currentUser: () => Employee | null;

  signIn: (employeeId: string) => void;
  signOut: () => void;

  addProduct: (product: Omit<Product, 'id'>) => void;
  updateProduct: (id: string, patch: Partial<Omit<Product, 'id'>>) => void;
  deleteProduct: (id: string) => void;

  completeSale: (customerName: string, items: TransactionItem[], soldBy: string) => Transaction;

  addEmployee: (name: string, role: Role) => void;
  toggleEmployeeActive: (id: string) => void;
  removeEmployee: (id: string) => void;

  addPet: (pet: Omit<Pet, 'id'>) => Pet;
  addPetLog: (log: Omit<PetLog, 'id'>) => void;

  addSupplier: (supplier: Omit<Supplier, 'id'>) => Supplier;
  addSupplierOrder: (order: Omit<SupplierOrder, 'id'>) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  currentUserId: null,
  employees: seedEmployees,
  products: seedProducts,
  transactions: seedTransactions,
  pets: seedPets,
  petLogs: seedPetLogs,
  suppliers: seedSuppliers,
  supplierOrders: seedSupplierOrders,

  currentUser: () => {
    const { currentUserId, employees } = get();
    return employees.find((e) => e.id === currentUserId) ?? null;
  },

  signIn: (employeeId) => set({ currentUserId: employeeId }),
  signOut: () => set({ currentUserId: null }),

  addProduct: (product) =>
    set((state) => ({
      products: [...state.products, { ...product, id: nextId('prod') }],
    })),

  updateProduct: (id, patch) =>
    set((state) => ({
      products: state.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  deleteProduct: (id) =>
    set((state) => ({
      products: state.products.filter((p) => p.id !== id),
    })),

  completeSale: (customerName, items, soldBy) => {
    const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const transaction: Transaction = {
      id: nextId('txn'),
      soldBy,
      customerName,
      items,
      total,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({
      transactions: [transaction, ...state.transactions],
      products: state.products.map((p) => {
        const sold = items.find((it) => it.productId === p.id);
        return sold ? { ...p, stockQuantity: Math.max(0, p.stockQuantity - sold.quantity) } : p;
      }),
    }));
    return transaction;
  },

  addEmployee: (name, role) =>
    set((state) => ({
      employees: [...state.employees, { id: nextId('emp'), name, role, active: true }],
    })),

  toggleEmployeeActive: (id) =>
    set((state) => ({
      employees: state.employees.map((e) => (e.id === id ? { ...e, active: !e.active } : e)),
    })),

  removeEmployee: (id) =>
    set((state) => ({
      employees: state.employees.filter((e) => e.id !== id),
    })),

  addPet: (pet) => {
    const newPet: Pet = { ...pet, id: nextId('pet') };
    set((state) => ({ pets: [...state.pets, newPet] }));
    return newPet;
  },

  addPetLog: (log) =>
    set((state) => ({
      petLogs: [{ ...log, id: nextId('log') }, ...state.petLogs],
    })),

  addSupplier: (supplier) => {
    const newSupplier: Supplier = { ...supplier, id: nextId('sup') };
    set((state) => ({ suppliers: [...state.suppliers, newSupplier] }));
    return newSupplier;
  },

  addSupplierOrder: (order) =>
    set((state) => ({
      supplierOrders: [{ ...order, id: nextId('so') }, ...state.supplierOrders],
      products: state.products.map((p) =>
        p.id === order.productId ? { ...p, stockQuantity: p.stockQuantity + order.quantity } : p,
      ),
    })),
}));
