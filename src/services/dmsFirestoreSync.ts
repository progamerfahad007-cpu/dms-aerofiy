import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  Unsubscribe,
  where,
  writeBatch,
} from 'firebase/firestore';
import { createSeedData } from '../data/seedData';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CashbookEntry,
  CompanyProfile,
  DayLockRecord,
  DMSState,
  FinalInvoice,
  GRNRecord,
  Order,
  PrintTemplateId,
  Product,
  ReconciliationRecord,
  RetailStore,
  RTVRecord,
  SettlementRecord,
  StaffUser,
} from '../types/dms';

export const COLLECTIONS = {
  users: 'dms_users',
  products: 'dms_products',
  stores: 'dms_stores',
  orders: 'dms_orders',
  grns: 'dms_grns',
  reconciliations: 'dms_reconciliations',
  finalInvoices: 'dms_final_invoices',
  rtvs: 'dms_rtvs',
  cashbook: 'dms_cashbook',
  settlements: 'dms_settlements',
  dayLocks: 'dms_day_locks',
  settings: 'dms_settings',
} as const;

type ArrayCollectionKey =
  | 'users'
  | 'products'
  | 'stores'
  | 'orders'
  | 'grns'
  | 'reconciliations'
  | 'finalInvoices'
  | 'rtvs'
  | 'cashbook'
  | 'settlements'
  | 'dayLocks';

const COLLECTION_KEYS: ArrayCollectionKey[] = [
  'users',
  'products',
  'stores',
  'orders',
  'grns',
  'reconciliations',
  'finalInvoices',
  'rtvs',
  'cashbook',
  'settlements',
  'dayLocks',
];

/** Recursively strips undefined keys so Firestore never rejects optional fields. */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(stripUndefined(a)) === JSON.stringify(stripUndefined(b));
}

function sortDescByIso<T>(items: T[], getIso: (item: T) => string): T[] {
  return [...items].sort(
    (a, b) => new Date(getIso(b)).getTime() - new Date(getIso(a)).getTime()
  );
}

/**
 * Ensures the Firestore database has the initial Admin account and settings document
 * on first boot when the cloud database is completely empty.
 */
export async function ensureCloudSeeded(): Promise<void> {
  const settingsRef = doc(db, COLLECTIONS.settings, 'main');
  try {
    const settingsSnap = await getDoc(settingsRef);
    const usersSnap = await getDocs(
      query(collection(db, COLLECTIONS.users), where('id', '>=', ''))
    );

    const seed = createSeedData();
    const batch = writeBatch(db);
    let hasWrites = false;

    if (usersSnap.empty) {
      for (const user of seed.users) {
        batch.set(doc(db, COLLECTIONS.users, user.id), stripUndefined(user));
        hasWrites = true;
      }
    }

    if (!settingsSnap.exists()) {
      batch.set(
        settingsRef,
        stripUndefined({
          productCategories: seed.productCategories,
          companyProfile: seed.companyProfile,
          printTemplate: seed.printTemplate,
          initialized: true,
        })
      );
      hasWrites = true;
    }

    if (hasWrites) {
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'dms_settings/main');
  }
}

/**
 * Fetches the live staff user list directly from Firestore (used as an authoritative
 * check during login so newly created users on other browsers can log in immediately).
 */
export async function fetchUsersFromCloud(): Promise<StaffUser[]> {
  try {
    const snap = await getDocs(
      query(collection(db, COLLECTIONS.users), where('id', '>=', ''))
    );
    return snap.docs.map((d) => d.data() as StaffUser);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, COLLECTIONS.users);
    return [];
  }
}

/**
 * Subscribes to all 12 aerofiy DMS Firestore collections/documents in real time.
 * Every change made on any browser or Android device updates all connected clients immediately.
 */
export function subscribeToDMSCloud(
  onSliceUpdate: (updater: (prev: DMSState) => DMSState) => void,
  onInitialSyncComplete: () => void,
  onSyncError: (message: string) => void
): () => void {
  const unsubscribers: Unsubscribe[] = [];
  const loadedSlices = new Set<string>();
  const totalSlices = COLLECTION_KEYS.length + 1;
  let initialNotified = false;

  const markSliceLoaded = (key: string) => {
    loadedSlices.add(key);
    if (!initialNotified && loadedSlices.size >= totalSlices) {
      initialNotified = true;
      onInitialSyncComplete();
    }
  };

  const listenCollection = <T extends { id: string }>(
    stateKey: ArrayCollectionKey,
    sortFn?: (items: T[]) => T[]
  ) => {
    const colName = COLLECTIONS[stateKey];
    const q = query(collection(db, colName), where('id', '>=', ''));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => d.data() as T);
        const sorted = sortFn ? sortFn(docs) : docs;
        onSliceUpdate((prev) => {
          // Never wipe out the default Admin user while initial seed is in flight
          if (stateKey === 'users' && sorted.length === 0 && !initialNotified) {
            return prev;
          }
          return {
            ...prev,
            [stateKey]: sorted,
          };
        });
        markSliceLoaded(stateKey);
      },
      (error) => {
        const info = handleFirestoreError(error, OperationType.LIST, colName);
        onSyncError(info.error);
        markSliceLoaded(stateKey);
      }
    );
    unsubscribers.push(unsub);
  };

  listenCollection<StaffUser>('users', (items) =>
    [...items].sort((a, b) => a.username.localeCompare(b.username))
  );
  listenCollection<Product>('products', (items) =>
    [...items].sort((a, b) => a.sku.localeCompare(b.sku))
  );
  listenCollection<RetailStore>('stores', (items) =>
    sortDescByIso(items, (s) => s.createdAt)
  );
  listenCollection<Order>('orders', (items) => sortDescByIso(items, (o) => o.createdAt));
  listenCollection<GRNRecord>('grns', (items) => sortDescByIso(items, (g) => g.receivedAt));
  listenCollection<ReconciliationRecord>('reconciliations', (items) =>
    sortDescByIso(items, (r) => r.reconciledAt)
  );
  listenCollection<FinalInvoice>('finalInvoices', (items) =>
    sortDescByIso(items, (f) => f.createdAt)
  );
  listenCollection<RTVRecord>('rtvs', (items) => sortDescByIso(items, (r) => r.createdAt));
  listenCollection<CashbookEntry>('cashbook', (items) =>
    sortDescByIso(items, (c) => c.timestamp)
  );
  listenCollection<SettlementRecord>('settlements', (items) =>
    sortDescByIso(items, (s) => s.settledAt)
  );
  listenCollection<DayLockRecord>('dayLocks', (items) =>
    [...items].sort((a, b) => b.dateKey.localeCompare(a.dateKey))
  );

  // Settings singleton listener (categories, companyProfile, printTemplate)
  const settingsRef = doc(db, COLLECTIONS.settings, 'main');
  const settingsUnsub = onSnapshot(
    settingsRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as {
          productCategories?: string[];
          companyProfile?: CompanyProfile;
          printTemplate?: PrintTemplateId;
        };
        onSliceUpdate((prev) => ({
          ...prev,
          productCategories: Array.isArray(data.productCategories)
            ? data.productCategories
            : prev.productCategories,
          companyProfile: data.companyProfile
            ? { ...prev.companyProfile, ...data.companyProfile }
            : prev.companyProfile,
          printTemplate: data.printTemplate || prev.printTemplate,
        }));
      }
      markSliceLoaded('settings');
    },
    (error) => {
      const info = handleFirestoreError(error, OperationType.GET, 'dms_settings/main');
      onSyncError(info.error);
      markSliceLoaded('settings');
    }
  );
  unsubscribers.push(settingsUnsub);

  return () => {
    unsubscribers.forEach((u) => u());
  };
}

/**
 * Computes the exact document-level diff between prevState and nextState across
 * all 12 Firestore paths and commits all changes atomically in batched writes.
 */
export async function commitStateDiffToFirestore(
  prevState: DMSState,
  nextState: DMSState
): Promise<void> {
  const ops: Array<
    | { type: 'set'; col: string; id: string; data: Record<string, unknown> }
    | { type: 'delete'; col: string; id: string }
  > = [];

  for (const key of COLLECTION_KEYS) {
    const colName = COLLECTIONS[key];
    const prevList = (prevState[key] as Array<{ id: string }>) || [];
    const nextList = (nextState[key] as Array<{ id: string }>) || [];

    const prevMap = new Map(prevList.map((item) => [item.id, item]));
    const nextMap = new Map(nextList.map((item) => [item.id, item]));

    for (const [id, nextItem] of nextMap.entries()) {
      const prevItem = prevMap.get(id);
      if (!prevItem || !stableEqual(prevItem, nextItem)) {
        ops.push({
          type: 'set',
          col: colName,
          id,
          data: stripUndefined(nextItem) as Record<string, unknown>,
        });
      }
    }

    for (const id of prevMap.keys()) {
      if (!nextMap.has(id)) {
        ops.push({ type: 'delete', col: colName, id });
      }
    }
  }

  // Check settings document changes
  const settingsChanged =
    !stableEqual(prevState.productCategories, nextState.productCategories) ||
    !stableEqual(prevState.companyProfile, nextState.companyProfile) ||
    prevState.printTemplate !== nextState.printTemplate;

  if (settingsChanged) {
    ops.push({
      type: 'set',
      col: COLLECTIONS.settings,
      id: 'main',
      data: stripUndefined({
        productCategories: nextState.productCategories,
        companyProfile: nextState.companyProfile,
        printTemplate: nextState.printTemplate,
        initialized: true,
      }) as Record<string, unknown>,
    });
  }

  if (ops.length === 0) return;

  // Commit in safe chunks of up to 450 operations (Firestore batch limit is 500)
  const CHUNK_SIZE = 450;
  try {
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const slice = ops.slice(i, i + CHUNK_SIZE);
      if (slice.length === 1 && slice[0].type === 'set') {
        const op = slice[0];
        await setDoc(doc(db, op.col, op.id), op.data);
      } else {
        const batch = writeBatch(db);
        for (const op of slice) {
          const ref = doc(db, op.col, op.id);
          if (op.type === 'set') {
            batch.set(ref, op.data);
          } else {
            batch.delete(ref);
          }
        }
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, ops[0]?.col ?? 'dms_batch');
  }
}
