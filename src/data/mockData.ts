import type {
  Employee,
  Pet,
  PetLog,
  Product,
  Supplier,
  SupplierOrder,
  Transaction,
} from '../types';

export const employees: Employee[] = [
  { id: 'emp-1', name: 'Dr. Amira Fathy', role: 'doctor', active: true },
  { id: 'emp-2', name: 'Dr. Karim Nabil', role: 'doctor', active: true },
  { id: 'emp-3', name: 'Nour El-Sayed', role: 'nurse', active: true },
  { id: 'emp-4', name: 'Sara Adel', role: 'nurse', active: true },
  { id: 'emp-5', name: 'Mostafa Hassan', role: 'cashier', active: true },
  { id: 'emp-6', name: 'Yara Ibrahim', role: 'cashier', active: true },
  { id: 'emp-7', name: 'Omar Reda', role: 'cashier', active: false },
];

export const products: Product[] = [
  { id: 'prod-1', name: 'Royal Canin Adult Cat Food 2kg', category: 'food', sku: 'RC-CAT-2KG', unitPrice: 850, stockQuantity: 24, lowStockThreshold: 5 },
  { id: 'prod-2', name: 'Royal Canin Puppy Food 3kg', category: 'food', sku: 'RC-PUP-3KG', unitPrice: 1100, stockQuantity: 3, lowStockThreshold: 5 },
  { id: 'prod-3', name: 'Pedigree Adult Dog Food 15kg', category: 'food', sku: 'PED-DOG-15KG', unitPrice: 2400, stockQuantity: 12, lowStockThreshold: 4 },
  { id: 'prod-4', name: 'Whiskas Kitten Pouch (12pk)', category: 'food', sku: 'WHK-KIT-12', unitPrice: 320, stockQuantity: 40, lowStockThreshold: 10 },
  { id: 'prod-5', name: 'Bird Seed Mix 1kg', category: 'food', sku: 'BRD-SEED-1KG', unitPrice: 150, stockQuantity: 18, lowStockThreshold: 5 },
  { id: 'prod-6', name: 'Rabbit Pellets 2kg', category: 'food', sku: 'RBT-PEL-2KG', unitPrice: 210, stockQuantity: 2, lowStockThreshold: 5 },
  { id: 'prod-7', name: 'Leather Dog Collar (M)', category: 'accessories', sku: 'ACC-COL-M', unitPrice: 280, stockQuantity: 15, lowStockThreshold: 4 },
  { id: 'prod-8', name: 'Cat Scratching Post', category: 'accessories', sku: 'ACC-SCR-01', unitPrice: 950, stockQuantity: 6, lowStockThreshold: 2 },
  { id: 'prod-9', name: 'Retractable Leash 5m', category: 'accessories', sku: 'ACC-LSH-5M', unitPrice: 340, stockQuantity: 20, lowStockThreshold: 5 },
  { id: 'prod-10', name: 'Pet Carrier Bag (S)', category: 'accessories', sku: 'ACC-CAR-S', unitPrice: 620, stockQuantity: 8, lowStockThreshold: 3 },
  { id: 'prod-11', name: 'Ceramic Food Bowl Set', category: 'accessories', sku: 'ACC-BWL-SET', unitPrice: 180, stockQuantity: 25, lowStockThreshold: 6 },
  { id: 'prod-12', name: 'Cat Litter Box + Scoop', category: 'accessories', sku: 'ACC-LIT-BOX', unitPrice: 410, stockQuantity: 1, lowStockThreshold: 3 },
  { id: 'prod-13', name: 'Rabies Vaccine (Vial)', category: 'medicine', sku: 'MED-RAB-01', unitPrice: 500, stockQuantity: 30, lowStockThreshold: 8 },
  { id: 'prod-14', name: 'Flea & Tick Treatment', category: 'medicine', sku: 'MED-FLEA-01', unitPrice: 380, stockQuantity: 22, lowStockThreshold: 6 },
  { id: 'prod-15', name: 'Deworming Tablets (pack)', category: 'medicine', sku: 'MED-WORM-01', unitPrice: 150, stockQuantity: 35, lowStockThreshold: 10 },
  { id: 'prod-16', name: 'Antiseptic Wound Spray', category: 'medicine', sku: 'MED-SPRAY-01', unitPrice: 220, stockQuantity: 4, lowStockThreshold: 5 },
  { id: 'prod-17', name: 'Pet Shampoo (Medicated)', category: 'grooming', sku: 'GRM-SHMP-01', unitPrice: 260, stockQuantity: 14, lowStockThreshold: 4 },
  { id: 'prod-18', name: 'Nail Clipper Kit', category: 'grooming', sku: 'GRM-CLIP-01', unitPrice: 190, stockQuantity: 10, lowStockThreshold: 3 },
  { id: 'prod-19', name: 'De-shedding Brush', category: 'grooming', sku: 'GRM-BRSH-01', unitPrice: 240, stockQuantity: 9, lowStockThreshold: 3 },
  { id: 'prod-20', name: 'Ear Cleaning Solution', category: 'grooming', sku: 'GRM-EAR-01', unitPrice: 170, stockQuantity: 16, lowStockThreshold: 5 },
];

export const pets: Pet[] = [
  { id: 'pet-1', name: 'Simba', species: 'cat', breed: 'Persian', ownerName: 'Hana Adel', ownerContact: '+20 100 111 2233' },
  { id: 'pet-2', name: 'Max', species: 'dog', breed: 'German Shepherd', ownerName: 'Tarek Fouad', ownerContact: '+20 101 222 3344' },
  { id: 'pet-3', name: 'Luna', species: 'cat', breed: 'Siamese', ownerName: 'Nadine Samir', ownerContact: '+20 102 333 4455' },
  { id: 'pet-4', name: 'Rocky', species: 'dog', breed: 'Labrador', ownerName: 'Youssef Kamal', ownerContact: '+20 106 444 5566' },
  { id: 'pet-5', name: 'Kiwi', species: 'bird', breed: 'Cockatiel', ownerName: 'Mona Zaki', ownerContact: '+20 111 555 6677' },
  { id: 'pet-6', name: 'Coco', species: 'rabbit', breed: 'Dutch Rabbit', ownerName: 'Ziad Hesham', ownerContact: '+20 112 666 7788' },
  { id: 'pet-7', name: 'Bella', species: 'dog', breed: 'Poodle', ownerName: 'Salma Ashraf', ownerContact: '+20 114 777 8899' },
  { id: 'pet-8', name: 'Oliver', species: 'cat', breed: 'British Shorthair', ownerName: 'Hana Adel', ownerContact: '+20 100 111 2233' },
];

export const suppliers: Supplier[] = [
  { id: 'sup-1', name: 'NileVet Distributors', contactInfo: 'sales@nilevet.example · +20 2 2555 1000' },
  { id: 'sup-2', name: 'PetCo Wholesale Egypt', contactInfo: 'orders@petco-eg.example · +20 2 2555 2000' },
  { id: 'sup-3', name: 'Al Rahma Pharma Supplies', contactInfo: 'contact@rahma-pharma.example · +20 2 2555 3000' },
];

// ---- Generated: 30 days of transactions ----
function daysAgoISO(days: number, hour = 10, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const customerNames = [
  'Hana Adel', 'Tarek Fouad', 'Nadine Samir', 'Youssef Kamal', 'Mona Zaki',
  'Ziad Hesham', 'Salma Ashraf', 'Ahmed Sami', 'Rania Ehab', 'Karim Ali',
  'Dina Farouk', 'Hossam Nagy',
];

const sellers = ['emp-5', 'emp-6', 'emp-3', 'emp-4', 'emp-1', 'emp-2'];

function seededTransactions(): Transaction[] {
  const list: Transaction[] = [];
  let counter = 1;
  const dayPattern = [2, 1, 3, 0, 2, 1, 2, 1, 0, 3, 2, 1, 1, 2, 0, 1, 3, 2, 1, 0, 2, 1, 1, 2, 0, 1, 2, 3, 1, 0];

  dayPattern.forEach((countForDay, dayIndex) => {
    for (let i = 0; i < countForDay; i++) {
      const numItems = 1 + ((counter + dayIndex) % 3);
      const items = [];
      const usedIdx = new Set<number>();
      for (let n = 0; n < numItems; n++) {
        let pIdx = (counter * 3 + n * 5 + dayIndex) % products.length;
        while (usedIdx.has(pIdx)) pIdx = (pIdx + 1) % products.length;
        usedIdx.add(pIdx);
        const product = products[pIdx];
        const quantity = 1 + ((counter + n) % 3);
        items.push({ productId: product.id, quantity, unitPrice: product.unitPrice });
      }
      const total = items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
      list.push({
        id: `txn-${counter}`,
        soldBy: sellers[counter % sellers.length],
        customerName: customerNames[counter % customerNames.length],
        items,
        total,
        createdAt: daysAgoISO(dayIndex, 9 + (counter % 8), (counter * 7) % 60),
      });
      counter++;
    }
  });

  return list.reverse();
}

export const transactions: Transaction[] = seededTransactions();

export const petLogs: PetLog[] = [
  { id: 'log-1', petId: 'pet-1', logType: 'vaccination', description: 'Rabies vaccine, annual booster', performedBy: 'emp-1', performedAt: daysAgoISO(20), nextDueDate: daysAgoISO(-345) },
  { id: 'log-2', petId: 'pet-1', logType: 'shower', description: 'Full groom + medicated shampoo', performedBy: 'emp-3', performedAt: daysAgoISO(5) },
  { id: 'log-3', petId: 'pet-2', logType: 'vaccination', description: 'DHPPi combo vaccine', performedBy: 'emp-2', performedAt: daysAgoISO(60), nextDueDate: daysAgoISO(-6) },
  { id: 'log-4', petId: 'pet-2', logType: 'other', description: 'Nail trim + ear cleaning', performedBy: 'emp-4', performedAt: daysAgoISO(3) },
  { id: 'log-5', petId: 'pet-3', logType: 'shower', description: 'Standard bath and dry', performedBy: 'emp-3', performedAt: daysAgoISO(10) },
  { id: 'log-6', petId: 'pet-3', logType: 'vaccination', description: 'Feline leukemia vaccine', performedBy: 'emp-1', performedAt: daysAgoISO(90), nextDueDate: daysAgoISO(-2) },
  { id: 'log-7', petId: 'pet-4', logType: 'vaccination', description: 'Rabies vaccine, first dose', performedBy: 'emp-2', performedAt: daysAgoISO(15), nextDueDate: daysAgoISO(-350) },
  { id: 'log-8', petId: 'pet-4', logType: 'other', description: 'Deworming treatment administered', performedBy: 'emp-1', performedAt: daysAgoISO(2) },
  { id: 'log-9', petId: 'pet-5', logType: 'other', description: 'Wing and beak check-up', performedBy: 'emp-2', performedAt: daysAgoISO(30) },
  { id: 'log-10', petId: 'pet-6', logType: 'shower', description: 'Fur trim and brush-out', performedBy: 'emp-4', performedAt: daysAgoISO(7) },
  { id: 'log-11', petId: 'pet-7', logType: 'vaccination', description: 'Bordetella vaccine', performedBy: 'emp-1', performedAt: daysAgoISO(1), nextDueDate: daysAgoISO(-179) },
  { id: 'log-12', petId: 'pet-8', logType: 'shower', description: 'Full groom, nail trim', performedBy: 'emp-3', performedAt: daysAgoISO(4) },
];

export const supplierOrders: SupplierOrder[] = [
  { id: 'so-1', supplierId: 'sup-1', productId: 'prod-13', quantity: 20, costTotal: 6000, loggedBy: 'emp-1', receivedAt: daysAgoISO(25) },
  { id: 'so-2', supplierId: 'sup-2', productId: 'prod-3', quantity: 10, costTotal: 18000, loggedBy: 'emp-1', receivedAt: daysAgoISO(18) },
  { id: 'so-3', supplierId: 'sup-3', productId: 'prod-14', quantity: 15, costTotal: 4200, loggedBy: 'emp-2', receivedAt: daysAgoISO(12) },
  { id: 'so-4', supplierId: 'sup-2', productId: 'prod-1', quantity: 12, costTotal: 7800, loggedBy: 'emp-1', receivedAt: daysAgoISO(9) },
  { id: 'so-5', supplierId: 'sup-1', productId: 'prod-15', quantity: 25, costTotal: 2750, loggedBy: 'emp-2', receivedAt: daysAgoISO(6) },
  { id: 'so-6', supplierId: 'sup-3', productId: 'prod-16', quantity: 10, costTotal: 1600, loggedBy: 'emp-1', receivedAt: daysAgoISO(3) },
  { id: 'so-7', supplierId: 'sup-2', productId: 'prod-9', quantity: 15, costTotal: 3600, loggedBy: 'emp-1', receivedAt: daysAgoISO(1) },
];
