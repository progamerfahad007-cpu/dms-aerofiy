export type UserRole =
  | 'ADMIN'
  | 'CASHIER'
  | 'WAREHOUSE_MANAGER'
  | 'SALES_REP'
  | 'DELIVERYMAN';

export interface StaffUser {
  id: string;
  username: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  active: boolean;
  territory?: string;
  vehicleNo?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  sellingPrice: number;
  sellableStock: number;
  inTransitStock: number;
  damagedStock: number;
}

export interface RetailStore {
  id: string;
  name: string;
  ownerName: string;
  phone: string;
  address: string;
  zone: string;
  lat: number | null;
  lng: number | null;
  creditBalance: number;
  createdAt: string;
}

export type OrderStatus =
  | 'PENDING_DISPATCH'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'PARTIAL_DELIVERY';

export interface OrderItem {
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  unitPrice: number;
  orderedQty: number;
  deliveredQty: number;
  damagedReturnQty: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  salesRepId: string;
  salesRepName: string;
  deliverymanId?: string;
  deliverymanName?: string;
  createdAt: string;
  dispatchedAt?: string;
  deliveredAt?: string;
  status: OrderStatus;
  items: OrderItem[];
  totalOrderedAmount: number;
  returnCreditAmount: number;
  netPayableAmount: number;
  cashCollected: number;
  dueAdded: number;
  reconciled: boolean;
  cashSettled: boolean;
  finalInvoiceId?: string;
  finalInvoiceNumber?: string;
}

export interface GRNItem {
  productId: string;
  sku: string;
  productName: string;
  qty: number;
  unitCost: number;
}

export interface GRNRecord {
  id: string;
  referenceNo: string;
  supplierName: string;
  receivedAt: string;
  receivedBy: string;
  items: GRNItem[];
  totalValue: number;
  invoiceImageDataUrl?: string;
  invoiceImageName?: string;
}

export interface ReconciliationItem {
  productId: string;
  sku: string;
  productName: string;
  dispatchedQty: number;
  deliveredQty: number;
  unsoldReturnQty: number;
  returnedToSellable: number;
  movedToDamaged: number;
}

export interface ReconciliationRecord {
  id: string;
  deliverymanId: string;
  deliverymanName: string;
  reconciledAt: string;
  reconciledBy: string;
  orderIds: string[];
  finalInvoiceId: string;
  finalInvoiceNumber: string;
  items: ReconciliationItem[];
}

export interface FinalInvoiceOrderSummary {
  orderId: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  orderedAmount: number;
  deliveredAmount: number;
  returnCreditAmount: number;
  netPayableAmount: number;
  cashCollectedByDriver: number;
  dueAdded: number;
}

export type PrintTemplateId =
  | 'CLASSIC_LEDGER'
  | 'MODERN_EMERALD'
  | 'COMPACT_THERMAL_A5';

export interface CompanyProfile {
  companyName: string;
  logoDataUrl?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
}

export interface FinalInvoice {
  id: string;
  invoiceNumber: string;
  reconciliationId: string;
  deliverymanId: string;
  deliverymanName: string;
  createdAt: string;
  createdBy: string;
  orders: FinalInvoiceOrderSummary[];
  items: ReconciliationItem[];
  totalOrderedAmount: number;
  totalDeliveredAmount: number;
  totalReturnCredit: number;
  netFinalPayable: number;
  expectedCashFromWarehouse: number;
  cashSettled: boolean;
  cashReceivedByCashier?: number;
  variance?: number;
  settledAt?: string;
  settledBy?: string;
  settlementDueDateKey?: string;
  rescheduledReason?: string;
  rescheduledBy?: string;
  rescheduledAt?: string;
}

export interface RTVItem {
  productId: string;
  sku: string;
  productName: string;
  qty: number;
  unitCost: number;
  claimAmount: number;
}

export interface RTVRecord {
  id: string;
  debitNoteNo: string;
  manufacturerName: string;
  createdAt: string;
  createdBy: string;
  items: RTVItem[];
  totalClaimAmount: number;
}

export type CashbookEntryType = 'INFLOW' | 'OUTFLOW';

export type CashbookCategory =
  | 'DELIVERY_SETTLEMENT'
  | 'DUE_COLLECTION'
  | 'FUEL_EXPENSE'
  | 'OTHER_EXPENSE';

export interface CashbookEntry {
  id: string;
  timestamp: string;
  type: CashbookEntryType;
  category: CashbookCategory;
  description: string;
  referenceId?: string;
  amount: number;
  recordedBy: string;
  deliverymanId?: string;
  storeId?: string;
  variance?: number;
}

export interface SettlementRecord {
  id: string;
  deliverymanId: string;
  deliverymanName: string;
  settledAt: string;
  settledBy: string;
  finalInvoiceId?: string;
  finalInvoiceNumber?: string;
  orderIds: string[];
  expectedCash: number;
  physicalCash: number;
  variance: number;
}

export interface DayLockRecord {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  dateKey: string; // YYYY-MM-DD
  finishedAt?: string;
  unlockedUntil?: string; // ISO timestamp granting 1-hour live window
  unlockedBy?: string;
}

export interface DMSState {
  users: StaffUser[];
  productCategories: string[];
  products: Product[];
  stores: RetailStore[];
  orders: Order[];
  grns: GRNRecord[];
  reconciliations: ReconciliationRecord[];
  finalInvoices: FinalInvoice[];
  rtvs: RTVRecord[];
  cashbook: CashbookEntry[];
  settlements: SettlementRecord[];
  dayLocks: DayLockRecord[];
  companyProfile: CompanyProfile;
  printTemplate: PrintTemplateId;
}
