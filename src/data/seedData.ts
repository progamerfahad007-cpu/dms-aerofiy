import { DMSState, UserRole } from '../types/dms';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  CASHIER: 'Cashier',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  SALES_REP: 'Sales Representative',
  DELIVERYMAN: 'Deliveryman',
};

export const createSeedData = (): DMSState => ({
  users: [
    {
      id: 'usr-admin-1',
      username: 'Admin',
      password: '1234',
      name: 'Admin',
      email: 'admin@aerofiy.com',
      phone: '',
      role: 'ADMIN',
      active: true,
      territory: 'Head Office',
    },
  ],
  productCategories: [],
  products: [],
  stores: [],
  orders: [],
  grns: [],
  reconciliations: [],
  finalInvoices: [],
  rtvs: [],
  cashbook: [],
  settlements: [],
  dayLocks: [],
  companyProfile: {
    companyName: 'aerofiy DMS',
    logoDataUrl: '',
    address: '',
    phone: '',
    email: 'ops@aerofiy.com',
    website: 'https://dms.aerofiy.com',
  },
  printTemplate: 'MODERN_EMERALD',
});
