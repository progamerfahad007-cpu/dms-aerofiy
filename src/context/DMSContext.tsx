import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createSeedData, ROLE_LABELS } from '../data/seedData';
import {
  commitStateDiffToFirestore,
  ensureCloudSeeded,
  fetchUsersFromCloud,
  subscribeToDMSCloud,
} from '../services/dmsFirestoreSync';
import {
  CashbookCategory,
  CashbookEntry,
  CompanyProfile,
  DayLockRecord,
  DMSState,
  FinalInvoice,
  FinalInvoiceOrderSummary,
  GRNItem,
  GRNRecord,
  Order,
  OrderItem,
  PrintTemplateId,
  Product,
  ReconciliationItem,
  ReconciliationRecord,
  RetailStore,
  RTVItem,
  RTVRecord,
  SettlementRecord,
  StaffUser,
  UserRole,
} from '../types/dms';

const STORAGE_KEY = 'aerofiy_dms_state_v4';
const AUTH_KEY = 'aerofiy_dms_user_v4';

const makeDocId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

export const toDateKey = (input: string | Date = new Date()): string => {
  const d = typeof input === 'string' ? new Date(input) : input;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface WorkDayStatus {
  todayKey: string;
  activeDateKey: string;
  isLocked: boolean;
  isAdminUnlocked: boolean;
  unlockExpiresAt?: string;
  unlockRemainingMinutes: number;
  canFinishToday: boolean;
  finishBlockedReason?: string;
  pendingPrerequisites: string[];
  warehousePendingInvoices: string[];
  cashierMismatchDetails: string[];
}

export interface CashierMismatchSummary {
  hasMismatch: boolean;
  dateKey: string;
  mismatchedInvoices: FinalInvoice[];
  unsettledInvoices: FinalInvoice[];
  mismatchedSettlements: SettlementRecord[];
  reasons: string[];
}

interface DMSContextValue {
  state: DMSState;
  isCloudReady: boolean;
  currentUser: StaffUser | null;
  currentTimeMs: number;
  simulateAfter8PM: boolean;
  setSimulateAfter8PM: (val: boolean) => void;
  loginWithCredentials: (
    username: string,
    password: string,
    allowedRoles?: UserRole[]
  ) => Promise<ActionResult<StaffUser>>;
  logout: () => void;
  resetDemoData: () => void;

  // Finish Today & Admin 1-Hour Unlock & Reschedule
  getWorkDayStatus: (user?: StaffUser | null) => WorkDayStatus;
  getCashierMismatchSummary: (dateKey?: string) => CashierMismatchSummary;
  finishToday: () => ActionResult;
  activateOneHourFinishWindow: (userId: string, dateKey: string) => ActionResult;
  rescheduleInvoiceSettlementDate: (
    finalInvoiceId: string,
    newDateKey: string,
    reason?: string
  ) => ActionResult;

  // Admin Branding & Print Templates
  updateCompanyProfile: (profile: CompanyProfile) => ActionResult;
  setPrintTemplate: (template: PrintTemplateId) => ActionResult;

  // Admin
  addUser: (user: Omit<StaffUser, 'id'>) => ActionResult<StaffUser>;
  updateUser: (user: StaffUser) => ActionResult;
  deleteUser: (userId: string) => ActionResult;
  changeUserPassword: (userId: string, newPassword: string) => ActionResult;
  changeOwnAdminPassword: (currentPassword: string, newPassword: string) => ActionResult;
  addProductCategory: (name: string) => ActionResult<string>;
  deleteProductCategory: (name: string) => ActionResult;
  addProduct: (
    product: Omit<Product, 'id' | 'inTransitStock' | 'damagedStock'>
  ) => ActionResult<Product>;
  updateProduct: (product: Product) => ActionResult;
  deleteProduct: (productId: string) => ActionResult;
  updateProductPrices: (
    productId: string,
    unitCost: number,
    sellingPrice: number
  ) => ActionResult;
  generateRTVDebitNote: (manufacturerName: string) => ActionResult<RTVRecord>;

  // Warehouse
  receiveStockGRN: (
    supplierName: string,
    referenceNo: string,
    items: { productId: string; qty: number }[],
    invoiceImageDataUrl: string,
    invoiceImageName?: string
  ) => ActionResult<GRNRecord>;
  updateProductStock: (
    productId: string,
    sellableStock: number,
    damagedStock: number
  ) => ActionResult;
  dispatchOrder: (orderId: string, deliverymanId: string) => ActionResult;
  reconcileRoute: (
    deliverymanId: string,
    orderIds: string[],
    splits: Record<string, { returnedToSellable: number; movedToDamaged: number }>
  ) => ActionResult<{ reconciliation: ReconciliationRecord; finalInvoice: FinalInvoice }>;

  // Sales Rep
  addStore: (
    store: Omit<RetailStore, 'id' | 'creditBalance' | 'createdAt'>
  ) => ActionResult<RetailStore>;
  updateStore: (
    storeId: string,
    updates: Omit<RetailStore, 'id' | 'creditBalance' | 'createdAt'>
  ) => ActionResult<RetailStore>;
  updateStoreCoordinates: (storeId: string, lat: number, lng: number) => void;
  createOrder: (
    storeId: string,
    items: { productId: string; qty: number }[],
    autoCoords?: { lat: number; lng: number } | null
  ) => ActionResult<Order>;

  // Deliveryman
  completeDelivery: (
    orderId: string,
    executions: Record<string, { deliveredQty: number; damagedReturnQty: number }>,
    cashCollected: number
  ) => ActionResult<Order>;

  // Cashier
  settleFinalInvoice: (
    finalInvoiceId: string,
    physicalCash: number
  ) => ActionResult<SettlementRecord>;
  settleDeliverymanCash: (
    deliverymanId: string,
    orderIds: string[],
    physicalCash: number
  ) => ActionResult<SettlementRecord>;
  collectStoreDue: (
    storeId: string,
    amount: number,
    referenceId?: string
  ) => ActionResult<CashbookEntry>;
  recordExpense: (
    category: Extract<CashbookCategory, 'FUEL_EXPENSE' | 'OTHER_EXPENSE'>,
    description: string,
    amount: number,
    deliverymanId?: string,
    referenceId?: string
  ) => ActionResult<CashbookEntry>;
}

const DMSContext = createContext<DMSContextValue | null>(null);

const loadInitialState = (): DMSState => {
  const seed = createSeedData();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DMSState>;
      if (
        parsed &&
        Array.isArray(parsed.products) &&
        Array.isArray(parsed.users) &&
        Array.isArray(parsed.finalInvoices)
      ) {
        return {
          ...seed,
          ...parsed,
          productCategories: Array.isArray(parsed.productCategories)
            ? parsed.productCategories
            : seed.productCategories,
          dayLocks: Array.isArray(parsed.dayLocks) ? parsed.dayLocks : [],
          companyProfile: parsed.companyProfile?.companyName
            ? parsed.companyProfile
            : seed.companyProfile,
          printTemplate: parsed.printTemplate ?? seed.printTemplate,
        };
      }
    }
  } catch {
    // Fallback to clean seed data
  }
  return seed;
};

const loadInitialUserId = (): string | null => {
  try {
    return localStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
};

export const DMSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DMSState>(loadInitialState);
  const stateRef = useRef<DMSState>(state);
  const [isCloudReady, setIsCloudReady] = useState<boolean>(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(loadInitialUserId);
  const [currentTimeMs, setCurrentTimeMs] = useState<number>(() => Date.now());
  const [simulateAfter8PM, setSimulateAfter8PM] = useState<boolean>(false);

  // Applies incoming real-time Firestore snapshots to local state without writing back
  const applyCloudSlice = useCallback((updater: (prev: DMSState) => DMSState) => {
    const next = updater(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  // Applies local mutations optimistically and commits atomic document diffs to Firestore
  const mutateState = useCallback((updater: (prev: DMSState) => DMSState) => {
    const prev = stateRef.current;
    const next = updater(prev);
    stateRef.current = next;
    setState(next);
    void commitStateDiffToFirestore(prev, next);
  }, []);

  // Real-time Firebase Firestore synchronization across all browsers & Android devices
  useEffect(() => {
    let active = true;
    void ensureCloudSeeded();

    const unsubscribe = subscribeToDMSCloud(
      (updater) => {
        if (active) applyCloudSlice(updater);
      },
      () => {
        if (active) setIsCloudReady(true);
      },
      () => {
        // Error already logged via handleFirestoreError
      }
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyCloudSlice]);

  // Tick every 30 seconds so 1-hour countdowns and 8 PM escalation stay live
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
  }, []);

  // Persist lightweight offline read cache in localStorage (Firestore remains source of truth)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }, [state]);

  useEffect(() => {
    try {
      if (currentUserId) {
        localStorage.setItem(AUTH_KEY, currentUserId);
      } else {
        localStorage.removeItem(AUTH_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [currentUserId]);

  // If the signed-in account is deleted or deactivated from another browser, clear session
  useEffect(() => {
    if (!isCloudReady || !currentUserId) return;
    const stillValid = state.users.some((u) => u.id === currentUserId && u.active);
    if (!stillValid) {
      setCurrentUserId(null);
    }
  }, [isCloudReady, currentUserId, state.users]);

  const currentUser =
    state.users.find((u) => u.id === currentUserId && u.active) ?? null;

  const getCashierMismatchSummary = (
    dateKey: string = toDateKey(new Date(currentTimeMs))
  ): CashierMismatchSummary => {
    const effectiveInvoiceDate = (f: FinalInvoice) =>
      f.settlementDueDateKey || toDateKey(f.createdAt);

    // Invoices rescheduled to a future date (> dateKey) are within Admin's extended dispute window
    const deferredOrderIds = new Set(
      state.finalInvoices
        .filter((f) => effectiveInvoiceDate(f) > dateKey)
        .flatMap((f) => f.orders.map((o) => o.orderId))
    );
    const deferredInvoiceIds = new Set(
      state.finalInvoices
        .filter((f) => effectiveInvoiceDate(f) > dateKey)
        .map((f) => f.id)
    );

    const dayInvoices = state.finalInvoices.filter(
      (f) => effectiveInvoiceDate(f) === dateKey
    );
    const unsettledInvoices = dayInvoices.filter((f) => !f.cashSettled);
    const mismatchedInvoices = dayInvoices.filter(
      (f) => f.cashSettled && Math.abs(f.variance ?? 0) > 0.009
    );

    const daySettlements = state.settlements.filter(
      (s) =>
        toDateKey(s.settledAt) === dateKey &&
        (!s.finalInvoiceId || !deferredInvoiceIds.has(s.finalInvoiceId))
    );
    const mismatchedSettlements = daySettlements.filter(
      (s) => Math.abs(s.variance) > 0.009
    );

    // Also check completed orders from dateKey not yet settled with cashier (unless deferred via Final Invoice reschedule)
    const unsettledDayOrders = state.orders.filter(
      (o) =>
        (o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY') &&
        o.deliveredAt &&
        toDateKey(o.deliveredAt) === dateKey &&
        !o.cashSettled &&
        !deferredOrderIds.has(o.id)
    );

    const reasons: string[] = [];
    if (mismatchedInvoices.length > 0) {
      mismatchedInvoices.forEach((inv) => {
        const v = inv.variance ?? 0;
        reasons.push(
          `Cash variance on ${inv.invoiceNumber} (${inv.deliverymanName}): ${
            v > 0 ? '+' : ''
          }৳${v.toFixed(2)}`
        );
      });
    } else if (mismatchedSettlements.length > 0) {
      mismatchedSettlements.forEach((s) => {
        reasons.push(
          `Cash variance for ${s.deliverymanName}: ${s.variance > 0 ? '+' : ''}৳${s.variance.toFixed(2)}`
        );
      });
    }

    if (unsettledInvoices.length > 0) {
      reasons.push(
        `${unsettledInvoices.length} Final Invoice(s) pending cash receipt (${unsettledInvoices
          .map((i) => i.invoiceNumber)
          .join(', ')})`
      );
    } else if (unsettledDayOrders.length > 0) {
      reasons.push(
        `${unsettledDayOrders.length} completed delivery order(s) not yet settled with Cashier`
      );
    }

    return {
      hasMismatch: reasons.length > 0,
      dateKey,
      mismatchedInvoices,
      unsettledInvoices,
      mismatchedSettlements,
      reasons,
    };
  };

  const getWorkDayStatus = (user: StaffUser | null = currentUser): WorkDayStatus => {
    const todayKey = toDateKey(new Date(currentTimeMs));
    if (!user || user.role === 'ADMIN') {
      return {
        todayKey,
        activeDateKey: todayKey,
        isLocked: false,
        isAdminUnlocked: false,
        unlockRemainingMinutes: 0,
        canFinishToday: false,
        pendingPrerequisites: [],
        warehousePendingInvoices: [],
        cashierMismatchDetails: [],
      };
    }

    // Check if Admin activated an active 1-hour live window for any date for this user
    const activeOverride = state.dayLocks.find(
      (rec) =>
        rec.userId === user.id &&
        rec.unlockedUntil &&
        new Date(rec.unlockedUntil).getTime() > currentTimeMs
    );

    const activeDateKey = activeOverride ? activeOverride.dateKey : todayKey;
    const lockForActiveDate = state.dayLocks.find(
      (rec) => rec.userId === user.id && rec.dateKey === activeDateKey
    );

    const isAdminUnlocked = Boolean(
      lockForActiveDate?.unlockedUntil &&
        new Date(lockForActiveDate.unlockedUntil).getTime() > currentTimeMs
    );

    const unlockRemainingMinutes = isAdminUnlocked && lockForActiveDate?.unlockedUntil
      ? Math.max(
          1,
          Math.ceil(
            (new Date(lockForActiveDate.unlockedUntil).getTime() - currentTimeMs) / 60000
          )
        )
      : 0;

    // Locked if finishedAt exists AND there is no active 1-hour Admin unlock window
    const isLocked = Boolean(lockForActiveDate?.finishedAt && !isAdminUnlocked);

    // Check prerequisites for Warehouse Manager and Cashier
    const pendingPrerequisites: string[] = [];
    const warehousePendingInvoices: string[] = [];
    const cashierMismatchDetails: string[] = [];
    let canFinishToday = !isLocked;
    let finishBlockedReason: string | undefined;

    if (!isLocked && user.role === 'WAREHOUSE_MANAGER') {
      const requiredStaff = state.users.filter(
        (u) => u.active && (u.role === 'SALES_REP' || u.role === 'DELIVERYMAN')
      );
      for (const staff of requiredStaff) {
        const staffLock = state.dayLocks.find(
          (rec) => rec.userId === staff.id && rec.dateKey === activeDateKey
        );
        const staffUnlockedNow = Boolean(
          staffLock?.unlockedUntil &&
            new Date(staffLock.unlockedUntil).getTime() > currentTimeMs
        );
        const staffFinished = Boolean(staffLock?.finishedAt && !staffUnlockedNow);
        if (!staffFinished) {
          pendingPrerequisites.push(`${staff.name} (${ROLE_LABELS[staff.role]})`);
        }
      }

      const relevantOrders = state.orders.filter(
        (o) => toDateKey(o.createdAt) <= activeDateKey
      );
      const pendingDispatchOrders = relevantOrders.filter(
        (o) => o.status === 'PENDING_DISPATCH'
      );
      const inTransitOrders = relevantOrders.filter((o) => o.status === 'IN_TRANSIT');
      const awaitingFinalInvoiceOrders = relevantOrders.filter(
        (o) =>
          (o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY') && !o.reconciled
      );

      if (pendingDispatchOrders.length > 0) {
        warehousePendingInvoices.push(
          `${pendingDispatchOrders.length} Pending Dispatch invoice(s): ${pendingDispatchOrders
            .map((o) => o.orderNumber)
            .join(', ')}`
        );
      }
      if (inTransitOrders.length > 0) {
        warehousePendingInvoices.push(
          `${inTransitOrders.length} In-Transit invoice(s) not yet delivered: ${inTransitOrders
            .map((o) => o.orderNumber)
            .join(', ')}`
        );
      }
      if (awaitingFinalInvoiceOrders.length > 0) {
        warehousePendingInvoices.push(
          `${awaitingFinalInvoiceOrders.length} Delivered invoice(s) awaiting return restock & Final Invoice: ${awaitingFinalInvoiceOrders
            .map((o) => o.orderNumber)
            .join(', ')}`
        );
      }

      if (pendingPrerequisites.length > 0 || warehousePendingInvoices.length > 0) {
        canFinishToday = false;
        if (pendingPrerequisites.length > 0 && warehousePendingInvoices.length > 0) {
          finishBlockedReason = `Waiting for Sales Reps & Deliverymen (${pendingPrerequisites.join(', ')}) AND pending invoices remain (${warehousePendingInvoices.join('; ')}).`;
        } else if (warehousePendingInvoices.length > 0) {
          finishBlockedReason = `Warehouse Manager cannot finish work while invoices are pending: ${warehousePendingInvoices.join('; ')}`;
        } else {
          finishBlockedReason = `Waiting for all Sales Reps & Deliverymen to click Finish Today: ${pendingPrerequisites.join(', ')}`;
        }
      }
    }

    if (!isLocked && user.role === 'CASHIER') {
      const warehouseManagers = state.users.filter(
        (u) => u.active && u.role === 'WAREHOUSE_MANAGER'
      );
      for (const wm of warehouseManagers) {
        const wmLock = state.dayLocks.find(
          (rec) => rec.userId === wm.id && rec.dateKey === activeDateKey
        );
        const wmUnlockedNow = Boolean(
          wmLock?.unlockedUntil &&
            new Date(wmLock.unlockedUntil).getTime() > currentTimeMs
        );
        const wmFinished = Boolean(wmLock?.finishedAt && !wmUnlockedNow);
        if (!wmFinished) {
          pendingPrerequisites.push(`${wm.name} (${ROLE_LABELS[wm.role]})`);
        }
      }

      const mismatch = getCashierMismatchSummary(activeDateKey);
      if (mismatch.hasMismatch) {
        cashierMismatchDetails.push(...mismatch.reasons);
      }

      if (pendingPrerequisites.length > 0 || mismatch.hasMismatch) {
        canFinishToday = false;
        if (pendingPrerequisites.length > 0 && mismatch.hasMismatch) {
          finishBlockedReason = `Waiting for Warehouse Manager (${pendingPrerequisites.join(', ')}) AND unresolved cash mismatch / unsettled Final Invoices.`;
        } else if (pendingPrerequisites.length > 0) {
          finishBlockedReason = `Cashier cannot finish before Warehouse Manager finishes today: ${pendingPrerequisites.join(', ')}`;
        } else {
          finishBlockedReason =
            'Cash mismatch or unsettled Final Invoices detected. Cashier cannot finish today until resolved or rescheduled by Admin.';
        }
      }
    }

    return {
      todayKey,
      activeDateKey,
      isLocked,
      isAdminUnlocked,
      unlockExpiresAt: lockForActiveDate?.unlockedUntil,
      unlockRemainingMinutes,
      canFinishToday,
      finishBlockedReason,
      pendingPrerequisites,
      warehousePendingInvoices,
      cashierMismatchDetails,
    };
  };

  const getOperationalTimestamp = (): string => {
    const status = getWorkDayStatus(currentUser);
    if (status.activeDateKey === status.todayKey) {
      return new Date().toISOString();
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return new Date(`${status.activeDateKey}T${hh}:${mm}:00`).toISOString();
  };

  const ensureDayUnlocked = (): ActionResult => {
    if (!currentUser) return { ok: false, error: 'Please sign in first.' };
    if (currentUser.role === 'ADMIN') return { ok: true };
    const status = getWorkDayStatus(currentUser);
    if (status.isLocked) {
      return {
        ok: false,
        error: `Work for ${status.activeDateKey} is finished and locked. Only Admin can activate a 1-hour live window to edit this date.`,
      };
    }
    return { ok: true };
  };

  const finishToday = (): ActionResult => {
    if (!currentUser || currentUser.role === 'ADMIN') {
      return { ok: false, error: 'Only non-admin operational users finish their day.' };
    }
    const status = getWorkDayStatus(currentUser);
    if (status.isLocked) {
      return { ok: false, error: `Already finished for ${status.activeDateKey}.` };
    }
    if (!status.canFinishToday) {
      return {
        ok: false,
        error: status.finishBlockedReason || 'Cannot finish today due to pending rules.',
      };
    }

    const nowIso = new Date().toISOString();
    mutateState((prev) => {
      const existing = prev.dayLocks.find(
        (r) => r.userId === currentUser.id && r.dateKey === status.activeDateKey
      );
      if (existing) {
        return {
          ...prev,
          dayLocks: prev.dayLocks.map((r) =>
            r.id === existing.id
              ? { ...r, finishedAt: nowIso, unlockedUntil: undefined }
              : r
          ),
        };
      }
      const created: DayLockRecord = {
        id: makeDocId('dl'),
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        dateKey: status.activeDateKey,
        finishedAt: nowIso,
      };
      return {
        ...prev,
        dayLocks: [created, ...prev.dayLocks],
      };
    });

    return { ok: true };
  };

  const activateOneHourFinishWindow = (
    userId: string,
    dateKey: string
  ): ActionResult => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can activate the 1-hour Finish Today window.' };
    }
    const targetUser = stateRef.current.users.find((u) => u.id === userId && u.role !== 'ADMIN');
    if (!targetUser) {
      return { ok: false, error: 'Select a valid non-admin staff user.' };
    }
    if (!dateKey) {
      return { ok: false, error: 'Select a valid date.' };
    }

    const expiresIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    mutateState((prev) => {
      const existing = prev.dayLocks.find(
        (r) => r.userId === targetUser.id && r.dateKey === dateKey
      );
      if (existing) {
        return {
          ...prev,
          dayLocks: prev.dayLocks.map((r) =>
            r.id === existing.id
              ? {
                  ...r,
                  unlockedUntil: expiresIso,
                  unlockedBy: currentUser.name,
                }
              : r
          ),
        };
      }
      const created: DayLockRecord = {
        id: makeDocId('dl'),
        userId: targetUser.id,
        userName: targetUser.name,
        userRole: targetUser.role,
        dateKey,
        unlockedUntil: expiresIso,
        unlockedBy: currentUser.name,
      };
      return {
        ...prev,
        dayLocks: [created, ...prev.dayLocks],
      };
    });
    setCurrentTimeMs(Date.now());
    return { ok: true };
  };

  const rescheduleInvoiceSettlementDate = (
    finalInvoiceId: string,
    newDateKey: string,
    reason?: string
  ): ActionResult => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can reschedule an invoice settlement date.' };
    }
    const target = stateRef.current.finalInvoices.find((f) => f.id === finalInvoiceId);
    if (!target) {
      return { ok: false, error: 'Final Invoice not found.' };
    }
    if (!newDateKey) {
      return { ok: false, error: 'Select a valid new settlement date.' };
    }
    const nowIso = new Date().toISOString();
    mutateState((prev) => ({
      ...prev,
      finalInvoices: prev.finalInvoices.map((f) =>
        f.id === finalInvoiceId
          ? {
              ...f,
              settlementDueDateKey: newDateKey,
              rescheduledReason:
                reason?.trim() || 'Dispute resolution window extended by Admin',
              rescheduledBy: currentUser.name,
              rescheduledAt: nowIso,
            }
          : f
      ),
    }));
    return { ok: true };
  };

  const updateCompanyProfile = (profile: CompanyProfile): ActionResult => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can update company branding and contact info.' };
    }
    if (!profile.companyName.trim()) {
      return { ok: false, error: 'Company name is required.' };
    }
    const logoVal = (profile.logoDataUrl ?? '').trim();
    if (logoVal.length > 350000) {
      return {
        ok: false,
        error: 'Company logo image is too large for cloud sync. Please choose a smaller image.',
      };
    }
    const cleanProfile: CompanyProfile = {
      companyName: profile.companyName.trim().slice(0, 160),
      logoDataUrl: logoVal,
      address: (profile.address || '').trim().slice(0, 300),
      phone: (profile.phone || '').trim().slice(0, 60),
      email: (profile.email || '').trim().slice(0, 160),
      website: (profile.website || '').trim().slice(0, 160),
    };
    mutateState((prev) => ({
      ...prev,
      companyProfile: cleanProfile,
    }));
    return { ok: true };
  };

  const setPrintTemplate = (template: PrintTemplateId): ActionResult => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can select the default A5 print template.' };
    }
    mutateState((prev) => ({
      ...prev,
      printTemplate: template,
    }));
    return { ok: true };
  };

  const loginWithCredentials = async (
    username: string,
    password: string,
    allowedRoles?: UserRole[]
  ): Promise<ActionResult<StaffUser>> => {
    const cleanLogin = username.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanLogin || !cleanPassword) {
      return { ok: false, error: 'Enter both username and password.' };
    }

    const findMatchingUser = (users: StaffUser[]): StaffUser | undefined =>
      users.find(
        (u) =>
          u.username.trim().toLowerCase() === cleanLogin ||
          (u.email && u.email.trim().toLowerCase() === cleanLogin)
      );

    const passwordMatches = (user: StaffUser): boolean =>
      user.password === password || user.password.trim() === cleanPassword;

    let matched = findMatchingUser(stateRef.current.users);

    // Always verify against live cloud Firestore if user isn't found or password differs
    if (!matched || !passwordMatches(matched) || !isCloudReady) {
      let cloudUsers = await fetchUsersFromCloud();
      if (cloudUsers.length === 0) {
        await ensureCloudSeeded();
        cloudUsers = await fetchUsersFromCloud();
      }
      if (cloudUsers.length > 0) {
        const sortedUsers = [...cloudUsers].sort((a, b) =>
          a.username.localeCompare(b.username)
        );
        applyCloudSlice((prev) => ({ ...prev, users: sortedUsers }));
        matched = findMatchingUser(sortedUsers);
      }
    }

    if (!matched || !passwordMatches(matched)) {
      return { ok: false, error: 'Invalid username or password.' };
    }
    if (!matched.active) {
      return { ok: false, error: 'This user account is deactivated. Contact Admin.' };
    }
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(matched.role)) {
      return {
        ok: false,
        error:
          'This Android Field App is restricted to Sales Representatives and Deliverymen only. Please sign in on the web portal at dms.aerofiy.com.',
      };
    }
    setCurrentUserId(matched.id);
    return { ok: true, data: matched };
  };

  const logout = () => {
    setCurrentUserId(null);
  };

  const resetDemoData = () => {
    const fresh = createSeedData();
    mutateState(() => fresh);
    if (currentUser) {
      const matched = fresh.users.find((u) => u.role === currentUser.role);
      setCurrentUserId(matched ? matched.id : fresh.users[0].id);
    }
  };

  const addUser = (userInput: Omit<StaffUser, 'id'>): ActionResult<StaffUser> => {
    const cleanUsername = userInput.username.trim();
    const cleanPassword = (userInput.password || '').trim();
    const cleanName = (userInput.name || '').trim();
    if (!cleanName) {
      return { ok: false, error: 'Full name is required.' };
    }
    if (!cleanUsername) {
      return { ok: false, error: 'Username is required.' };
    }
    if (cleanPassword.length < 3) {
      return { ok: false, error: 'Password must be at least 3 characters.' };
    }
    if (
      stateRef.current.users.some(
        (u) => u.username.trim().toLowerCase() === cleanUsername.toLowerCase()
      )
    ) {
      return { ok: false, error: `Username "${cleanUsername}" is already taken.` };
    }
    const newUser: StaffUser = {
      id: makeDocId('usr'),
      username: cleanUsername.slice(0, 64),
      password: cleanPassword.slice(0, 128),
      name: cleanName.slice(0, 120),
      email: (userInput.email || '').trim().slice(0, 160),
      phone: (userInput.phone || '').trim().slice(0, 40),
      role: userInput.role,
      active: Boolean(userInput.active),
      territory: (userInput.territory || '').trim().slice(0, 120),
      vehicleNo: (userInput.vehicleNo || '').trim().slice(0, 64),
    };
    mutateState((prev) => ({
      ...prev,
      users: [...prev.users, newUser],
    }));
    return { ok: true, data: newUser };
  };

  const updateUser = (updated: StaffUser): ActionResult => {
    const cleanUsername = updated.username.trim();
    const cleanPassword = (updated.password || '').trim();
    const cleanName = (updated.name || '').trim();
    if (!cleanName) {
      return { ok: false, error: 'Full name is required.' };
    }
    if (!cleanUsername) {
      return { ok: false, error: 'Username is required.' };
    }
    if (cleanPassword.length < 3) {
      return { ok: false, error: 'Password must be at least 3 characters.' };
    }
    if (
      stateRef.current.users.some(
        (u) =>
          u.id !== updated.id &&
          u.username.trim().toLowerCase() === cleanUsername.toLowerCase()
      )
    ) {
      return { ok: false, error: `Username "${cleanUsername}" is already taken.` };
    }
    const cleanUser: StaffUser = {
      id: updated.id,
      username: cleanUsername.slice(0, 64),
      password: cleanPassword.slice(0, 128),
      name: cleanName.slice(0, 120),
      email: (updated.email || '').trim().slice(0, 160),
      phone: (updated.phone || '').trim().slice(0, 40),
      role: updated.role,
      active: Boolean(updated.active),
      territory: (updated.territory || '').trim().slice(0, 120),
      vehicleNo: (updated.vehicleNo || '').trim().slice(0, 64),
    };
    mutateState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === updated.id ? cleanUser : u)),
    }));
    return { ok: true };
  };

  const deleteUser = (userId: string): ActionResult => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can delete users.' };
    }
    const target = stateRef.current.users.find((u) => u.id === userId);
    if (!target) {
      return { ok: false, error: 'User not found.' };
    }
    if (target.id === currentUser.id) {
      return { ok: false, error: 'You cannot delete your own currently signed-in Admin account.' };
    }
    if (target.role === 'ADMIN') {
      const remainingAdmins = stateRef.current.users.filter(
        (u) => u.id !== userId && u.role === 'ADMIN' && u.active
      );
      if (remainingAdmins.length === 0) {
        return { ok: false, error: 'Cannot delete the last remaining active Admin account.' };
      }
    }
    mutateState((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== userId),
      dayLocks: prev.dayLocks.filter((rec) => rec.userId !== userId),
    }));
    return { ok: true };
  };

  const changeUserPassword = (userId: string, newPassword: string): ActionResult => {
    const cleanPassword = (newPassword || '').trim();
    if (cleanPassword.length < 3) {
      return { ok: false, error: 'Password must be at least 3 characters.' };
    }
    const target = stateRef.current.users.find((u) => u.id === userId);
    if (!target) return { ok: false, error: 'User not found.' };
    mutateState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === userId ? { ...u, password: cleanPassword.slice(0, 128) } : u
      ),
    }));
    return { ok: true };
  };

  const changeOwnAdminPassword = (
    currentPassword: string,
    newPassword: string
  ): ActionResult => {
    if (!currentUser) return { ok: false, error: 'Not signed in.' };
    if (
      currentUser.password !== currentPassword &&
      currentUser.password.trim() !== currentPassword.trim()
    ) {
      return { ok: false, error: 'Current password is incorrect.' };
    }
    const cleanNew = (newPassword || '').trim();
    if (cleanNew.length < 3) {
      return { ok: false, error: 'New password must be at least 3 characters.' };
    }
    mutateState((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === currentUser.id ? { ...u, password: cleanNew.slice(0, 128) } : u
      ),
    }));
    return { ok: true };
  };

  const addProductCategory = (name: string): ActionResult<string> => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can create product categories.' };
    }
    const clean = name.trim();
    if (!clean) {
      return { ok: false, error: 'Category name is required.' };
    }
    if (
      stateRef.current.productCategories.some((c) => c.toLowerCase() === clean.toLowerCase())
    ) {
      return { ok: false, error: `Category "${clean}" already exists.` };
    }
    mutateState((prev) => ({
      ...prev,
      productCategories: [...prev.productCategories, clean],
    }));
    return { ok: true, data: clean };
  };

  const deleteProductCategory = (name: string): ActionResult => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can remove product categories.' };
    }
    mutateState((prev) => ({
      ...prev,
      productCategories: prev.productCategories.filter((c) => c !== name),
    }));
    return { ok: true };
  };

  const addProduct = (
    prodInput: Omit<Product, 'id' | 'inTransitStock' | 'damagedStock'>
  ): ActionResult<Product> => {
    const cleanSku = prodInput.sku.trim().toUpperCase();
    const cleanName = prodInput.name.trim();
    if (!cleanSku || !cleanName) {
      return { ok: false, error: 'Product SKU and name are required.' };
    }
    if (
      stateRef.current.products.some(
        (p) => p.sku.toLowerCase() === cleanSku.toLowerCase()
      )
    ) {
      return { ok: false, error: 'A product with this SKU already exists.' };
    }
    const newProduct: Product = {
      id: makeDocId('prod'),
      sku: cleanSku.slice(0, 64),
      name: cleanName.slice(0, 160),
      category: (prodInput.category || '').trim().slice(0, 80),
      unit: (prodInput.unit || 'Unit').trim().slice(0, 40) || 'Unit',
      unitCost: Math.max(0, Number(prodInput.unitCost) || 0),
      sellingPrice: Math.max(0, Number(prodInput.sellingPrice) || 0),
      sellableStock: Math.max(0, Math.floor(Number(prodInput.sellableStock) || 0)),
      inTransitStock: 0,
      damagedStock: 0,
    };
    mutateState((prev) => ({
      ...prev,
      products: [...prev.products, newProduct],
    }));
    return { ok: true, data: newProduct };
  };

  const updateProduct = (updated: Product): ActionResult => {
    const cleanSku = updated.sku.trim().toUpperCase();
    const cleanName = updated.name.trim();
    if (!cleanSku || !cleanName) {
      return { ok: false, error: 'Product SKU and name are required.' };
    }
    if (
      stateRef.current.products.some(
        (p) => p.id !== updated.id && p.sku.toLowerCase() === cleanSku.toLowerCase()
      )
    ) {
      return { ok: false, error: `Another product already uses SKU "${cleanSku}".` };
    }
    const cleanProduct: Product = {
      id: updated.id,
      sku: cleanSku.slice(0, 64),
      name: cleanName.slice(0, 160),
      category: (updated.category || '').trim().slice(0, 80),
      unit: (updated.unit || 'Unit').trim().slice(0, 40) || 'Unit',
      unitCost: Math.max(0, Number(updated.unitCost) || 0),
      sellingPrice: Math.max(0, Number(updated.sellingPrice) || 0),
      sellableStock: Math.max(0, Math.floor(Number(updated.sellableStock) || 0)),
      inTransitStock: Math.max(0, Math.floor(Number(updated.inTransitStock) || 0)),
      damagedStock: Math.max(0, Math.floor(Number(updated.damagedStock) || 0)),
    };
    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => (p.id === updated.id ? cleanProduct : p)),
    }));
    return { ok: true };
  };

  const deleteProduct = (productId: string): ActionResult => {
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return { ok: false, error: 'Only Admin can delete products.' };
    }
    const target = stateRef.current.products.find((p) => p.id === productId);
    if (!target) {
      return { ok: false, error: 'Product not found.' };
    }
    const activeOrdersUsingProduct = stateRef.current.orders.filter(
      (o) =>
        (o.status === 'PENDING_DISPATCH' || o.status === 'IN_TRANSIT') &&
        o.items.some((item) => item.productId === productId)
    );
    if (target.inTransitStock > 0 || activeOrdersUsingProduct.length > 0) {
      return {
        ok: false,
        error: `Cannot delete ${target.sku} while it is in transit or included in pending dispatch orders.`,
      };
    }
    mutateState((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== productId),
    }));
    return { ok: true };
  };

  const updateProductPrices = (
    productId: string,
    unitCost: number,
    sellingPrice: number
  ): ActionResult => {
    if (isNaN(unitCost) || isNaN(sellingPrice) || unitCost < 0 || sellingPrice < 0) {
      return { ok: false, error: 'Prices must be valid non-negative amounts.' };
    }
    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              unitCost: Number(unitCost.toFixed(2)),
              sellingPrice: Number(sellingPrice.toFixed(2)),
            }
          : p
      ),
    }));
    return { ok: true };
  };

  const generateRTVDebitNote = (manufacturerName: string): ActionResult<RTVRecord> => {
    const damagedProducts = stateRef.current.products.filter((p) => p.damagedStock > 0);
    if (damagedProducts.length === 0) {
      return { ok: false, error: 'No damaged stock available to return.' };
    }
    const items: RTVItem[] = damagedProducts.map((p) => ({
      productId: p.id,
      sku: p.sku,
      productName: p.name,
      qty: p.damagedStock,
      unitCost: p.unitCost,
      claimAmount: Number((p.damagedStock * p.unitCost).toFixed(2)),
    }));
    const totalClaimAmount = Number(
      items.reduce((sum, i) => sum + i.claimAmount, 0).toFixed(2)
    );
    const debitNoteNo = `RTV-2611-${String(stateRef.current.rtvs.length + 1).padStart(3, '0')}`;
    const record: RTVRecord = {
      id: makeDocId('rtv'),
      debitNoteNo,
      manufacturerName: (manufacturerName.trim() || 'Primary Manufacturer').slice(0, 160),
      createdAt: new Date().toISOString(),
      createdBy: (currentUser?.name ?? 'Admin').slice(0, 120),
      items,
      totalClaimAmount,
    };
    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.damagedStock > 0 ? { ...p, damagedStock: 0 } : p
      ),
      rtvs: [record, ...prev.rtvs],
    }));
    return { ok: true, data: record };
  };

  const receiveStockGRN = (
    supplierName: string,
    referenceNo: string,
    items: { productId: string; qty: number }[],
    invoiceImageDataUrl: string,
    invoiceImageName?: string
  ): ActionResult<GRNRecord> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    if (!invoiceImageDataUrl || !invoiceImageDataUrl.startsWith('data:image/')) {
      return {
        ok: false,
        error: 'Supplier invoice picture is required before posting GRN stock.',
      };
    }
    if (invoiceImageDataUrl.length > 600000) {
      return {
        ok: false,
        error: 'Supplier invoice picture is too large. Please capture or choose a smaller image.',
      };
    }

    const validItems = items.filter((i) => i.qty > 0);
    if (validItems.length === 0) {
      return { ok: false, error: 'Enter at least one product quantity greater than zero.' };
    }
    const grnItems: GRNItem[] = [];
    for (const entry of validItems) {
      const prod = stateRef.current.products.find((p) => p.id === entry.productId);
      if (!prod) continue;
      grnItems.push({
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        qty: entry.qty,
        unitCost: prod.unitCost,
      });
    }
    const totalValue = Number(
      grnItems.reduce((sum, i) => sum + i.qty * i.unitCost, 0).toFixed(2)
    );
    const record: GRNRecord = {
      id: makeDocId('grn'),
      referenceNo: (referenceNo.trim() || `GRN-${Date.now().toString().slice(-5)}`).slice(0, 80),
      supplierName: (supplierName.trim() || 'Manufacturer Supply').slice(0, 160),
      receivedAt: getOperationalTimestamp(),
      receivedBy: (currentUser?.name ?? 'Warehouse Manager').slice(0, 120),
      items: grnItems,
      totalValue,
      invoiceImageDataUrl,
      invoiceImageName: (invoiceImageName?.trim() || 'supplier-invoice.jpg').slice(0, 160),
    };
    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        const match = grnItems.find((i) => i.productId === p.id);
        return match ? { ...p, sellableStock: p.sellableStock + match.qty } : p;
      }),
      grns: [record, ...prev.grns],
    }));
    return { ok: true, data: record };
  };

  const updateProductStock = (
    productId: string,
    sellableStock: number,
    damagedStock: number
  ): ActionResult => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    if (
      !currentUser ||
      (currentUser.role !== 'WAREHOUSE_MANAGER' && currentUser.role !== 'ADMIN')
    ) {
      return { ok: false, error: 'Only Warehouse Manager or Admin can update stock.' };
    }
    if (
      isNaN(sellableStock) ||
      isNaN(damagedStock) ||
      sellableStock < 0 ||
      damagedStock < 0
    ) {
      return { ok: false, error: 'Stock quantities must be non-negative numbers.' };
    }
    const target = stateRef.current.products.find((p) => p.id === productId);
    if (!target) {
      return { ok: false, error: 'Product not found.' };
    }

    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              sellableStock: Math.floor(sellableStock),
              damagedStock: Math.floor(damagedStock),
            }
          : p
      ),
    }));
    return { ok: true };
  };

  const dispatchOrder = (orderId: string, deliverymanId: string): ActionResult => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return lockCheck;

    const order = stateRef.current.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.status !== 'PENDING_DISPATCH') {
      return { ok: false, error: 'Order is no longer pending dispatch.' };
    }
    const driver = stateRef.current.users.find(
      (u) => u.id === deliverymanId && u.role === 'DELIVERYMAN'
    );
    if (!driver) return { ok: false, error: 'Select a valid deliveryman.' };

    for (const item of order.items) {
      const prod = stateRef.current.products.find((p) => p.id === item.productId);
      if (!prod || prod.sellableStock < item.orderedQty) {
        return {
          ok: false,
          error: `Insufficient sellable stock for ${item.productName}. Available: ${prod?.sellableStock ?? 0}, Required: ${item.orderedQty}.`,
        };
      }
    }

    const opTime = getOperationalTimestamp();
    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        const orderItem = order.items.find((i) => i.productId === p.id);
        if (!orderItem) return p;
        return {
          ...p,
          sellableStock: p.sellableStock - orderItem.orderedQty,
          inTransitStock: p.inTransitStock + orderItem.orderedQty,
        };
      }),
      orders: prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'IN_TRANSIT',
              deliverymanId: driver.id,
              deliverymanName: driver.name,
              dispatchedAt: opTime,
            }
          : o
      ),
    }));
    return { ok: true };
  };

  const reconcileRoute = (
    deliverymanId: string,
    orderIds: string[],
    splits: Record<string, { returnedToSellable: number; movedToDamaged: number }>
  ): ActionResult<{ reconciliation: ReconciliationRecord; finalInvoice: FinalInvoice }> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    const driver = stateRef.current.users.find((u) => u.id === deliverymanId);
    const targetOrders = stateRef.current.orders.filter(
      (o) =>
        orderIds.includes(o.id) &&
        o.deliverymanId === deliverymanId &&
        (o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY') &&
        !o.reconciled
    );
    if (targetOrders.length === 0) {
      return { ok: false, error: 'No unreconciled completed orders selected.' };
    }

    const aggregated = new Map<
      string,
      {
        productId: string;
        sku: string;
        productName: string;
        dispatchedQty: number;
        deliveredQty: number;
      }
    >();

    for (const order of targetOrders) {
      for (const item of order.items) {
        const prev = aggregated.get(item.productId) ?? {
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          dispatchedQty: 0,
          deliveredQty: 0,
        };
        prev.dispatchedQty += item.orderedQty;
        prev.deliveredQty += item.deliveredQty;
        aggregated.set(item.productId, prev);
      }
    }

    const recItems: ReconciliationItem[] = [];
    for (const row of aggregated.values()) {
      const unsoldReturnQty = Math.max(0, row.dispatchedQty - row.deliveredQty);
      const split = splits[row.productId] ?? {
        returnedToSellable: unsoldReturnQty,
        movedToDamaged: 0,
      };
      if (split.returnedToSellable + split.movedToDamaged !== unsoldReturnQty) {
        return {
          ok: false,
          error: `Split quantities for ${row.productName} must equal ${unsoldReturnQty} unsold units.`,
        };
      }
      recItems.push({
        productId: row.productId,
        sku: row.sku,
        productName: row.productName,
        dispatchedQty: row.dispatchedQty,
        deliveredQty: row.deliveredQty,
        unsoldReturnQty,
        returnedToSellable: split.returnedToSellable,
        movedToDamaged: split.movedToDamaged,
      });
    }

    const nowIso = getOperationalTimestamp();
    const recId = makeDocId('rec');
    const finalInvoiceId = makeDocId('finv');
    const invoiceNumber = `FINV-2611-${String(stateRef.current.finalInvoices.length + 1).padStart(3, '0')}`;

    const orderSummaries: FinalInvoiceOrderSummary[] = targetOrders.map((o) => {
      const deliveredAmount = o.items.reduce(
        (sum, i) => sum + i.deliveredQty * i.unitPrice,
        0
      );
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        storeId: o.storeId,
        storeName: o.storeName,
        orderedAmount: o.totalOrderedAmount,
        deliveredAmount: Number(deliveredAmount.toFixed(2)),
        returnCreditAmount: o.returnCreditAmount,
        netPayableAmount: o.netPayableAmount,
        cashCollectedByDriver: o.cashCollected,
        dueAdded: o.dueAdded,
      };
    });

    const totalOrderedAmount = Number(
      orderSummaries.reduce((s, o) => s + o.orderedAmount, 0).toFixed(2)
    );
    const totalDeliveredAmount = Number(
      orderSummaries.reduce((s, o) => s + o.deliveredAmount, 0).toFixed(2)
    );
    const totalReturnCredit = Number(
      orderSummaries.reduce((s, o) => s + o.returnCreditAmount, 0).toFixed(2)
    );
    const netFinalPayable = Number(
      orderSummaries.reduce((s, o) => s + o.netPayableAmount, 0).toFixed(2)
    );
    const expectedCashFromWarehouse = Number(
      orderSummaries.reduce((s, o) => s + o.cashCollectedByDriver, 0).toFixed(2)
    );

    const reconciliation: ReconciliationRecord = {
      id: recId,
      deliverymanId,
      deliverymanName: (driver?.name ?? 'Deliveryman').slice(0, 120),
      reconciledAt: nowIso,
      reconciledBy: (currentUser?.name ?? 'Warehouse Manager').slice(0, 120),
      orderIds: targetOrders.map((o) => o.id),
      finalInvoiceId,
      finalInvoiceNumber: invoiceNumber,
      items: recItems,
    };

    const finalInvoice: FinalInvoice = {
      id: finalInvoiceId,
      invoiceNumber,
      reconciliationId: recId,
      deliverymanId,
      deliverymanName: (driver?.name ?? 'Deliveryman').slice(0, 120),
      createdAt: nowIso,
      createdBy: (currentUser?.name ?? 'Warehouse Manager').slice(0, 120),
      orders: orderSummaries,
      items: recItems,
      totalOrderedAmount,
      totalDeliveredAmount,
      totalReturnCredit,
      netFinalPayable,
      expectedCashFromWarehouse,
      cashSettled: false,
    };

    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        const rec = recItems.find((i) => i.productId === p.id);
        if (!rec) return p;
        return {
          ...p,
          inTransitStock: Math.max(0, p.inTransitStock - rec.unsoldReturnQty),
          sellableStock: p.sellableStock + rec.returnedToSellable,
          damagedStock: p.damagedStock + rec.movedToDamaged,
        };
      }),
      orders: prev.orders.map((o) =>
        targetOrders.some((t) => t.id === o.id)
          ? {
              ...o,
              reconciled: true,
              finalInvoiceId,
              finalInvoiceNumber: invoiceNumber,
            }
          : o
      ),
      reconciliations: [reconciliation, ...prev.reconciliations],
      finalInvoices: [finalInvoice, ...prev.finalInvoices],
    }));

    return { ok: true, data: { reconciliation, finalInvoice } };
  };

  const addStore = (
    storeInput: Omit<RetailStore, 'id' | 'creditBalance' | 'createdAt'>
  ): ActionResult<RetailStore> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    if (!storeInput.name.trim()) {
      return { ok: false, error: 'Store name is required.' };
    }

    const newStore: RetailStore = {
      id: makeDocId('store'),
      name: storeInput.name.trim().slice(0, 160),
      ownerName: (storeInput.ownerName || '').trim().slice(0, 120),
      phone: (storeInput.phone || '').trim().slice(0, 40),
      address: (storeInput.address || '').trim().slice(0, 300),
      zone: (storeInput.zone || '').trim().slice(0, 80),
      lat: storeInput.lat ?? null,
      lng: storeInput.lng ?? null,
      creditBalance: 0,
      createdAt: getOperationalTimestamp(),
    };
    mutateState((prev) => ({
      ...prev,
      stores: [newStore, ...prev.stores],
    }));
    return { ok: true, data: newStore };
  };

  const updateStore = (
    storeId: string,
    updates: Omit<RetailStore, 'id' | 'creditBalance' | 'createdAt'>
  ): ActionResult<RetailStore> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    const existing = stateRef.current.stores.find((s) => s.id === storeId);
    if (!existing) {
      return { ok: false, error: 'Store not found.' };
    }
    if (!updates.name.trim() || !updates.ownerName.trim()) {
      return { ok: false, error: 'Store name and owner name are required.' };
    }

    const updatedStore: RetailStore = {
      ...existing,
      name: updates.name.trim().slice(0, 160),
      ownerName: updates.ownerName.trim().slice(0, 120),
      phone: (updates.phone || '').trim().slice(0, 40),
      address: (updates.address || '').trim().slice(0, 300),
      zone: (updates.zone || '').trim().slice(0, 80),
      lat: updates.lat ?? null,
      lng: updates.lng ?? null,
    };

    mutateState((prev) => ({
      ...prev,
      stores: prev.stores.map((s) => (s.id === storeId ? updatedStore : s)),
    }));
    return { ok: true, data: updatedStore };
  };

  const updateStoreCoordinates = (storeId: string, lat: number, lng: number) => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return;
    mutateState((prev) => ({
      ...prev,
      stores: prev.stores.map((s) => (s.id === storeId ? { ...s, lat, lng } : s)),
    }));
  };

  const createOrder = (
    storeId: string,
    items: { productId: string; qty: number }[],
    autoCoords?: { lat: number; lng: number } | null
  ): ActionResult<Order> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    const store = stateRef.current.stores.find((s) => s.id === storeId);
    if (!store) return { ok: false, error: 'Select a retail store.' };
    const validItems = items.filter((i) => i.qty > 0);
    if (validItems.length === 0) {
      return { ok: false, error: 'Add at least one product with quantity > 0.' };
    }

    const orderItems: OrderItem[] = [];
    for (const entry of validItems) {
      const prod = stateRef.current.products.find((p) => p.id === entry.productId);
      if (!prod) continue;
      if (entry.qty > prod.sellableStock) {
        return {
          ok: false,
          error: `Requested quantity (${entry.qty}) exceeds sellable stock (${prod.sellableStock}) for ${prod.name}.`,
        };
      }
      orderItems.push({
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        unit: prod.unit,
        unitPrice: prod.sellingPrice,
        orderedQty: entry.qty,
        deliveredQty: 0,
        damagedReturnQty: 0,
      });
    }

    const totalOrderedAmount = Number(
      orderItems.reduce((sum, i) => sum + i.orderedQty * i.unitPrice, 0).toFixed(2)
    );
    const nextNum = 1001 + stateRef.current.orders.length;
    const newOrder: Order = {
      id: makeDocId('ord'),
      orderNumber: `ORD-2611-${nextNum}`,
      storeId: store.id,
      storeName: store.name,
      salesRepId: currentUser?.id ?? 'usr-sales-1',
      salesRepName: (currentUser?.name ?? 'Sales Representative').slice(0, 120),
      createdAt: getOperationalTimestamp(),
      status: 'PENDING_DISPATCH',
      items: orderItems,
      totalOrderedAmount,
      returnCreditAmount: 0,
      netPayableAmount: totalOrderedAmount,
      cashCollected: 0,
      dueAdded: 0,
      reconciled: false,
      cashSettled: false,
    };

    mutateState((prev) => ({
      ...prev,
      stores:
        (store.lat === null || store.lng === null) && autoCoords
          ? prev.stores.map((s) =>
              s.id === store.id
                ? { ...s, lat: autoCoords.lat, lng: autoCoords.lng }
                : s
            )
          : prev.stores,
      orders: [newOrder, ...prev.orders],
    }));

    return { ok: true, data: newOrder };
  };

  const completeDelivery = (
    orderId: string,
    executions: Record<string, { deliveredQty: number; damagedReturnQty: number }>,
    cashCollected: number
  ): ActionResult<Order> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    const order = stateRef.current.orders.find((o) => o.id === orderId);
    if (!order) return { ok: false, error: 'Order not found.' };
    if (order.status !== 'IN_TRANSIT') {
      return { ok: false, error: 'Only in-transit orders can be executed.' };
    }

    let deliveredGross = 0;
    let returnCredit = 0;
    let isPartial = false;

    const updatedItems: OrderItem[] = order.items.map((item) => {
      const exec = executions[item.productId] ?? {
        deliveredQty: item.orderedQty,
        damagedReturnQty: 0,
      };
      const deliveredQty = Math.max(0, Math.min(item.orderedQty, exec.deliveredQty));
      const damagedReturnQty = Math.max(0, exec.damagedReturnQty);
      if (deliveredQty < item.orderedQty) {
        isPartial = true;
      }
      deliveredGross += deliveredQty * item.unitPrice;
      returnCredit += damagedReturnQty * item.unitPrice;
      return {
        ...item,
        deliveredQty,
        damagedReturnQty,
      };
    });

    const netPayable = Number(Math.max(0, deliveredGross - returnCredit).toFixed(2));
    const safeCash = Number(Math.max(0, cashCollected).toFixed(2));
    const dueAdded = Number(Math.max(0, netPayable - safeCash).toFixed(2));

    const updatedOrder: Order = {
      ...order,
      status: isPartial ? 'PARTIAL_DELIVERY' : 'DELIVERED',
      deliveredAt: getOperationalTimestamp(),
      items: updatedItems,
      returnCreditAmount: Number(returnCredit.toFixed(2)),
      netPayableAmount: netPayable,
      cashCollected: safeCash,
      dueAdded,
      reconciled: false,
    };

    mutateState((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        const item = updatedItems.find((i) => i.productId === p.id);
        if (!item) return p;
        return {
          ...p,
          inTransitStock: Math.max(0, p.inTransitStock - item.deliveredQty),
          damagedStock: p.damagedStock + item.damagedReturnQty,
        };
      }),
      stores: prev.stores.map((s) =>
        s.id === order.storeId
          ? { ...s, creditBalance: Number((s.creditBalance + dueAdded).toFixed(2)) }
          : s
      ),
      orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
    }));

    return { ok: true, data: updatedOrder };
  };

  const settleFinalInvoice = (
    finalInvoiceId: string,
    physicalCash: number
  ): ActionResult<SettlementRecord> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    const inv = stateRef.current.finalInvoices.find((f) => f.id === finalInvoiceId);
    if (!inv) return { ok: false, error: 'Final Invoice not found.' };
    if (inv.cashSettled) {
      return { ok: false, error: 'Cash has already been received for this Final Invoice.' };
    }

    const expectedCash = inv.expectedCashFromWarehouse;
    const safePhysical = Number(Math.max(0, physicalCash).toFixed(2));
    const variance = Number((safePhysical - expectedCash).toFixed(2));
    const settledAt = getOperationalTimestamp();
    const orderIds = inv.orders.map((o) => o.orderId);

    const settlement: SettlementRecord = {
      id: makeDocId('set'),
      deliverymanId: inv.deliverymanId,
      deliverymanName: inv.deliverymanName,
      settledAt,
      settledBy: (currentUser?.name ?? ROLE_LABELS.CASHIER).slice(0, 120),
      finalInvoiceId: inv.id,
      finalInvoiceNumber: inv.invoiceNumber,
      orderIds,
      expectedCash,
      physicalCash: safePhysical,
      variance,
    };

    const cashEntry: CashbookEntry = {
      id: makeDocId('cb'),
      timestamp: settledAt,
      type: 'INFLOW',
      category: 'DELIVERY_SETTLEMENT',
      description: `Cash received against Final Invoice ${inv.invoiceNumber} (${inv.createdBy} / ${inv.deliverymanName})`.slice(0, 300),
      referenceId: inv.invoiceNumber,
      amount: safePhysical,
      recordedBy: (currentUser?.name ?? ROLE_LABELS.CASHIER).slice(0, 120),
      deliverymanId: inv.deliverymanId,
      variance,
    };

    mutateState((prev) => ({
      ...prev,
      finalInvoices: prev.finalInvoices.map((f) =>
        f.id === finalInvoiceId
          ? {
              ...f,
              cashSettled: true,
              cashReceivedByCashier: safePhysical,
              variance,
              settledAt,
              settledBy: (currentUser?.name ?? ROLE_LABELS.CASHIER).slice(0, 120),
            }
          : f
      ),
      orders: prev.orders.map((o) =>
        orderIds.includes(o.id) ? { ...o, cashSettled: true } : o
      ),
      settlements: [settlement, ...prev.settlements],
      cashbook: [cashEntry, ...prev.cashbook],
    }));

    return { ok: true, data: settlement };
  };

  const settleDeliverymanCash = (
    deliverymanId: string,
    orderIds: string[],
    physicalCash: number
  ): ActionResult<SettlementRecord> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    const driver = stateRef.current.users.find((u) => u.id === deliverymanId);
    const targetOrders = stateRef.current.orders.filter(
      (o) =>
        orderIds.includes(o.id) &&
        o.deliverymanId === deliverymanId &&
        (o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY') &&
        !o.cashSettled
    );
    if (targetOrders.length === 0) {
      return { ok: false, error: 'No unsettled deliveries selected for this driver.' };
    }
    const expectedCash = Number(
      targetOrders.reduce((sum, o) => sum + o.cashCollected, 0).toFixed(2)
    );
    const safePhysical = Number(Math.max(0, physicalCash).toFixed(2));
    const variance = Number((safePhysical - expectedCash).toFixed(2));
    const settledAt = getOperationalTimestamp();

    const settlement: SettlementRecord = {
      id: makeDocId('set'),
      deliverymanId,
      deliverymanName: (driver?.name ?? 'Deliveryman').slice(0, 120),
      settledAt,
      settledBy: (currentUser?.name ?? ROLE_LABELS.CASHIER).slice(0, 120),
      orderIds: targetOrders.map((o) => o.id),
      expectedCash,
      physicalCash: safePhysical,
      variance,
    };

    const cashEntry: CashbookEntry = {
      id: makeDocId('cb'),
      timestamp: settledAt,
      type: 'INFLOW',
      category: 'DELIVERY_SETTLEMENT',
      description: `Cash settlement — ${driver?.name ?? 'Deliveryman'} (${targetOrders.length} stops)`.slice(0, 300),
      referenceId: settlement.id.toUpperCase(),
      amount: safePhysical,
      recordedBy: (currentUser?.name ?? ROLE_LABELS.CASHIER).slice(0, 120),
      deliverymanId,
      variance,
    };

    mutateState((prev) => ({
      ...prev,
      orders: prev.orders.map((o) =>
        targetOrders.some((t) => t.id === o.id) ? { ...o, cashSettled: true } : o
      ),
      settlements: [settlement, ...prev.settlements],
      cashbook: [cashEntry, ...prev.cashbook],
    }));

    return { ok: true, data: settlement };
  };

  const collectStoreDue = (
    storeId: string,
    amount: number,
    referenceId?: string
  ): ActionResult<CashbookEntry> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    const store = stateRef.current.stores.find((s) => s.id === storeId);
    if (!store) return { ok: false, error: 'Store not found.' };
    if (amount <= 0) return { ok: false, error: 'Payment amount must be greater than 0.' };
    if (amount > store.creditBalance + 0.01) {
      return { ok: false, error: 'Payment exceeds store credit balance.' };
    }

    const cleanAmount = Number(Math.min(store.creditBalance, amount).toFixed(2));
    const entry: CashbookEntry = {
      id: makeDocId('cb'),
      timestamp: getOperationalTimestamp(),
      type: 'INFLOW',
      category: 'DUE_COLLECTION',
      description: `Store credit payment — ${store.name}`.slice(0, 300),
      referenceId: (referenceId?.trim() || `PAY-${Date.now().toString().slice(-4)}`).slice(0, 128),
      amount: cleanAmount,
      recordedBy: (currentUser?.name ?? ROLE_LABELS.CASHIER).slice(0, 120),
      storeId: store.id,
    };

    mutateState((prev) => ({
      ...prev,
      stores: prev.stores.map((s) =>
        s.id === storeId
          ? {
              ...s,
              creditBalance: Number(Math.max(0, s.creditBalance - cleanAmount).toFixed(2)),
            }
          : s
      ),
      cashbook: [entry, ...prev.cashbook],
    }));

    return { ok: true, data: entry };
  };

  const recordExpense = (
    category: Extract<CashbookCategory, 'FUEL_EXPENSE' | 'OTHER_EXPENSE'>,
    description: string,
    amount: number,
    deliverymanId?: string,
    referenceId?: string
  ): ActionResult<CashbookEntry> => {
    const lockCheck = ensureDayUnlocked();
    if (!lockCheck.ok) return { ok: false, error: lockCheck.error };

    if (amount <= 0) return { ok: false, error: 'Expense amount must be greater than 0.' };
    if (!description.trim()) return { ok: false, error: 'Enter an expense description.' };

    const entry: CashbookEntry = {
      id: makeDocId('cb'),
      timestamp: getOperationalTimestamp(),
      type: 'OUTFLOW',
      category,
      description: description.trim().slice(0, 300),
      referenceId: (referenceId?.trim() || `EXP-${Date.now().toString().slice(-4)}`).slice(0, 128),
      amount: Number(amount.toFixed(2)),
      recordedBy: (currentUser?.name ?? ROLE_LABELS.CASHIER).slice(0, 120),
      deliverymanId,
    };

    mutateState((prev) => ({
      ...prev,
      cashbook: [entry, ...prev.cashbook],
    }));

    return { ok: true, data: entry };
  };

  return (
    <DMSContext.Provider
      value={{
        state,
        isCloudReady,
        currentUser,
        currentTimeMs,
        simulateAfter8PM,
        setSimulateAfter8PM,
        loginWithCredentials,
        logout,
        resetDemoData,
        getWorkDayStatus,
        getCashierMismatchSummary,
        finishToday,
        activateOneHourFinishWindow,
        rescheduleInvoiceSettlementDate,
        updateCompanyProfile,
        setPrintTemplate,
        addUser,
        updateUser,
        deleteUser,
        changeUserPassword,
        changeOwnAdminPassword,
        addProductCategory,
        deleteProductCategory,
        addProduct,
        updateProduct,
        deleteProduct,
        updateProductPrices,
        generateRTVDebitNote,
        receiveStockGRN,
        updateProductStock,
        dispatchOrder,
        reconcileRoute,
        addStore,
        updateStore,
        updateStoreCoordinates,
        createOrder,
        completeDelivery,
        settleFinalInvoice,
        settleDeliverymanCash,
        collectStoreDue,
        recordExpense,
      }}
    >
      {children}
    </DMSContext.Provider>
  );
};

export const useDMS = (): DMSContextValue => {
  const ctx = useContext(DMSContext);
  if (!ctx) throw new Error('useDMS must be used inside DMSProvider');
  return ctx;
};
