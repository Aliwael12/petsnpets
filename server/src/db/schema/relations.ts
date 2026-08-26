import { relations } from 'drizzle-orm';
import { employees } from './employees';
import { clients, clientPhones } from './clients';
import { pets, petPhones } from './pets';
import { petLogs } from './pet-logs';
import { products } from './catalog';
import { suppliers } from './suppliers';
import { supplierOrders } from './supplier-orders';
import { stockMovements } from './stock-movements';
import { transactions, transactionItems } from './transactions';
import { refunds, refundItems } from './refunds';
import { discounts } from './discounts';
import { appointments } from './appointments';

export const employeesRelations = relations(employees, ({ many }) => ({
  petLogsPerformed: many(petLogs),
  transactionsSold: many(transactions),
  refundsProcessed: many(refunds),
  discountsCreated: many(discounts),
  supplierOrdersLogged: many(supplierOrders),
  stockMovements: many(stockMovements),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  phones: many(clientPhones),
  pets: many(pets),
  transactions: many(transactions),
  discounts: many(discounts),
}));

export const clientPhonesRelations = relations(clientPhones, ({ one }) => ({
  client: one(clients, { fields: [clientPhones.clientId], references: [clients.id] }),
}));

export const petsRelations = relations(pets, ({ one, many }) => ({
  client: one(clients, { fields: [pets.clientId], references: [clients.id] }),
  phones: many(petPhones),
  logs: many(petLogs),
}));

export const petPhonesRelations = relations(petPhones, ({ one }) => ({
  pet: one(pets, { fields: [petPhones.petId], references: [pets.id] }),
}));

export const petLogsRelations = relations(petLogs, ({ one }) => ({
  pet: one(pets, { fields: [petLogs.petId], references: [pets.id] }),
  performedByEmployee: one(employees, {
    fields: [petLogs.performedBy],
    references: [employees.id],
  }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  stockMovements: many(stockMovements),
  supplierOrders: many(supplierOrders),
  transactionItems: many(transactionItems),
  refundItems: many(refundItems),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  orders: many(supplierOrders),
}));

export const supplierOrdersRelations = relations(supplierOrders, ({ one }) => ({
  supplier: one(suppliers, { fields: [supplierOrders.supplierId], references: [suppliers.id] }),
  product: one(products, { fields: [supplierOrders.productId], references: [products.id] }),
  loggedByEmployee: one(employees, {
    fields: [supplierOrders.loggedBy],
    references: [employees.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  actor: one(employees, { fields: [stockMovements.actorId], references: [employees.id] }),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  items: many(transactionItems),
  refunds: many(refunds),
  client: one(clients, { fields: [transactions.clientId], references: [clients.id] }),
  soldByEmployee: one(employees, { fields: [transactions.soldBy], references: [employees.id] }),
  discount: one(discounts, { fields: [transactions.discountId], references: [discounts.id] }),
}));

export const transactionItemsRelations = relations(transactionItems, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionItems.transactionId],
    references: [transactions.id],
  }),
  product: one(products, { fields: [transactionItems.productId], references: [products.id] }),
}));

export const refundsRelations = relations(refunds, ({ one, many }) => ({
  transaction: one(transactions, {
    fields: [refunds.transactionId],
    references: [transactions.id],
  }),
  items: many(refundItems),
  refundedByEmployee: one(employees, {
    fields: [refunds.refundedBy],
    references: [employees.id],
  }),
}));

export const refundItemsRelations = relations(refundItems, ({ one }) => ({
  refund: one(refunds, { fields: [refundItems.refundId], references: [refunds.id] }),
  product: one(products, { fields: [refundItems.productId], references: [products.id] }),
}));

export const discountsRelations = relations(discounts, ({ one }) => ({
  client: one(clients, { fields: [discounts.clientId], references: [clients.id] }),
  createdByEmployee: one(employees, {
    fields: [discounts.createdBy],
    references: [employees.id],
  }),
  usedInTransaction: one(transactions, {
    fields: [discounts.usedInTransactionId],
    references: [transactions.id],
  }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  service: one(products, { fields: [appointments.serviceId], references: [products.id] }),
  client: one(clients, { fields: [appointments.clientId], references: [clients.id] }),
  handledByEmployee: one(employees, {
    fields: [appointments.handledBy],
    references: [employees.id],
  }),
}));
