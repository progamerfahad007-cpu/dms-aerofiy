import React, { useMemo, useState } from 'react';
import {
  CalendarRange,
  FileBarChart2,
  Printer,
  Search,
  TrendingUp,
  Vault,
  Warehouse,
} from 'lucide-react';
import { toDateKey, useDMS } from '../../context/DMSContext';
import { CashbookCategory, OrderStatus } from '../../types/dms';
import {
  PrintableDocumentModal,
  PrintableReportData,
} from '../common/PrintableDocumentModal';
import { formatCurrency, OrderStatusBadge, StatusBadge } from '../common/StatusBadge';

type ReportTab = 'sales' | 'stock' | 'warehouse' | 'cashier' | 'delivery';
type WarehouseQueryType =
  | 'PENDING_DISPATCH'
  | 'IN_TRANSIT'
  | 'GRN_RECEIPTS'
  | 'RECONCILIATIONS'
  | 'FINAL_INVOICES'
  | 'RTV_CLAIMS';
type CashierQueryType =
  | 'FINAL_INVOICES'
  | 'CASHBOOK'
  | 'STORE_DUES'
  | 'EXPENSES'
  | 'SETTLEMENTS';

export const AdminReportsPanel: React.FC = () => {
  const { state } = useDMS();
  const today = toDateKey(new Date());

  const [reportTab, setReportTab] = useState<ReportTab>('sales');
  const [dateMode, setDateMode] = useState<'single' | 'range'>('range');
  const [singleDate, setSingleDate] = useState<string>(today);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');

  // Delivered Sales filters
  const [selectedSalesRepId, setSelectedSalesRepId] = useState<string>('ALL');
  const [salesViewMode, setSalesViewMode] = useState<'BY_MANAGER' | 'TOTAL_ONLY'>(
    'BY_MANAGER'
  );

  // Stock filters
  const [stockCategory, setStockCategory] = useState<string>('ALL');
  const [stockCondition, setStockCondition] = useState<
    'ALL' | 'LOW_SELLABLE' | 'HAS_IN_TRANSIT' | 'HAS_DAMAGED'
  >('ALL');

  // Warehouse query filters
  const [warehouseQuery, setWarehouseQuery] =
    useState<WarehouseQueryType>('FINAL_INVOICES');
  const [whDriverFilter, setWhDriverFilter] = useState<string>('ALL');
  const [whStoreFilter, setWhStoreFilter] = useState<string>('ALL');
  const [whInvoiceStatusFilter, setWhInvoiceStatusFilter] = useState<
    'ALL' | 'PENDING' | 'SETTLED' | 'RESCHEDULED'
  >('ALL');

  // Cashier query filters
  const [cashierQuery, setCashierQuery] = useState<CashierQueryType>('FINAL_INVOICES');
  const [cashDriverFilter, setCashDriverFilter] = useState<string>('ALL');
  const [cashInvoiceFilter, setCashInvoiceFilter] = useState<
    'ALL' | 'PENDING' | 'SETTLED_EXACT' | 'HAS_VARIANCE' | 'RESCHEDULED'
  >('ALL');
  const [cashbookTypeFilter, setCashbookTypeFilter] = useState<'ALL' | 'INFLOW' | 'OUTFLOW'>(
    'ALL'
  );
  const [cashbookCategoryFilter, setCashbookCategoryFilter] = useState<
    'ALL' | CashbookCategory
  >('ALL');
  const [dueStatusFilter, setDueStatusFilter] = useState<'ALL' | 'HAS_DUE' | 'CLEARED'>(
    'HAS_DUE'
  );
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [varianceFilter, setVarianceFilter] = useState<
    'ALL' | 'EXACT' | 'SHORTAGE' | 'SURPLUS'
  >('ALL');

  // Deliveryman report filters
  const [selectedDeliverymanId, setSelectedDeliverymanId] = useState<string>('ALL');
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<'ALL' | OrderStatus>(
    'ALL'
  );

  // Printable A5 report payload
  const [printableReport, setPrintableReport] = useState<PrintableReportData | null>(null);

  const effectiveStart = dateMode === 'single' ? singleDate : startDate;
  const effectiveEnd = dateMode === 'single' ? singleDate : endDate;
  const periodLabel =
    effectiveStart || effectiveEnd
      ? `${effectiveStart || 'Beginning'} to ${effectiveEnd || 'Present'}`
      : 'All Dates';

  const isInRange = (iso?: string): boolean => {
    if (!effectiveStart && !effectiveEnd) return true;
    if (!iso) return false;
    const key = toDateKey(iso);
    if (effectiveStart && key < effectiveStart) return false;
    if (effectiveEnd && key > effectiveEnd) return false;
    return true;
  };

  const q = searchText.trim().toLowerCase();

  const salesManagers = useMemo(
    () => state.users.filter((u) => u.role === 'SALES_REP'),
    [state.users]
  );

  const deliverymen = useMemo(
    () => state.users.filter((u) => u.role === 'DELIVERYMAN'),
    [state.users]
  );

  const categories = useMemo(
    () => Array.from(new Set(state.products.map((p) => p.category))),
    [state.products]
  );

  const zones = useMemo(
    () => Array.from(new Set(state.stores.map((s) => s.zone))),
    [state.stores]
  );

  // =========================================================================
  // 1. DELIVERED SALES BY SALES MANAGER / TOTAL SALES
  // =========================================================================
  const deliveredSalesOrders = useMemo(() => {
    return state.orders.filter((o) => {
      if (o.status !== 'DELIVERED' && o.status !== 'PARTIAL_DELIVERY') return false;
      const dateVal = o.deliveredAt || o.createdAt;
      if (!isInRange(dateVal)) return false;
      if (selectedSalesRepId !== 'ALL' && o.salesRepId !== selectedSalesRepId) {
        return false;
      }
      if (
        q &&
        !o.orderNumber.toLowerCase().includes(q) &&
        !o.storeName.toLowerCase().includes(q) &&
        !o.salesRepName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.orders, selectedSalesRepId, effectiveStart, effectiveEnd, q]);

  const salesManagerBreakdown = useMemo(() => {
    const map = new Map<
      string,
      {
        salesRepId: string;
        salesRepName: string;
        deliveredOrderCount: number;
        orderedValue: number;
        grossDeliveredValue: number;
        returnCreditValue: number;
        netDeliveredSales: number;
        cashCollected: number;
        dueAdded: number;
      }
    >();

    for (const ord of deliveredSalesOrders) {
      const grossDelivered = ord.items.reduce(
        (sum, item) => sum + item.deliveredQty * item.unitPrice,
        0
      );
      const cur = map.get(ord.salesRepId) ?? {
        salesRepId: ord.salesRepId,
        salesRepName: ord.salesRepName,
        deliveredOrderCount: 0,
        orderedValue: 0,
        grossDeliveredValue: 0,
        returnCreditValue: 0,
        netDeliveredSales: 0,
        cashCollected: 0,
        dueAdded: 0,
      };
      cur.deliveredOrderCount += 1;
      cur.orderedValue += ord.totalOrderedAmount;
      cur.grossDeliveredValue += grossDelivered;
      cur.returnCreditValue += ord.returnCreditAmount;
      cur.netDeliveredSales += ord.netPayableAmount;
      cur.cashCollected += ord.cashCollected;
      cur.dueAdded += ord.dueAdded;
      map.set(ord.salesRepId, cur);
    }

    return Array.from(map.values());
  }, [deliveredSalesOrders]);

  const totalDeliveredSalesMetrics = useMemo(() => {
    return salesManagerBreakdown.reduce(
      (acc, r) => ({
        deliveredOrderCount: acc.deliveredOrderCount + r.deliveredOrderCount,
        orderedValue: acc.orderedValue + r.orderedValue,
        grossDeliveredValue: acc.grossDeliveredValue + r.grossDeliveredValue,
        returnCreditValue: acc.returnCreditValue + r.returnCreditValue,
        netDeliveredSales: acc.netDeliveredSales + r.netDeliveredSales,
        cashCollected: acc.cashCollected + r.cashCollected,
        dueAdded: acc.dueAdded + r.dueAdded,
      }),
      {
        deliveredOrderCount: 0,
        orderedValue: 0,
        grossDeliveredValue: 0,
        returnCreditValue: 0,
        netDeliveredSales: 0,
        cashCollected: 0,
        dueAdded: 0,
      }
    );
  }, [salesManagerBreakdown]);

  // =========================================================================
  // 2. STOCK REPORT
  // =========================================================================
  const stockReportRows = useMemo(() => {
    return state.products
      .filter((prod) => {
        if (stockCategory !== 'ALL' && prod.category !== stockCategory) return false;
        if (stockCondition === 'LOW_SELLABLE' && prod.sellableStock >= 30) return false;
        if (stockCondition === 'HAS_IN_TRANSIT' && prod.inTransitStock <= 0) return false;
        if (stockCondition === 'HAS_DAMAGED' && prod.damagedStock <= 0) return false;
        if (
          q &&
          !prod.sku.toLowerCase().includes(q) &&
          !prod.name.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .map((prod) => {
        let receivedInRange = 0;
        for (const grn of state.grns) {
          if (isInRange(grn.receivedAt)) {
            const item = grn.items.find((i) => i.productId === prod.id);
            if (item) receivedInRange += item.qty;
          }
        }

        let orderedInRange = 0;
        let dispatchedInRange = 0;
        let deliveredInRange = 0;
        let storeDamagedReturnInRange = 0;

        for (const ord of state.orders) {
          const item = ord.items.find((i) => i.productId === prod.id);
          if (!item) continue;
          if (isInRange(ord.createdAt)) orderedInRange += item.orderedQty;
          if (ord.dispatchedAt && isInRange(ord.dispatchedAt)) {
            dispatchedInRange += item.orderedQty;
          }
          if (
            ord.deliveredAt &&
            isInRange(ord.deliveredAt) &&
            (ord.status === 'DELIVERED' || ord.status === 'PARTIAL_DELIVERY')
          ) {
            deliveredInRange += item.deliveredQty;
            storeDamagedReturnInRange += item.damagedReturnQty;
          }
        }

        let returnedToSellableInRange = 0;
        let movedToDamagedInRange = 0;
        for (const rec of state.reconciliations) {
          if (isInRange(rec.reconciledAt)) {
            const item = rec.items.find((i) => i.productId === prod.id);
            if (item) {
              returnedToSellableInRange += item.returnedToSellable;
              movedToDamagedInRange += item.movedToDamaged;
            }
          }
        }

        let rtvClearedInRange = 0;
        for (const rtv of state.rtvs) {
          if (isInRange(rtv.createdAt)) {
            const item = rtv.items.find((i) => i.productId === prod.id);
            if (item) rtvClearedInRange += item.qty;
          }
        }

        return {
          product: prod,
          receivedInRange,
          orderedInRange,
          dispatchedInRange,
          deliveredInRange,
          returnedToSellableInRange,
          damagedTotalInRange: storeDamagedReturnInRange + movedToDamagedInRange,
          rtvClearedInRange,
        };
      });
  }, [
    state.products,
    state.grns,
    state.orders,
    state.reconciliations,
    state.rtvs,
    stockCategory,
    stockCondition,
    effectiveStart,
    effectiveEnd,
    q,
  ]);

  // =========================================================================
  // 3. WAREHOUSE MANAGER QUERIES
  // =========================================================================
  const whPendingOrders = useMemo(() => {
    return state.orders.filter((o) => {
      if (o.status !== 'PENDING_DISPATCH') return false;
      if (!isInRange(o.createdAt)) return false;
      if (whStoreFilter !== 'ALL' && o.storeId !== whStoreFilter) return false;
      if (
        q &&
        !o.orderNumber.toLowerCase().includes(q) &&
        !o.storeName.toLowerCase().includes(q) &&
        !o.salesRepName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.orders, whStoreFilter, effectiveStart, effectiveEnd, q]);

  const whInTransitOrders = useMemo(() => {
    return state.orders.filter((o) => {
      if (o.status !== 'IN_TRANSIT') return false;
      if (!isInRange(o.dispatchedAt || o.createdAt)) return false;
      if (whDriverFilter !== 'ALL' && o.deliverymanId !== whDriverFilter) return false;
      if (whStoreFilter !== 'ALL' && o.storeId !== whStoreFilter) return false;
      if (
        q &&
        !o.orderNumber.toLowerCase().includes(q) &&
        !o.storeName.toLowerCase().includes(q) &&
        !(o.deliverymanName || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.orders, whDriverFilter, whStoreFilter, effectiveStart, effectiveEnd, q]);

  const whGrns = useMemo(() => {
    return state.grns.filter((g) => {
      if (!isInRange(g.receivedAt)) return false;
      if (
        q &&
        !g.referenceNo.toLowerCase().includes(q) &&
        !g.supplierName.toLowerCase().includes(q) &&
        !g.receivedBy.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.grns, effectiveStart, effectiveEnd, q]);

  const whReconciliations = useMemo(() => {
    return state.reconciliations.filter((r) => {
      if (!isInRange(r.reconciledAt)) return false;
      if (whDriverFilter !== 'ALL' && r.deliverymanId !== whDriverFilter) return false;
      if (
        q &&
        !r.finalInvoiceNumber.toLowerCase().includes(q) &&
        !r.deliverymanName.toLowerCase().includes(q) &&
        !r.reconciledBy.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.reconciliations, whDriverFilter, effectiveStart, effectiveEnd, q]);

  const whFinalInvoices = useMemo(() => {
    return state.finalInvoices.filter((inv) => {
      if (!isInRange(inv.createdAt)) return false;
      if (whDriverFilter !== 'ALL' && inv.deliverymanId !== whDriverFilter) return false;
      if (whInvoiceStatusFilter === 'PENDING' && inv.cashSettled) return false;
      if (whInvoiceStatusFilter === 'SETTLED' && !inv.cashSettled) return false;
      if (whInvoiceStatusFilter === 'RESCHEDULED' && !inv.settlementDueDateKey) return false;
      if (
        q &&
        !inv.invoiceNumber.toLowerCase().includes(q) &&
        !inv.deliverymanName.toLowerCase().includes(q) &&
        !inv.createdBy.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    state.finalInvoices,
    whDriverFilter,
    whInvoiceStatusFilter,
    effectiveStart,
    effectiveEnd,
    q,
  ]);

  const whRtvs = useMemo(() => {
    return state.rtvs.filter((r) => {
      if (!isInRange(r.createdAt)) return false;
      if (
        q &&
        !r.debitNoteNo.toLowerCase().includes(q) &&
        !r.manufacturerName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.rtvs, effectiveStart, effectiveEnd, q]);

  // =========================================================================
  // 4. CASHIER QUERIES
  // =========================================================================
  const cashFinalInvoices = useMemo(() => {
    return state.finalInvoices.filter((inv) => {
      const targetDate = inv.settlementDueDateKey || inv.createdAt;
      if (!isInRange(targetDate) && !isInRange(inv.createdAt)) return false;
      if (cashDriverFilter !== 'ALL' && inv.deliverymanId !== cashDriverFilter) return false;
      if (cashInvoiceFilter === 'PENDING' && inv.cashSettled) return false;
      if (
        cashInvoiceFilter === 'SETTLED_EXACT' &&
        (!inv.cashSettled || Math.abs(inv.variance ?? 0) > 0.009)
      ) {
        return false;
      }
      if (
        cashInvoiceFilter === 'HAS_VARIANCE' &&
        (!inv.cashSettled || Math.abs(inv.variance ?? 0) <= 0.009)
      ) {
        return false;
      }
      if (cashInvoiceFilter === 'RESCHEDULED' && !inv.settlementDueDateKey) return false;
      if (
        q &&
        !inv.invoiceNumber.toLowerCase().includes(q) &&
        !inv.deliverymanName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    state.finalInvoices,
    cashDriverFilter,
    cashInvoiceFilter,
    effectiveStart,
    effectiveEnd,
    q,
  ]);

  const cashbookFiltered = useMemo(() => {
    return state.cashbook.filter((c) => {
      if (!isInRange(c.timestamp)) return false;
      if (cashbookTypeFilter !== 'ALL' && c.type !== cashbookTypeFilter) return false;
      if (cashbookCategoryFilter !== 'ALL' && c.category !== cashbookCategoryFilter) {
        return false;
      }
      if (cashDriverFilter !== 'ALL' && c.deliverymanId !== cashDriverFilter) return false;
      if (
        q &&
        !c.description.toLowerCase().includes(q) &&
        !(c.referenceId || '').toLowerCase().includes(q) &&
        !c.recordedBy.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    state.cashbook,
    cashbookTypeFilter,
    cashbookCategoryFilter,
    cashDriverFilter,
    effectiveStart,
    effectiveEnd,
    q,
  ]);

  const storeDuesFiltered = useMemo(() => {
    return state.stores.filter((s) => {
      if (dueStatusFilter === 'HAS_DUE' && s.creditBalance <= 0) return false;
      if (dueStatusFilter === 'CLEARED' && s.creditBalance > 0) return false;
      if (zoneFilter !== 'ALL' && s.zone !== zoneFilter) return false;
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !s.ownerName.toLowerCase().includes(q) &&
        !s.phone.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.stores, dueStatusFilter, zoneFilter, q]);

  const expenseFiltered = useMemo(() => {
    return state.cashbook.filter((c) => {
      if (c.type !== 'OUTFLOW') return false;
      if (!isInRange(c.timestamp)) return false;
      if (
        cashbookCategoryFilter !== 'ALL' &&
        c.category !== cashbookCategoryFilter
      ) {
        return false;
      }
      if (cashDriverFilter !== 'ALL' && c.deliverymanId !== cashDriverFilter) return false;
      if (
        q &&
        !c.description.toLowerCase().includes(q) &&
        !(c.referenceId || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    state.cashbook,
    cashbookCategoryFilter,
    cashDriverFilter,
    effectiveStart,
    effectiveEnd,
    q,
  ]);

  const settlementsFiltered = useMemo(() => {
    return state.settlements.filter((s) => {
      if (!isInRange(s.settledAt)) return false;
      if (cashDriverFilter !== 'ALL' && s.deliverymanId !== cashDriverFilter) return false;
      if (varianceFilter === 'EXACT' && Math.abs(s.variance) > 0.009) return false;
      if (varianceFilter === 'SHORTAGE' && s.variance >= -0.009) return false;
      if (varianceFilter === 'SURPLUS' && s.variance <= 0.009) return false;
      if (
        q &&
        !s.deliverymanName.toLowerCase().includes(q) &&
        !(s.finalInvoiceNumber || '').toLowerCase().includes(q) &&
        !s.settledBy.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    state.settlements,
    cashDriverFilter,
    varianceFilter,
    effectiveStart,
    effectiveEnd,
    q,
  ]);

  // =========================================================================
  // 5. DELIVERYMAN REPORT
  // =========================================================================
  const deliveryOrdersFiltered = useMemo(() => {
    return state.orders.filter((o) => {
      if (!o.deliverymanId) return false;
      const dateField = o.deliveredAt || o.dispatchedAt || o.createdAt;
      if (!isInRange(dateField)) return false;
      if (
        selectedDeliverymanId !== 'ALL' &&
        o.deliverymanId !== selectedDeliverymanId
      ) {
        return false;
      }
      if (deliveryStatusFilter !== 'ALL' && o.status !== deliveryStatusFilter) {
        return false;
      }
      if (
        q &&
        !o.orderNumber.toLowerCase().includes(q) &&
        !o.storeName.toLowerCase().includes(q) &&
        !(o.deliverymanName || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [
    state.orders,
    selectedDeliverymanId,
    deliveryStatusFilter,
    effectiveStart,
    effectiveEnd,
    q,
  ]);

  const deliverymanSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        deliverymanId: string;
        deliverymanName: string;
        totalTrips: number;
        deliveredCount: number;
        partialCount: number;
        inTransitCount: number;
        netPayableTotal: number;
        cashCollectedTotal: number;
        dueAddedTotal: number;
      }
    >();

    for (const ord of deliveryOrdersFiltered) {
      if (!ord.deliverymanId) continue;
      const cur = map.get(ord.deliverymanId) ?? {
        deliverymanId: ord.deliverymanId,
        deliverymanName: ord.deliverymanName ?? 'Deliveryman',
        totalTrips: 0,
        deliveredCount: 0,
        partialCount: 0,
        inTransitCount: 0,
        netPayableTotal: 0,
        cashCollectedTotal: 0,
        dueAddedTotal: 0,
      };
      cur.totalTrips += 1;
      if (ord.status === 'DELIVERED') cur.deliveredCount += 1;
      if (ord.status === 'PARTIAL_DELIVERY') cur.partialCount += 1;
      if (ord.status === 'IN_TRANSIT') cur.inTransitCount += 1;
      if (ord.status === 'DELIVERED' || ord.status === 'PARTIAL_DELIVERY') {
        cur.netPayableTotal += ord.netPayableAmount;
        cur.cashCollectedTotal += ord.cashCollected;
        cur.dueAddedTotal += ord.dueAdded;
      }
      map.set(ord.deliverymanId, cur);
    }

    return Array.from(map.values());
  }, [deliveryOrdersFiltered]);

  const applyLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setDateMode('range');
    setStartDate(toDateKey(start));
    setEndDate(toDateKey(end));
  };

  const applyAllDates = () => {
    setDateMode('range');
    setStartDate('');
    setEndDate('');
  };

  // =========================================================================
  // UNIFIED A5 REPORT PRINTER BUILDER
  // =========================================================================
  const handlePrintCurrentReportA5 = () => {
    if (reportTab === 'sales') {
      if (salesViewMode === 'TOTAL_ONLY') {
        setPrintableReport({
          title: 'Total Delivered Sales Report',
          subtitle:
            selectedSalesRepId === 'ALL'
              ? 'Consolidated delivered sales across all Sales Managers'
              : `Filtered Sales Manager: ${
                  salesManagers.find((s) => s.id === selectedSalesRepId)?.name ?? ''
                }`,
          periodLabel,
          summaryMetrics: [
            {
              label: 'Total Delivered Sales',
              value: formatCurrency(totalDeliveredSalesMetrics.netDeliveredSales),
            },
            {
              label: 'Cash Collected',
              value: formatCurrency(totalDeliveredSalesMetrics.cashCollected),
            },
            {
              label: 'Store Due Generated',
              value: formatCurrency(totalDeliveredSalesMetrics.dueAdded),
            },
          ],
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'orderNo', label: 'Order #' },
            { key: 'manager', label: 'Sales Mgr' },
            { key: 'store', label: 'Store' },
            { key: 'net', label: 'Delivered Net', align: 'right' },
            { key: 'cash', label: 'Cash', align: 'right' },
          ],
          rows: deliveredSalesOrders.map((o) => ({
            date: toDateKey(o.deliveredAt || o.createdAt),
            orderNo: o.orderNumber,
            manager: o.salesRepName,
            store: o.storeName,
            net: formatCurrency(o.netPayableAmount),
            cash: formatCurrency(o.cashCollected),
          })),
          footerTotals: {
            date: 'TOTAL',
            orderNo: `${totalDeliveredSalesMetrics.deliveredOrderCount} orders`,
            net: formatCurrency(totalDeliveredSalesMetrics.netDeliveredSales),
            cash: formatCurrency(totalDeliveredSalesMetrics.cashCollected),
          },
        });
      } else {
        setPrintableReport({
          title: 'Delivered Sales by Sales Manager',
          subtitle: 'Per-Sales Manager delivered revenue, cash collection, and dues',
          periodLabel,
          summaryMetrics: [
            {
              label: 'Total Delivered Sales',
              value: formatCurrency(totalDeliveredSalesMetrics.netDeliveredSales),
            },
            {
              label: 'Total Orders',
              value: String(totalDeliveredSalesMetrics.deliveredOrderCount),
            },
            {
              label: 'Total Cash Collected',
              value: formatCurrency(totalDeliveredSalesMetrics.cashCollected),
            },
          ],
          columns: [
            { key: 'manager', label: 'Sales Manager' },
            { key: 'orders', label: 'Orders', align: 'right' },
            { key: 'gross', label: 'Gross Deliv.', align: 'right' },
            { key: 'net', label: 'Net Sales', align: 'right' },
            { key: 'cash', label: 'Cash', align: 'right' },
            { key: 'due', label: 'Due', align: 'right' },
          ],
          rows: salesManagerBreakdown.map((r) => ({
            manager: r.salesRepName,
            orders: r.deliveredOrderCount,
            gross: formatCurrency(r.grossDeliveredValue),
            net: formatCurrency(r.netDeliveredSales),
            cash: formatCurrency(r.cashCollected),
            due: formatCurrency(r.dueAdded),
          })),
          footerTotals: {
            manager: 'TOTAL SALES',
            orders: totalDeliveredSalesMetrics.deliveredOrderCount,
            gross: formatCurrency(totalDeliveredSalesMetrics.grossDeliveredValue),
            net: formatCurrency(totalDeliveredSalesMetrics.netDeliveredSales),
            cash: formatCurrency(totalDeliveredSalesMetrics.cashCollected),
            due: formatCurrency(totalDeliveredSalesMetrics.dueAdded),
          },
        });
      }
      return;
    }

    if (reportTab === 'stock') {
      setPrintableReport({
        title: 'Stock & 3-Bucket Inventory Report',
        subtitle: `Category: ${stockCategory} · Filter: ${stockCondition}`,
        periodLabel,
        summaryMetrics: [
          {
            label: 'Total Sellable Units',
            value: String(
              stockReportRows.reduce((s, r) => s + r.product.sellableStock, 0)
            ),
          },
          {
            label: 'Total In-Transit',
            value: String(
              stockReportRows.reduce((s, r) => s + r.product.inTransitStock, 0)
            ),
          },
          {
            label: 'Sellable Cost Value',
            value: formatCurrency(
              stockReportRows.reduce(
                (s, r) => s + r.product.sellableStock * r.product.unitCost,
                0
              )
            ),
          },
        ],
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'grn', label: 'GRN', align: 'right' },
          { key: 'del', label: 'Deliv', align: 'right' },
          { key: 'sell', label: 'Sellable', align: 'right' },
          { key: 'val', label: 'Value', align: 'right' },
        ],
        rows: stockReportRows.map((r) => ({
          sku: r.product.sku,
          name: r.product.name,
          grn: `+${r.receivedInRange}`,
          del: r.deliveredInRange,
          sell: r.product.sellableStock,
          val: formatCurrency(r.product.sellableStock * r.product.unitCost),
        })),
      });
      return;
    }

    if (reportTab === 'warehouse') {
      if (warehouseQuery === 'FINAL_INVOICES') {
        setPrintableReport({
          title: 'Warehouse Final Invoices Query',
          subtitle: `Status: ${whInvoiceStatusFilter}`,
          periodLabel,
          columns: [
            { key: 'inv', label: 'Final Inv #' },
            { key: 'driver', label: 'Driver' },
            { key: 'dueDate', label: 'Due Date' },
            { key: 'cash', label: 'Expected Cash', align: 'right' },
            { key: 'status', label: 'Status' },
          ],
          rows: whFinalInvoices.map((i) => ({
            inv: i.invoiceNumber,
            driver: i.deliverymanName,
            dueDate: i.settlementDueDateKey || toDateKey(i.createdAt),
            cash: formatCurrency(i.expectedCashFromWarehouse),
            status: i.cashSettled ? 'Settled' : 'Pending',
          })),
        });
      } else if (warehouseQuery === 'GRN_RECEIPTS') {
        setPrintableReport({
          title: 'Warehouse GRN Inbound Report',
          periodLabel,
          columns: [
            { key: 'ref', label: 'GRN Ref' },
            { key: 'sup', label: 'Supplier' },
            { key: 'date', label: 'Date' },
            { key: 'val', label: 'Value', align: 'right' },
          ],
          rows: whGrns.map((g) => ({
            ref: g.referenceNo,
            sup: g.supplierName,
            date: toDateKey(g.receivedAt),
            val: formatCurrency(g.totalValue),
          })),
        });
      } else if (warehouseQuery === 'RECONCILIATIONS') {
        setPrintableReport({
          title: 'Warehouse Route Reconciliation Report',
          periodLabel,
          columns: [
            { key: 'inv', label: 'Final Inv #' },
            { key: 'driver', label: 'Driver' },
            { key: 'date', label: 'Date' },
            { key: 'ret', label: 'Restocked', align: 'right' },
            { key: 'dmg', label: 'Damaged', align: 'right' },
          ],
          rows: whReconciliations.map((r) => ({
            inv: r.finalInvoiceNumber,
            driver: r.deliverymanName,
            date: toDateKey(r.reconciledAt),
            ret: r.items.reduce((s, i) => s + i.returnedToSellable, 0),
            dmg: r.items.reduce((s, i) => s + i.movedToDamaged, 0),
          })),
        });
      } else if (warehouseQuery === 'RTV_CLAIMS') {
        setPrintableReport({
          title: 'Manufacturer RTV Debit Notes Report',
          periodLabel,
          columns: [
            { key: 'note', label: 'Debit Note #' },
            { key: 'mfg', label: 'Manufacturer' },
            { key: 'date', label: 'Date' },
            { key: 'claim', label: 'Claim', align: 'right' },
          ],
          rows: whRtvs.map((r) => ({
            note: r.debitNoteNo,
            mfg: r.manufacturerName,
            date: toDateKey(r.createdAt),
            claim: formatCurrency(r.totalClaimAmount),
          })),
        });
      } else {
        const list =
          warehouseQuery === 'PENDING_DISPATCH' ? whPendingOrders : whInTransitOrders;
        setPrintableReport({
          title:
            warehouseQuery === 'PENDING_DISPATCH'
              ? 'Pending Dispatch Orders Query'
              : 'In-Transit Orders Query',
          periodLabel,
          columns: [
            { key: 'ord', label: 'Order #' },
            { key: 'store', label: 'Store' },
            { key: 'rep', label: 'Sales / Driver' },
            { key: 'amt', label: 'Value', align: 'right' },
          ],
          rows: list.map((o) => ({
            ord: o.orderNumber,
            store: o.storeName,
            rep: o.deliverymanName || o.salesRepName,
            amt: formatCurrency(o.totalOrderedAmount),
          })),
        });
      }
      return;
    }

    if (reportTab === 'cashier') {
      if (cashierQuery === 'CASHBOOK' || cashierQuery === 'EXPENSES') {
        const list =
          cashierQuery === 'CASHBOOK' ? cashbookFiltered : expenseFiltered;
        setPrintableReport({
          title:
            cashierQuery === 'CASHBOOK'
              ? 'Cashier Daily Cashbook Query'
              : 'Cashier Fuel & Operating Expenses',
          periodLabel,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'type', label: 'Type' },
            { key: 'ref', label: 'Ref' },
            { key: 'desc', label: 'Description' },
            { key: 'amt', label: 'Amount', align: 'right' },
          ],
          rows: list.map((c) => ({
            date: toDateKey(c.timestamp),
            type: c.type,
            ref: c.referenceId || '—',
            desc: c.description,
            amt: `${c.type === 'INFLOW' ? '+' : '-'}${formatCurrency(c.amount)}`,
          })),
        });
      } else if (cashierQuery === 'STORE_DUES') {
        setPrintableReport({
          title: 'Store Credit & Receivable Dues Report',
          periodLabel: 'Current Balances',
          columns: [
            { key: 'store', label: 'Store' },
            { key: 'owner', label: 'Owner' },
            { key: 'zone', label: 'Zone' },
            { key: 'due', label: 'Due Balance', align: 'right' },
          ],
          rows: storeDuesFiltered.map((s) => ({
            store: s.name,
            owner: s.ownerName,
            zone: s.zone,
            due: formatCurrency(s.creditBalance),
          })),
          footerTotals: {
            store: 'TOTAL DUE',
            due: formatCurrency(
              storeDuesFiltered.reduce((s, st) => s + st.creditBalance, 0)
            ),
          },
        });
      } else if (cashierQuery === 'SETTLEMENTS') {
        setPrintableReport({
          title: 'Cashier Settlement & Variance Audit',
          periodLabel,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'driver', label: 'Driver' },
            { key: 'exp', label: 'Expected', align: 'right' },
            { key: 'phys', label: 'Physical', align: 'right' },
            { key: 'var', label: 'Variance', align: 'right' },
          ],
          rows: settlementsFiltered.map((s) => ({
            date: toDateKey(s.settledAt),
            driver: s.deliverymanName,
            exp: formatCurrency(s.expectedCash),
            phys: formatCurrency(s.physicalCash),
            var: formatCurrency(s.variance),
          })),
        });
      } else {
        setPrintableReport({
          title: 'Cashier Final Invoices & Dispute Query',
          periodLabel,
          columns: [
            { key: 'inv', label: 'Final Inv #' },
            { key: 'driver', label: 'Driver' },
            { key: 'dueDate', label: 'Settlement Date' },
            { key: 'exp', label: 'Expected', align: 'right' },
            { key: 'var', label: 'Variance', align: 'right' },
          ],
          rows: cashFinalInvoices.map((i) => ({
            inv: i.invoiceNumber,
            driver: i.deliverymanName,
            dueDate: i.settlementDueDateKey || toDateKey(i.createdAt),
            exp: formatCurrency(i.expectedCashFromWarehouse),
            var: i.cashSettled ? formatCurrency(i.variance ?? 0) : 'Pending',
          })),
        });
      }
      return;
    }

    // Deliveryman report
    setPrintableReport({
      title: 'Deliveryman Delivery Performance Report',
      periodLabel,
      columns: [
        { key: 'driver', label: 'Deliveryman' },
        { key: 'trips', label: 'Stops', align: 'right' },
        { key: 'del', label: 'Full', align: 'right' },
        { key: 'part', label: 'Part', align: 'right' },
        { key: 'net', label: 'Net Sales', align: 'right' },
        { key: 'cash', label: 'Cash', align: 'right' },
      ],
      rows: deliverymanSummary.map((r) => ({
        driver: r.deliverymanName,
        trips: r.totalTrips,
        del: r.deliveredCount,
        part: r.partialCount,
        net: formatCurrency(r.netPayableTotal),
        cash: formatCurrency(r.cashCollectedTotal),
      })),
    });
  };

  return (
    <div className="space-y-6">
      {/* Unified Controls, Query Selector & Date Range Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'sales', label: 'Delivered Sales (Managers)' },
                { id: 'stock', label: 'Stock Report' },
                { id: 'warehouse', label: 'Warehouse Queries' },
                { id: 'cashier', label: 'Cashier Queries' },
                { id: 'delivery', label: 'Deliveryman Report' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReportTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  reportTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handlePrintCurrentReportA5}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Print A5 Report
          </button>
        </div>

        {/* Date / Range + Search Bar */}
        <div className="flex flex-wrap items-end gap-4 pt-3 border-t border-slate-100 text-xs">
          <div>
            <label className="block font-medium text-slate-600 mb-1">Date Filter</label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setDateMode('single')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  dateMode === 'single' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Single Date
              </button>
              <button
                type="button"
                onClick={() => setDateMode('range')}
                className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  dateMode === 'range' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                Date Range
              </button>
            </div>
          </div>

          {dateMode === 'single' ? (
            <div>
              <label className="block font-medium text-slate-600 mb-1">Select Date</label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="px-3 py-1.5 font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block font-medium text-slate-600 mb-1">From Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">To Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </>
          )}

          <div className="min-w-[190px]">
            <label className="block font-medium text-slate-600 mb-1">Keyword Query</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Order #, Inv #, SKU, Name..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => {
                setDateMode('single');
                setSingleDate(today);
              }}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={applyLast7Days}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={applyAllDates}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 cursor-pointer"
            >
              All Dates
            </button>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: DELIVERED SALES BY SALES MANAGER & TOTAL SALES               */}
      {/* =================================================================== */}
      {reportTab === 'sales' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-600 mb-1">
                Sales Manager (SR)
              </label>
              <select
                value={selectedSalesRepId}
                onChange={(e) => setSelectedSalesRepId(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="ALL">All Sales Managers (Individual + Total)</option>
                {salesManagers.map((sr) => (
                  <option key={sr.id} value={sr.id}>
                    {sr.name} (@{sr.username})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-600 mb-1">Report View</label>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSalesViewMode('BY_MANAGER')}
                  className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                    salesViewMode === 'BY_MANAGER'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Each Sales Manager + Total
                </button>
                <button
                  type="button"
                  onClick={() => setSalesViewMode('TOTAL_ONLY')}
                  className={`px-3 py-1 rounded text-xs font-medium cursor-pointer ${
                    salesViewMode === 'TOTAL_ONLY'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600'
                  }`}
                >
                  Total Delivered Sales Only
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Total Delivered Sales</p>
              <p className="text-xl font-bold font-mono text-emerald-700">
                {formatCurrency(totalDeliveredSalesMetrics.netDeliveredSales)}
              </p>
              <p className="text-[11px] text-slate-400">
                {totalDeliveredSalesMetrics.deliveredOrderCount} delivered stops
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Gross Delivered Value</p>
              <p className="text-xl font-bold font-mono text-slate-900">
                {formatCurrency(totalDeliveredSalesMetrics.grossDeliveredValue)}
              </p>
              <p className="text-[11px] text-slate-400">Before damaged return credit</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Damaged Credits</p>
              <p className="text-xl font-bold font-mono text-amber-700">
                {formatCurrency(totalDeliveredSalesMetrics.returnCreditValue)}
              </p>
              <p className="text-[11px] text-slate-400">Deducted on store delivery</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Cash Collected</p>
              <p className="text-xl font-bold font-mono text-slate-900">
                {formatCurrency(totalDeliveredSalesMetrics.cashCollected)}
              </p>
              <p className="text-[11px] text-slate-400">Paid on delivered orders</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Store Due Added</p>
              <p className="text-xl font-bold font-mono text-rose-700">
                {formatCurrency(totalDeliveredSalesMetrics.dueAdded)}
              </p>
              <p className="text-[11px] text-slate-400">Credit balance added</p>
            </div>
          </div>

          {salesViewMode === 'BY_MANAGER' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  Delivered Sales by Sales Manager
                </h2>
                <p className="text-xs text-slate-500">Period: {periodLabel}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Sales Manager</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Delivered Orders</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Gross Delivered</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Return Credit</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Net Delivered Sales</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Cash Collected</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Due Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {salesManagerBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No delivered sales found for {periodLabel}.
                        </td>
                      </tr>
                    ) : (
                      salesManagerBreakdown.map((row) => (
                        <tr key={row.salesRepId} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {row.salesRepName}
                          </td>
                          <td className="py-3 px-4 font-mono text-right">
                            {row.deliveredOrderCount}
                          </td>
                          <td className="py-3 px-4 font-mono text-right">
                            {formatCurrency(row.grossDeliveredValue)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-amber-700">
                            -{formatCurrency(row.returnCreditValue)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-bold text-emerald-700">
                            {formatCurrency(row.netDeliveredSales)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-semibold">
                            {formatCurrency(row.cashCollected)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-rose-700">
                            {formatCurrency(row.dueAdded)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {salesManagerBreakdown.length > 0 && (
                    <tfoot className="bg-slate-100 border-t border-slate-300 font-bold text-slate-900">
                      <tr>
                        <td className="py-2.5 px-4">TOTAL DELIVERED SALES</td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          {totalDeliveredSalesMetrics.deliveredOrderCount}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          {formatCurrency(totalDeliveredSalesMetrics.grossDeliveredValue)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right text-amber-700">
                          -{formatCurrency(totalDeliveredSalesMetrics.returnCreditValue)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right text-emerald-700">
                          {formatCurrency(totalDeliveredSalesMetrics.netDeliveredSales)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          {formatCurrency(totalDeliveredSalesMetrics.cashCollected)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right text-rose-700">
                          {formatCurrency(totalDeliveredSalesMetrics.dueAdded)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Itemized Delivered Orders ({deliveredSalesOrders.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Delivered Date</th>
                    <th className="py-2.5 px-4 font-semibold">Order #</th>
                    <th className="py-2.5 px-4 font-semibold">Sales Manager</th>
                    <th className="py-2.5 px-4 font-semibold">Retail Store</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Delivered Net</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Cash</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {deliveredSalesOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono text-slate-500">
                        {toDateKey(ord.deliveredAt || ord.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                        {ord.orderNumber}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">{ord.salesRepName}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        {ord.storeName}
                      </td>
                      <td className="py-2.5 px-4">
                        <OrderStatusBadge status={ord.status} />
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                        {formatCurrency(ord.netPayableAmount)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right">
                        {formatCurrency(ord.cashCollected)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-rose-700">
                        {formatCurrency(ord.dueAdded)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: STOCK REPORT                                                 */}
      {/* =================================================================== */}
      {reportTab === 'stock' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-600 mb-1">Category</label>
              <select
                value={stockCategory}
                onChange={(e) => setStockCategory(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
              >
                <option value="ALL">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Stock Condition</label>
              <select
                value={stockCondition}
                onChange={(e) =>
                  setStockCondition(
                    e.target.value as
                      | 'ALL'
                      | 'LOW_SELLABLE'
                      | 'HAS_IN_TRANSIT'
                      | 'HAS_DAMAGED'
                  )
                }
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
              >
                <option value="ALL">All SKUs</option>
                <option value="LOW_SELLABLE">Low Sellable (&lt; 30)</option>
                <option value="HAS_IN_TRANSIT">Has In-Transit Stock</option>
                <option value="HAS_DAMAGED">Has Damaged Stock</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-emerald-600" />
                Stock Movement &amp; 3-Bucket Valuation Report
              </h2>
              <p className="text-xs text-slate-500">Period: {periodLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">SKU &amp; Product</th>
                    <th className="py-2.5 px-4 font-semibold text-right">GRN In</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Dispatched</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Delivered</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Restocked</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Damaged</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Sellable</th>
                    <th className="py-2.5 px-4 font-semibold text-right">In Transit</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Sellable Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {stockReportRows.map((row) => (
                    <tr key={row.product.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4">
                        <p className="font-semibold text-slate-900">{row.product.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {row.product.sku} · {row.product.category}
                        </p>
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-emerald-700">
                        +{row.receivedInRange}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-blue-700">
                        {row.dispatchedInRange}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-semibold">
                        {row.deliveredInRange}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-emerald-700">
                        +{row.returnedToSellableInRange}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-rose-700">
                        {row.product.damagedStock}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-bold text-slate-900">
                        {row.product.sellableStock}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-blue-700">
                        {row.product.inTransitStock}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-semibold text-slate-900">
                        {formatCurrency(row.product.sellableStock * row.product.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: WAREHOUSE MANAGER QUERIES (EVERY POSSIBLE OPTION)            */}
      {/* =================================================================== */}
      {reportTab === 'warehouse' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-emerald-600" />
                Warehouse Manager Query Explorer
              </h2>
              <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'FINAL_INVOICES', label: 'Final Invoices' },
                    { id: 'PENDING_DISPATCH', label: 'Pending Dispatch' },
                    { id: 'IN_TRANSIT', label: 'In-Transit' },
                    { id: 'GRN_RECEIPTS', label: 'GRN Receipts' },
                    { id: 'RECONCILIATIONS', label: 'Return Reconciliations' },
                    { id: 'RTV_CLAIMS', label: 'RTV Debit Notes' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setWarehouseQuery(opt.id)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      warehouseQuery === opt.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-slate-100">
              {(warehouseQuery === 'IN_TRANSIT' ||
                warehouseQuery === 'RECONCILIATIONS' ||
                warehouseQuery === 'FINAL_INVOICES') && (
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Deliveryman</label>
                  <select
                    value={whDriverFilter}
                    onChange={(e) => setWhDriverFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Deliverymen</option>
                    {deliverymen.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.vehicleNo})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(warehouseQuery === 'PENDING_DISPATCH' ||
                warehouseQuery === 'IN_TRANSIT') && (
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Retail Store</label>
                  <select
                    value={whStoreFilter}
                    onChange={(e) => setWhStoreFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Stores</option>
                    {state.stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {warehouseQuery === 'FINAL_INVOICES' && (
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Cashier Settlement Status
                  </label>
                  <select
                    value={whInvoiceStatusFilter}
                    onChange={(e) =>
                      setWhInvoiceStatusFilter(
                        e.target.value as 'ALL' | 'PENDING' | 'SETTLED' | 'RESCHEDULED'
                      )
                    }
                    className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Invoices</option>
                    <option value="PENDING">Pending Cashier Receipt</option>
                    <option value="SETTLED">Settled with Cashier</option>
                    <option value="RESCHEDULED">Rescheduled Settlement Date</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              {warehouseQuery === 'FINAL_INVOICES' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Final Invoice #</th>
                      <th className="py-2.5 px-4 font-semibold">Created</th>
                      <th className="py-2.5 px-4 font-semibold">Due Date</th>
                      <th className="py-2.5 px-4 font-semibold">Warehouse Mgr</th>
                      <th className="py-2.5 px-4 font-semibold">Driver</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Net Payable</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Expected Cash</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {whFinalInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold">
                          {inv.invoiceNumber}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {toDateKey(inv.createdAt)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-blue-700 font-semibold">
                          {inv.settlementDueDateKey || toDateKey(inv.createdAt)}
                        </td>
                        <td className="py-2.5 px-4">{inv.createdBy}</td>
                        <td className="py-2.5 px-4">{inv.deliverymanName}</td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          {formatCurrency(inv.netFinalPayable)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold">
                          {formatCurrency(inv.expectedCashFromWarehouse)}
                        </td>
                        <td className="py-2.5 px-4">
                          <StatusBadge
                            variant={inv.cashSettled ? 'emerald' : 'amber'}
                            label={inv.cashSettled ? 'Settled' : 'Pending'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {(warehouseQuery === 'PENDING_DISPATCH' || warehouseQuery === 'IN_TRANSIT') && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Order #</th>
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-4 font-semibold">Retail Store</th>
                      <th className="py-2.5 px-4 font-semibold">Sales Manager</th>
                      <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Order Value</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(warehouseQuery === 'PENDING_DISPATCH'
                      ? whPendingOrders
                      : whInTransitOrders
                    ).map((o) => (
                      <tr key={o.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold">{o.orderNumber}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {toDateKey(o.dispatchedAt || o.createdAt)}
                        </td>
                        <td className="py-2.5 px-4 font-medium">{o.storeName}</td>
                        <td className="py-2.5 px-4">{o.salesRepName}</td>
                        <td className="py-2.5 px-4">{o.deliverymanName || 'Unassigned'}</td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold">
                          {formatCurrency(o.totalOrderedAmount)}
                        </td>
                        <td className="py-2.5 px-4">
                          <OrderStatusBadge status={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {warehouseQuery === 'GRN_RECEIPTS' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">GRN Ref #</th>
                      <th className="py-2.5 px-4 font-semibold">Received Date</th>
                      <th className="py-2.5 px-4 font-semibold">Supplier</th>
                      <th className="py-2.5 px-4 font-semibold">Received By</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Total Units</th>
                      <th className="py-2.5 px-4 font-semibold text-right">GRN Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {whGrns.map((g) => (
                      <tr key={g.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold">
                          {g.referenceNo}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {toDateKey(g.receivedAt)}
                        </td>
                        <td className="py-2.5 px-4 font-medium">{g.supplierName}</td>
                        <td className="py-2.5 px-4">{g.receivedBy}</td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          {g.items.reduce((s, i) => s + i.qty, 0)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                          {formatCurrency(g.totalValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {warehouseQuery === 'RECONCILIATIONS' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Final Invoice #</th>
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                      <th className="py-2.5 px-4 font-semibold">Warehouse Mgr</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Restocked Sellable</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Moved Damaged</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {whReconciliations.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold">
                          {r.finalInvoiceNumber}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {toDateKey(r.reconciledAt)}
                        </td>
                        <td className="py-2.5 px-4">{r.deliverymanName}</td>
                        <td className="py-2.5 px-4">{r.reconciledBy}</td>
                        <td className="py-2.5 px-4 font-mono text-right text-emerald-700 font-semibold">
                          +{r.items.reduce((s, i) => s + i.returnedToSellable, 0)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right text-rose-700 font-semibold">
                          +{r.items.reduce((s, i) => s + i.movedToDamaged, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {warehouseQuery === 'RTV_CLAIMS' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Debit Note #</th>
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-4 font-semibold">Manufacturer</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Damaged Units</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Claim Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {whRtvs.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold">{r.debitNoteNo}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {toDateKey(r.createdAt)}
                        </td>
                        <td className="py-2.5 px-4 font-medium">{r.manufacturerName}</td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          {r.items.reduce((s, i) => s + i.qty, 0)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold text-blue-700">
                          {formatCurrency(r.totalClaimAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: CASHIER QUERIES (EVERY POSSIBLE OPTION)                      */}
      {/* =================================================================== */}
      {reportTab === 'cashier' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Vault className="w-4 h-4 text-emerald-600" />
                Cashier &amp; Treasury Query Explorer
              </h2>
              <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'FINAL_INVOICES', label: 'Final Invoices & Disputes' },
                    { id: 'CASHBOOK', label: 'Daily Cashbook' },
                    { id: 'STORE_DUES', label: 'Store Credit & Dues' },
                    { id: 'EXPENSES', label: 'Fuel & Expenses' },
                    { id: 'SETTLEMENTS', label: 'Settlement Variances' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setCashierQuery(opt.id)}
                    className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer ${
                      cashierQuery === opt.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-slate-100">
              {cashierQuery !== 'STORE_DUES' && (
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Deliveryman</label>
                  <select
                    value={cashDriverFilter}
                    onChange={(e) => setCashDriverFilter(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Deliverymen / Staff</option>
                    {deliverymen.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cashierQuery === 'FINAL_INVOICES' && (
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Invoice Filter</label>
                  <select
                    value={cashInvoiceFilter}
                    onChange={(e) =>
                      setCashInvoiceFilter(
                        e.target.value as
                          | 'ALL'
                          | 'PENDING'
                          | 'SETTLED_EXACT'
                          | 'HAS_VARIANCE'
                          | 'RESCHEDULED'
                      )
                    }
                    className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Final Invoices</option>
                    <option value="PENDING">Pending Cash Receipt</option>
                    <option value="SETTLED_EXACT">Settled Exact (Zero Variance)</option>
                    <option value="HAS_VARIANCE">Has Variance / Mismatch</option>
                    <option value="RESCHEDULED">Rescheduled Dispute Date</option>
                  </select>
                </div>
              )}

              {cashierQuery === 'CASHBOOK' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Flow Type</label>
                    <select
                      value={cashbookTypeFilter}
                      onChange={(e) =>
                        setCashbookTypeFilter(e.target.value as 'ALL' | 'INFLOW' | 'OUTFLOW')
                      }
                      className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                    >
                      <option value="ALL">All Flows</option>
                      <option value="INFLOW">Cash Inflows</option>
                      <option value="OUTFLOW">Cash Outflows</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Category</label>
                    <select
                      value={cashbookCategoryFilter}
                      onChange={(e) =>
                        setCashbookCategoryFilter(e.target.value as 'ALL' | CashbookCategory)
                      }
                      className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                    >
                      <option value="ALL">All Categories</option>
                      <option value="DELIVERY_SETTLEMENT">Delivery Settlement</option>
                      <option value="DUE_COLLECTION">Store Due Collection</option>
                      <option value="FUEL_EXPENSE">Fuel Expense</option>
                      <option value="OTHER_EXPENSE">Other Expense</option>
                    </select>
                  </div>
                </>
              )}

              {cashierQuery === 'STORE_DUES' && (
                <>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Due Status</label>
                    <select
                      value={dueStatusFilter}
                      onChange={(e) =>
                        setDueStatusFilter(e.target.value as 'ALL' | 'HAS_DUE' | 'CLEARED')
                      }
                      className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                    >
                      <option value="ALL">All Stores</option>
                      <option value="HAS_DUE">Stores With Pending Due</option>
                      <option value="CLEARED">Zero Balance Stores</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-600 mb-1">Zone</label>
                    <select
                      value={zoneFilter}
                      onChange={(e) => setZoneFilter(e.target.value)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                    >
                      <option value="ALL">All Zones</option>
                      {zones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {cashierQuery === 'SETTLEMENTS' && (
                <div>
                  <label className="block font-medium text-slate-600 mb-1">
                    Variance Filter
                  </label>
                  <select
                    value={varianceFilter}
                    onChange={(e) =>
                      setVarianceFilter(
                        e.target.value as 'ALL' | 'EXACT' | 'SHORTAGE' | 'SURPLUS'
                      )
                    }
                    className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
                  >
                    <option value="ALL">All Settlements</option>
                    <option value="EXACT">Exact Match</option>
                    <option value="SHORTAGE">Cash Shortage (&lt; 0)</option>
                    <option value="SURPLUS">Cash Surplus (&gt; 0)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              {cashierQuery === 'FINAL_INVOICES' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Final Invoice #</th>
                      <th className="py-2.5 px-4 font-semibold">Settlement Due</th>
                      <th className="py-2.5 px-4 font-semibold">Driver</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Expected Cash</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Received</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Variance</th>
                      <th className="py-2.5 px-4 font-semibold">Note / Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {cashFinalInvoices.map((inv) => {
                      const v = inv.variance ?? 0;
                      return (
                        <tr key={inv.id}>
                          <td className="py-2.5 px-4 font-mono font-semibold">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-blue-700 font-semibold">
                            {inv.settlementDueDateKey || toDateKey(inv.createdAt)}
                          </td>
                          <td className="py-2.5 px-4">{inv.deliverymanName}</td>
                          <td className="py-2.5 px-4 font-mono text-right">
                            {formatCurrency(inv.expectedCashFromWarehouse)}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                            {inv.cashSettled
                              ? formatCurrency(inv.cashReceivedByCashier ?? 0)
                              : 'Pending'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right">
                            {inv.cashSettled ? (
                              <StatusBadge
                                variant={v < 0 ? 'rose' : v > 0 ? 'blue' : 'emerald'}
                                label={`${v >= 0 ? '+' : ''}${formatCurrency(v)}`}
                              />
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {inv.rescheduledReason || (inv.cashSettled ? 'Settled' : 'Open')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {(cashierQuery === 'CASHBOOK' || cashierQuery === 'EXPENSES') && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-4 font-semibold">Type</th>
                      <th className="py-2.5 px-4 font-semibold">Category</th>
                      <th className="py-2.5 px-4 font-semibold">Ref</th>
                      <th className="py-2.5 px-4 font-semibold">Description</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(cashierQuery === 'CASHBOOK' ? cashbookFiltered : expenseFiltered).map(
                      (c) => (
                        <tr key={c.id}>
                          <td className="py-2.5 px-4 font-mono text-slate-500">
                            {toDateKey(c.timestamp)}
                          </td>
                          <td className="py-2.5 px-4 font-semibold">
                            <span
                              className={
                                c.type === 'INFLOW' ? 'text-emerald-700' : 'text-rose-700'
                              }
                            >
                              {c.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">{c.category}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">
                            {c.referenceId || '—'}
                          </td>
                          <td className="py-2.5 px-4 font-medium">{c.description}</td>
                          <td
                            className={`py-2.5 px-4 font-mono text-right font-bold ${
                              c.type === 'INFLOW' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {c.type === 'INFLOW' ? '+' : '-'}
                            {formatCurrency(c.amount)}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              )}

              {cashierQuery === 'STORE_DUES' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Store Name</th>
                      <th className="py-2.5 px-4 font-semibold">Owner</th>
                      <th className="py-2.5 px-4 font-semibold">Phone</th>
                      <th className="py-2.5 px-4 font-semibold">Zone</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Pending Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {storeDuesFiltered.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 px-4 font-semibold text-slate-900">{s.name}</td>
                        <td className="py-2.5 px-4">{s.ownerName}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{s.phone}</td>
                        <td className="py-2.5 px-4">{s.zone}</td>
                        <td
                          className={`py-2.5 px-4 font-mono text-right font-bold ${
                            s.creditBalance > 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {formatCurrency(s.creditBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {cashierQuery === 'SETTLEMENTS' && (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-4 font-semibold">Final Inv #</th>
                      <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                      <th className="py-2.5 px-4 font-semibold">Settled By</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Expected</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Physical</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Variance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {settlementsFiltered.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {toDateKey(s.settledAt)}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold">
                          {s.finalInvoiceNumber || 'Direct'}
                        </td>
                        <td className="py-2.5 px-4">{s.deliverymanName}</td>
                        <td className="py-2.5 px-4">{s.settledBy}</td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          {formatCurrency(s.expectedCash)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold">
                          {formatCurrency(s.physicalCash)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right">
                          <StatusBadge
                            variant={
                              s.variance < 0
                                ? 'rose'
                                : s.variance > 0
                                ? 'blue'
                                : 'emerald'
                            }
                            label={`${s.variance >= 0 ? '+' : ''}${formatCurrency(s.variance)}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: DELIVERYMAN DELIVERY REPORT                                  */}
      {/* =================================================================== */}
      {reportTab === 'delivery' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-end gap-4 text-xs">
            <div>
              <label className="block font-medium text-slate-600 mb-1">Deliveryman</label>
              <select
                value={selectedDeliverymanId}
                onChange={(e) => setSelectedDeliverymanId(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
              >
                <option value="ALL">All Deliverymen</option>
                {deliverymen.map((dm) => (
                  <option key={dm.id} value={dm.id}>
                    {dm.name} ({dm.vehicleNo})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-600 mb-1">Status</label>
              <select
                value={deliveryStatusFilter}
                onChange={(e) =>
                  setDeliveryStatusFilter(e.target.value as 'ALL' | OrderStatus)
                }
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white font-medium"
              >
                <option value="ALL">All Trip Statuses</option>
                <option value="DELIVERED">Delivered</option>
                <option value="PARTIAL_DELIVERY">Partial Delivery</option>
                <option value="IN_TRANSIT">In Transit</option>
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileBarChart2 className="w-4 h-4 text-emerald-600" />
                Delivery Summary by Deliveryman
              </h2>
              <p className="text-xs text-slate-500">Period: {periodLabel}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Assigned Stops</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Full Delivered</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Partial</th>
                    <th className="py-2.5 px-4 font-semibold text-right">In Transit</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Net Delivered</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Cash Collected</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Store Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {deliverymanSummary.map((row) => (
                    <tr key={row.deliverymanId} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {row.deliverymanName}
                      </td>
                      <td className="py-3 px-4 font-mono text-right">{row.totalTrips}</td>
                      <td className="py-3 px-4 font-mono text-right text-emerald-700 font-semibold">
                        {row.deliveredCount}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-amber-700">
                        {row.partialCount}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-blue-700">
                        {row.inTransitCount}
                      </td>
                      <td className="py-3 px-4 font-mono text-right font-semibold">
                        {formatCurrency(row.netPayableTotal)}
                      </td>
                      <td className="py-3 px-4 font-mono text-right font-semibold text-emerald-700">
                        {formatCurrency(row.cashCollectedTotal)}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-rose-700">
                        {formatCurrency(row.dueAddedTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <PrintableDocumentModal
        payload={printableReport ? { kind: 'REPORT', report: printableReport } : null}
        onClose={() => setPrintableReport(null)}
      />
    </div>
  );
};
