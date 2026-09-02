/** Static seed data, ported from the frontend's src/data/mockData.ts. */

export const seedEmployees = [
  { slug: 'amira', name: 'Dr. Amira Fathy', role: 'doctor' as const, active: true },
  { slug: 'karim', name: 'Dr. Karim Nabil', role: 'doctor' as const, active: true },
  { slug: 'nour', name: 'Nour El-Sayed', role: 'nurse' as const, active: true },
  { slug: 'sara', name: 'Sara Adel', role: 'nurse' as const, active: true },
  { slug: 'mostafa', name: 'Mostafa Hassan', role: 'cashier' as const, active: true },
  { slug: 'yara', name: 'Yara Ibrahim', role: 'cashier' as const, active: true },
  { slug: 'omar', name: 'Omar Reda', role: 'cashier' as const, active: false },
];

export const DEV_EMAIL_DOMAIN = 'petsandpets.local';
export const DEV_PASSWORD = 'Password123!';
export const DEV_PIN = '1234';

/** Seeded product categories. `service` is flagged isSystem because the app's own logic
 * keys off a kind='service' category (products in it bypass the stock ledger entirely),
 * so it must not be deletable from Settings. */
export const seedCategories = [
  { name: 'food', label: 'Food', kind: 'good' as const, isSystem: false, sortOrder: 10 },
  { name: 'accessories', label: 'Accessories', kind: 'good' as const, isSystem: false, sortOrder: 20 },
  { name: 'medicine', label: 'Medicine', kind: 'good' as const, isSystem: false, sortOrder: 30 },
  { name: 'grooming', label: 'Grooming', kind: 'good' as const, isSystem: false, sortOrder: 40 },
  { name: 'service', label: 'Clinic service', kind: 'service' as const, isSystem: true, sortOrder: 50 },
];

export const seedProducts = [
  { slug: 'prod-1', name: 'Royal Canin Adult Cat Food 2kg', category: 'food', kind: 'good', sku: 'RC-CAT-2KG', unitPrice: 85000, openingStock: 30, lowStockThreshold: 5 },
  { slug: 'prod-2', name: 'Royal Canin Puppy Food 3kg', category: 'food', kind: 'good', sku: 'RC-PUP-3KG', unitPrice: 110000, openingStock: 15, lowStockThreshold: 5 },
  { slug: 'prod-3', name: 'Pedigree Adult Dog Food 15kg', category: 'food', kind: 'good', sku: 'PED-DOG-15KG', unitPrice: 240000, openingStock: 20, lowStockThreshold: 4 },
  { slug: 'prod-4', name: 'Whiskas Kitten Pouch (12pk)', category: 'food', kind: 'good', sku: 'WHK-KIT-12', unitPrice: 32000, openingStock: 45, lowStockThreshold: 10 },
  { slug: 'prod-5', name: 'Bird Seed Mix 1kg', category: 'food', kind: 'good', sku: 'BRD-SEED-1KG', unitPrice: 15000, openingStock: 20, lowStockThreshold: 5 },
  { slug: 'prod-6', name: 'Rabbit Pellets 2kg', category: 'food', kind: 'good', sku: 'RBT-PEL-2KG', unitPrice: 21000, openingStock: 10, lowStockThreshold: 5 },
  { slug: 'prod-7', name: 'Leather Dog Collar (M)', category: 'accessories', kind: 'good', sku: 'ACC-COL-M', unitPrice: 28000, openingStock: 18, lowStockThreshold: 4 },
  { slug: 'prod-8', name: 'Cat Scratching Post', category: 'accessories', kind: 'good', sku: 'ACC-SCR-01', unitPrice: 95000, openingStock: 8, lowStockThreshold: 2 },
  { slug: 'prod-9', name: 'Retractable Leash 5m', category: 'accessories', kind: 'good', sku: 'ACC-LSH-5M', unitPrice: 34000, openingStock: 22, lowStockThreshold: 5 },
  { slug: 'prod-10', name: 'Pet Carrier Bag (S)', category: 'accessories', kind: 'good', sku: 'ACC-CAR-S', unitPrice: 62000, openingStock: 10, lowStockThreshold: 3 },
  { slug: 'prod-11', name: 'Ceramic Food Bowl Set', category: 'accessories', kind: 'good', sku: 'ACC-BWL-SET', unitPrice: 18000, openingStock: 28, lowStockThreshold: 6 },
  { slug: 'prod-12', name: 'Cat Litter Box + Scoop', category: 'accessories', kind: 'good', sku: 'ACC-LIT-BOX', unitPrice: 41000, openingStock: 6, lowStockThreshold: 3 },
  { slug: 'prod-13', name: 'Rabies Vaccine (Vial)', category: 'medicine', kind: 'good', sku: 'MED-RAB-01', unitPrice: 50000, openingStock: 30, lowStockThreshold: 8 },
  { slug: 'prod-14', name: 'Flea & Tick Treatment', category: 'medicine', kind: 'good', sku: 'MED-FLEA-01', unitPrice: 38000, openingStock: 25, lowStockThreshold: 6 },
  { slug: 'prod-15', name: 'Deworming Tablets (pack)', category: 'medicine', kind: 'good', sku: 'MED-WORM-01', unitPrice: 15000, openingStock: 35, lowStockThreshold: 10 },
  { slug: 'prod-16', name: 'Antiseptic Wound Spray', category: 'medicine', kind: 'good', sku: 'MED-SPRAY-01', unitPrice: 22000, openingStock: 12, lowStockThreshold: 5 },
  { slug: 'prod-17', name: 'Pet Shampoo (Medicated)', category: 'grooming', kind: 'good', sku: 'GRM-SHMP-01', unitPrice: 26000, openingStock: 16, lowStockThreshold: 4 },
  { slug: 'prod-18', name: 'Nail Clipper Kit', category: 'grooming', kind: 'good', sku: 'GRM-CLIP-01', unitPrice: 19000, openingStock: 12, lowStockThreshold: 3 },
  { slug: 'prod-19', name: 'De-shedding Brush', category: 'grooming', kind: 'good', sku: 'GRM-BRSH-01', unitPrice: 24000, openingStock: 10, lowStockThreshold: 3 },
  { slug: 'prod-20', name: 'Ear Cleaning Solution', category: 'grooming', kind: 'good', sku: 'GRM-EAR-01', unitPrice: 17000, openingStock: 18, lowStockThreshold: 5 },
  { slug: 'prod-21', name: 'Sonar (Ultrasound Scan)', category: 'service', kind: 'service', sku: 'SVC-SONAR-01', unitPrice: 45000, openingStock: 0, lowStockThreshold: 0 },
  { slug: 'prod-22', name: 'Bath & Shower Service', category: 'service', kind: 'service', sku: 'SVC-SHOWER-01', unitPrice: 20000, openingStock: 0, lowStockThreshold: 0 },
  { slug: 'prod-23', name: 'Full Grooming Service', category: 'service', kind: 'service', sku: 'SVC-GROOM-01', unitPrice: 35000, openingStock: 0, lowStockThreshold: 0 },
  { slug: 'prod-24', name: 'Nail Trimming Service', category: 'service', kind: 'service', sku: 'SVC-NAIL-01', unitPrice: 10000, openingStock: 0, lowStockThreshold: 0 },
  { slug: 'prod-25', name: 'Vaccination Administration', category: 'service', kind: 'service', sku: 'SVC-VACC-01', unitPrice: 15000, openingStock: 0, lowStockThreshold: 0 },
  { slug: 'prod-26', name: 'General Checkup / Consultation', category: 'service', kind: 'service', sku: 'SVC-CHECK-01', unitPrice: 30000, openingStock: 0, lowStockThreshold: 0 },
];

export const seedSuppliers = [
  { slug: 'sup-1', name: 'NileVet Distributors', contactInfo: 'sales@nilevet.example · +20 2 2555 1000' },
  { slug: 'sup-2', name: 'PetCo Wholesale Egypt', contactInfo: 'orders@petco-eg.example · +20 2 2555 2000' },
  { slug: 'sup-3', name: 'Al Rahma Pharma Supplies', contactInfo: 'contact@rahma-pharma.example · +20 2 2555 3000' },
];

// [supplierSlug, productSlug, quantity, costTotalPiastres, loggedByEmployeeSlug, daysAgo]
export const seedSupplierOrders: [string, string, number, number, string, number][] = [
  ['sup-1', 'prod-13', 20, 600000, 'amira', 25],
  ['sup-2', 'prod-3', 10, 1800000, 'amira', 18],
  ['sup-3', 'prod-14', 15, 420000, 'karim', 12],
  ['sup-2', 'prod-1', 12, 780000, 'amira', 9],
  ['sup-1', 'prod-15', 25, 275000, 'karim', 6],
  ['sup-3', 'prod-16', 10, 160000, 'amira', 3],
  ['sup-2', 'prod-9', 15, 360000, 'amira', 1],
];

export const seedClients = [
  { slug: 'client-1', name: 'Hana Adel', phones: ['+20 100 111 2233'] },
  { slug: 'client-2', name: 'Tarek Fouad', phones: ['+20 101 222 3344'] },
  { slug: 'client-3', name: 'Nadine Samir', phones: ['+20 102 333 4455'] },
  { slug: 'client-4', name: 'Youssef Kamal', phones: ['+20 106 444 5566'] },
  { slug: 'client-5', name: 'Mona Zaki', phones: ['+20 111 555 6677'] },
  { slug: 'client-6', name: 'Ziad Hesham', phones: ['+20 112 666 7788'] },
  { slug: 'client-7', name: 'Salma Ashraf', phones: ['+20 114 777 8899'] },
];

export const seedPets = [
  { slug: 'pet-1', name: 'Simba', species: 'cat', breed: 'Persian', clientSlug: 'client-1' },
  { slug: 'pet-2', name: 'Max', species: 'dog', breed: 'German Shepherd', clientSlug: 'client-2' },
  { slug: 'pet-3', name: 'Luna', species: 'cat', breed: 'Siamese', clientSlug: 'client-3' },
  { slug: 'pet-4', name: 'Rocky', species: 'dog', breed: 'Labrador', clientSlug: 'client-4' },
  { slug: 'pet-5', name: 'Kiwi', species: 'bird', breed: 'Cockatiel', clientSlug: 'client-5' },
  { slug: 'pet-6', name: 'Coco', species: 'rabbit', breed: 'Dutch Rabbit', clientSlug: 'client-6' },
  { slug: 'pet-7', name: 'Bella', species: 'dog', breed: 'Poodle', clientSlug: 'client-7' },
  { slug: 'pet-8', name: 'Oliver', species: 'cat', breed: 'British Shorthair', clientSlug: 'client-1' },
];

// [petSlug, logType, description, performedByEmployeeSlug, daysAgo, nextDueInDays?]
export const seedPetLogs: [string, string, string, string, number, number | undefined][] = [
  ['pet-1', 'vaccination', 'Rabies vaccine, annual booster', 'amira', 20, -345],
  ['pet-1', 'shower', 'Full groom + medicated shampoo', 'nour', 5, undefined],
  ['pet-2', 'vaccination', 'DHPPi combo vaccine', 'karim', 60, -6],
  ['pet-2', 'other', 'Nail trim + ear cleaning', 'sara', 3, undefined],
  ['pet-3', 'shower', 'Standard bath and dry', 'nour', 10, undefined],
  ['pet-3', 'vaccination', 'Feline leukemia vaccine', 'amira', 90, -2],
  ['pet-4', 'vaccination', 'Rabies vaccine, first dose', 'karim', 15, -350],
  ['pet-4', 'other', 'Deworming treatment administered', 'amira', 2, undefined],
  ['pet-5', 'other', 'Wing and beak check-up', 'karim', 30, undefined],
  ['pet-6', 'shower', 'Fur trim and brush-out', 'sara', 7, undefined],
  ['pet-7', 'vaccination', 'Bordetella vaccine', 'amira', 1, -179],
  ['pet-8', 'shower', 'Full groom, nail trim', 'nour', 4, undefined],
];

export const seedTransactionCustomerNames = [
  'Hana Adel', 'Tarek Fouad', 'Nadine Samir', 'Youssef Kamal', 'Mona Zaki',
  'Ziad Hesham', 'Salma Ashraf', 'Ahmed Sami', 'Rania Ehab', 'Karim Ali',
  'Dina Farouk', 'Hossam Nagy',
];

export const seedTransactionSellers = ['mostafa', 'yara', 'nour', 'sara', 'amira', 'karim'];

/** Same day-by-day sale-count pattern as the frontend's generator, oldest first. */
export const seedTransactionDayPattern = [
  1, 0, 2, 1, 0, 3, 2, 1, 2, 1, 0, 1, 2, 1, 1, 0, 2, 1, 3, 0, 2, 1, 2, 1, 0, 1, 3, 2, 1, 2,
];
