import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  FileSpreadsheet,
  Filter,
  Package,
  Printer,
  RotateCcw,
  Search,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react';
import { toDateKey, useDMS } from '../../context/DMSContext';
import { FinalInvoice, Order } from '../../types/dms';
import { PrintableReportData } from '../common/PrintableDocumentModal';
import { formatCurrency, formatDateTime, StatusBadge } from '../common/StatusBadge';

export type StockQueryGroupMode =
  | 'DETAILED'
  | 'BY_SKU'
  | 'BY_DATE'
  | 'BY_INVOICE'
  | 'BY_SALESMAN'
  | 'BY_DELIVERYMAN';

type StockEventFilter =
  | 'ALL'
  | 'GRN_IN'
  | 'ORDER_PENDING'
  | 'DISPATCHED_IN_TRANSIT'
  | 'DELIVERED_AWAITING_RETURN'
  | 'RECONCILED_INVOICED'
  | 'HAS_RETURN_OR_DAMAGE'
  | 'RTV_OUT';

type DatePreset = 'ALL' | 'TODAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH';

interface NormalizedStockMovement {
  id: string;
  dateIso: string;
  dateKey: string;
  eventType:
    | 'GRN_IN'
    | 'ORDER_PENDING'
    | 'DISPATCHED_IN_TRANSIT'
    | 'DELIVERED_AWAITING_RETURN'
    | 'RECONCILED_INVOICED'
    | 'RTV_OUT';
  eventLabel: string;
  documentNo: string;
  finalInvoiceNo?: string;
  documentKind: 'GRN' | 'ORDER' | 'RTV';
  orderRef?: Order;
  finalInvoiceRef?: FinalInvoice;
  productId: string;
  sku: string;
  productName: string;
  category: string;
  unit: string;
  salesRepId?: string;
  salesRepName: string;
  deliverymanId?: string;
  deliverymanName: string;
  counterpartyId?: string;
  counterpartyName: string;
  grnInQty: number;
  orderedQty: number;
  dispatchedQty: number;
  deliveredQty: number;
  returnedGoodQty: number;
  damagedQty: number;
  inTransitQty: number;
  rtvOutQty: number;
  amount: number;
}

interface StockQueryExplorerProps {
  onPrintOrder: (order: Order) => void;
  onPrintFinalInvoice: (invoice: FinalInvoice) => void;
  onPrintReport: (report: PrintableReportData) => void;
}

const escapeCsv = (val: string | number | undefined | null): string => {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const StockQueryExplorer: React.FC<StockQueryExplorerProps> = ({
  onPrintOrder,
  onPrintFinalInvoice,
  onPrintReport,
}) => {
  const { state } = useDMS();

  // Filter States
  const [groupMode, setGroupMode] = useState<StockQueryGroupMode>('DETAILED');
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [invoiceSearch, setInvoiceSearch] = useState<string>('');
  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState<string>('ALL');
  const [selectedSalesRepId, setSelectedSalesRepId] = useState<string>('ALL');
  const [selectedDeliverymanId, setSelectedDeliverymanId] = useState<string>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL');
  const [eventFilter, setEventFilter] = useState<StockEventFilter>('ALL');

  const salesReps = useMemo(
    () => state.users.filter((u) => u.role === 'SALES_REP'),
    [state.users]
  );

  const deliverymen = useMemo(
    () => state.users.filter((u) => u.role === 'DELIVERYMAN'),
    [state.users]
  );

  const categories = useMemo(() => {
    const set = new Set<string>(state.productCategories);
    state.products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [state.productCategories, state.products]);

  const productMap = useMemo(() => {
    const map = new Map(state.products.map((p) => [p.id, p]));
    return map;
  }, [state.products]);

  const finalInvoiceMap = useMemo(() => {
    const map = new Map(state.finalInvoices.map((inv) => [inv.id, inv]));
    return map;
  }, [state.finalInvoices]);

  // All selectable invoice / order / GRN / RTV numbers for quick dropdown selection
  const invoiceOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    state.finalInvoices.forEach((inv) => {
      opts.push({
        value: inv.invoiceNumber,
        label: `${inv.invoiceNumber} (Final Invoice · ${inv.deliverymanName})`,
      });
    });
    state.orders.forEach((ord) => {
      opts.push({
        value: ord.orderNumber,
        label: `${ord.orderNumber} (Order · ${ord.storeName})`,
      });
    });
    state.grns.forEach((grn) => {
      opts.push({
        value: grn.referenceNo,
        label: `${grn.referenceNo} (GRN · ${grn.supplierName})`,
      });
    });
    state.rtvs.forEach((rtv) => {
      opts.push({
        value: rtv.debitNoteNo,
        label: `${rtv.debitNoteNo} (RTV · ${rtv.manufacturerName})`,
      });
    });
    return opts;
  }, [state.finalInvoices, state.orders, state.grns, state.rtvs]);

  // Build unified, zero-double-count stock ledger from GRNs, Orders (+ Reconciliation splits), and RTVs
  const allMovements = useMemo<NormalizedStockMovement[]>(() => {
    const rows: NormalizedStockMovement[] = [];

    // Precompute reconciled return splits per (orderId, productId) so order-level rows match reconciliation totals exactly
    const reconciledSplitByOrderProduct = new Map<
      string,
      { returnedGood: number; damaged: number }
    >();

    for (const rec of state.reconciliations) {
      const recOrders = state.orders.filter((o) => rec.orderIds.includes(o.id));
      for (const recItem of rec.items) {
        const contributing = recOrders
          .map((ord) => {
            const ordItem = ord.items.find((i) => i.productId === recItem.productId);
            const unsold = ordItem ? Math.max(0, ordItem.orderedQty - ordItem.deliveredQty) : 0;
            return { orderId: ord.id, unsold };
          })
          .filter((x) => x.unsold > 0);

        const totalUnsold = contributing.reduce((s, c) => s + c.unsold, 0);
        if (totalUnsold === 0) continue;

        let remainingGood = recItem.returnedToSellable;
        let remainingDamaged = recItem.movedToDamaged;

        contributing.forEach((c, idx) => {
          const isLast = idx === contributing.length - 1;
          const goodShare = isLast
            ? remainingGood
            : Math.min(
                remainingGood,
                Math.round((c.unsold / totalUnsold) * recItem.returnedToSellable)
              );
          const dmgShare = isLast
            ? remainingDamaged
            : Math.min(remainingDamaged, Math.max(0, c.unsold - goodShare));

          remainingGood = Math.max(0, remainingGood - goodShare);
          remainingDamaged = Math.max(0, remainingDamaged - dmgShare);

          reconciledSplitByOrderProduct.set(`${c.orderId}::${recItem.productId}`, {
            returnedGood: goodShare,
            damaged: dmgShare,
          });
        });
      }
    }

    // 1. GRN Inbound Stock Movements
    for (const grn of state.grns) {
      const dateKey = toDateKey(grn.receivedAt);
      for (const item of grn.items) {
        const prod = productMap.get(item.productId);
        rows.push({
          id: `grn-${grn.id}-${item.productId}`,
          dateIso: grn.receivedAt,
          dateKey,
          eventType: 'GRN_IN',
          eventLabel: 'GRN Received',
          documentNo: grn.referenceNo,
          documentKind: 'GRN',
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          category: prod?.category ?? 'Uncategorized',
          unit: prod?.unit ?? 'Unit',
          salesRepName: '—',
          deliverymanName: '—',
          counterpartyName: grn.supplierName,
          grnInQty: item.qty,
          orderedQty: 0,
          dispatchedQty: 0,
          deliveredQty: 0,
          returnedGoodQty: 0,
          damagedQty: 0,
          inTransitQty: 0,
          rtvOutQty: 0,
          amount: item.qty * item.unitCost,
        });
      }
    }

    // 2. Order Lifecycle Movements (Pending Dispatch -> In-Transit -> Delivered -> Reconciled / Final Invoiced)
    for (const ord of state.orders) {
      const dateIso =
        ord.status === 'PENDING_DISPATCH'
          ? ord.createdAt
          : ord.status === 'IN_TRANSIT'
          ? ord.dispatchedAt || ord.createdAt
          : ord.deliveredAt || ord.dispatchedAt || ord.createdAt;
      const dateKey = toDateKey(dateIso);
      const finalInv = ord.finalInvoiceId ? finalInvoiceMap.get(ord.finalInvoiceId) : undefined;

      for (const item of ord.items) {
        const prod = productMap.get(item.productId);
        const unsoldQty = Math.max(0, item.orderedQty - item.deliveredQty);

        if (ord.status === 'PENDING_DISPATCH') {
          rows.push({
            id: `ord-${ord.id}-${item.productId}`,
            dateIso,
            dateKey,
            eventType: 'ORDER_PENDING',
            eventLabel: 'Pending Dispatch',
            documentNo: ord.orderNumber,
            documentKind: 'ORDER',
            orderRef: ord,
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            category: prod?.category ?? 'Uncategorized',
            unit: item.unit || prod?.unit || 'Unit',
            salesRepId: ord.salesRepId,
            salesRepName: ord.salesRepName,
            deliverymanId: ord.deliverymanId,
            deliverymanName: ord.deliverymanName ?? 'Unassigned',
            counterpartyId: ord.storeId,
            counterpartyName: ord.storeName,
            grnInQty: 0,
            orderedQty: item.orderedQty,
            dispatchedQty: 0,
            deliveredQty: 0,
            returnedGoodQty: 0,
            damagedQty: 0,
            inTransitQty: 0,
            rtvOutQty: 0,
            amount: item.orderedQty * item.unitPrice,
          });
        } else if (ord.status === 'IN_TRANSIT') {
          rows.push({
            id: `ord-${ord.id}-${item.productId}`,
            dateIso,
            dateKey,
            eventType: 'DISPATCHED_IN_TRANSIT',
            eventLabel: 'Dispatched (In-Transit)',
            documentNo: ord.orderNumber,
            documentKind: 'ORDER',
            orderRef: ord,
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            category: prod?.category ?? 'Uncategorized',
            unit: item.unit || prod?.unit || 'Unit',
            salesRepId: ord.salesRepId,
            salesRepName: ord.salesRepName,
            deliverymanId: ord.deliverymanId,
            deliverymanName: ord.deliverymanName ?? 'Unassigned',
            counterpartyId: ord.storeId,
            counterpartyName: ord.storeName,
            grnInQty: 0,
            orderedQty: item.orderedQty,
            dispatchedQty: item.orderedQty,
            deliveredQty: 0,
            returnedGoodQty: 0,
            damagedQty: 0,
            inTransitQty: item.orderedQty,
            rtvOutQty: 0,
            amount: item.orderedQty * item.unitPrice,
          });
        } else {
          // DELIVERED or PARTIAL_DELIVERY
          const split = reconciledSplitByOrderProduct.get(`${ord.id}::${item.productId}`);
          const returnedGoodQty = ord.reconciled
            ? split?.returnedGood ?? Math.max(0, unsoldQty - item.damagedReturnQty)
            : 0;
          const damagedQty = ord.reconciled
            ? split?.damaged ?? item.damagedReturnQty
            : item.damagedReturnQty;
          const inTransitQty = ord.reconciled ? 0 : unsoldQty;

          rows.push({
            id: `ord-${ord.id}-${item.productId}`,
            dateIso,
            dateKey,
            eventType: ord.reconciled ? 'RECONCILED_INVOICED' : 'DELIVERED_AWAITING_RETURN',
            eventLabel: ord.reconciled ? 'Reconciled & Invoiced' : 'Delivered (Return Pending)',
            documentNo: ord.orderNumber,
            finalInvoiceNo: ord.finalInvoiceNumber,
            documentKind: 'ORDER',
            orderRef: ord,
            finalInvoiceRef: finalInv,
            productId: item.productId,
            sku: item.sku,
            productName: item.productName,
            category: prod?.category ?? 'Uncategorized',
            unit: item.unit || prod?.unit || 'Unit',
            salesRepId: ord.salesRepId,
            salesRepName: ord.salesRepName,
            deliverymanId: ord.deliverymanId,
            deliverymanName: ord.deliverymanName ?? 'Unassigned',
            counterpartyId: ord.storeId,
            counterpartyName: ord.storeName,
            grnInQty: 0,
            orderedQty: item.orderedQty,
            dispatchedQty: item.orderedQty,
            deliveredQty: item.deliveredQty,
            returnedGoodQty,
            damagedQty,
            inTransitQty,
            rtvOutQty: 0,
            amount: item.deliveredQty * item.unitPrice,
          });
        }
      }
    }

    // 3. RTV (Return to Manufacturer Debit Notes)
    for (const rtv of state.rtvs) {
      const dateKey = toDateKey(rtv.createdAt);
      for (const item of rtv.items) {
        const prod = productMap.get(item.productId);
        rows.push({
          id: `rtv-${rtv.id}-${item.productId}`,
          dateIso: rtv.createdAt,
          dateKey,
          eventType: 'RTV_OUT',
          eventLabel: 'RTV Debit Note',
          documentNo: rtv.debitNoteNo,
          documentKind: 'RTV',
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          category: prod?.category ?? 'Uncategorized',
          unit: prod?.unit ?? 'Unit',
          salesRepName: '—',
          deliverymanName: '—',
          counterpartyName: rtv.manufacturerName,
          grnInQty: 0,
          orderedQty: 0,
          dispatchedQty: 0,
          deliveredQty: 0,
          returnedGoodQty: 0,
          damagedQty: 0,
          inTransitQty: 0,
          rtvOutQty: item.qty,
          amount: item.claimAmount,
        });
      }
    }

    return rows.sort((a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime());
  }, [state.grns, state.orders, state.reconciliations, state.rtvs, productMap, finalInvoiceMap]);

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'ALL') {
      setFromDate('');
      setToDate('');
      return;
    }
    const now = new Date();
    const todayKey = toDateKey(now);
    if (preset === 'TODAY') {
      setFromDate(todayKey);
      setToDate(todayKey);
    } else if (preset === 'LAST_7') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      setFromDate(toDateKey(start));
      setToDate(todayKey);
    } else if (preset === 'LAST_30') {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      setFromDate(toDateKey(start));
      setToDate(todayKey);
    } else if (preset === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      setFromDate(toDateKey(start));
      setToDate(todayKey);
    }
  };

  const resetFilters = () => {
    setDatePreset('ALL');
    setFromDate('');
    setToDate('');
    setInvoiceSearch('');
    setSelectedInvoiceNo('ALL');
    setSelectedSalesRepId('ALL');
    setSelectedDeliverymanId('ALL');
    setSelectedProductId('ALL');
    setSelectedCategory('ALL');
    setSelectedStoreId('ALL');
    setEventFilter('ALL');
  };

  const hasActiveFilters =
    fromDate !== '' ||
    toDate !== '' ||
    invoiceSearch.trim() !== '' ||
    selectedInvoiceNo !== 'ALL' ||
    selectedSalesRepId !== 'ALL' ||
    selectedDeliverymanId !== 'ALL' ||
    selectedProductId !== 'ALL' ||
    selectedCategory !== 'ALL' ||
    selectedStoreId !== 'ALL' ||
    eventFilter !== 'ALL';

  // Apply all combinable filters
  const filteredMovements = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    return allMovements.filter((row) => {
      if (fromDate && row.dateKey < fromDate) return false;
      if (toDate && row.dateKey > toDate) return false;

      if (selectedInvoiceNo !== 'ALL') {
        const matchesDoc =
          row.documentNo === selectedInvoiceNo || row.finalInvoiceNo === selectedInvoiceNo;
        if (!matchesDoc) return false;
      }

      if (q) {
        const haystack = [
          row.documentNo,
          row.finalInvoiceNo ?? '',
          row.sku,
          row.productName,
          row.salesRepName,
          row.deliverymanName,
          row.counterpartyName,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (selectedSalesRepId !== 'ALL' && row.salesRepId !== selectedSalesRepId) return false;
      if (selectedDeliverymanId !== 'ALL' && row.deliverymanId !== selectedDeliverymanId)
        return false;
      if (selectedProductId !== 'ALL' && row.productId !== selectedProductId) return false;
      if (selectedCategory !== 'ALL' && row.category !== selectedCategory) return false;
      if (selectedStoreId !== 'ALL' && row.counterpartyId !== selectedStoreId) return false;

      if (eventFilter !== 'ALL') {
        if (eventFilter === 'HAS_RETURN_OR_DAMAGE') {
          if (row.returnedGoodQty <= 0 && row.damagedQty <= 0 && row.rtvOutQty <= 0) return false;
        } else if (row.eventType !== eventFilter) {
          return false;
        }
      }

      return true;
    });
  }, [
    allMovements,
    fromDate,
    toDate,
    selectedInvoiceNo,
    invoiceSearch,
    selectedSalesRepId,
    selectedDeliverymanId,
    selectedProductId,
    selectedCategory,
    selectedStoreId,
    eventFilter,
  ]);

  // Query KPI Totals
  const totals = useMemo(() => {
    return filteredMovements.reduce(
      (acc, r) => {
        acc.grnIn += r.grnInQty;
        acc.ordered += r.orderedQty;
        acc.dispatched += r.dispatchedQty;
        acc.delivered += r.deliveredQty;
        acc.returnedGood += r.returnedGoodQty;
        acc.damaged += r.damagedQty;
        acc.inTransit += r.inTransitQty;
        acc.rtvOut += r.rtvOutQty;
        acc.amount += r.amount;
        return acc;
      },
      {
        grnIn: 0,
        ordered: 0,
        dispatched: 0,
        delivered: 0,
        returnedGood: 0,
        damaged: 0,
        inTransit: 0,
        rtvOut: 0,
        amount: 0,
      }
    );
  }, [filteredMovements]);

  // Grouped View 2: By SKU / Product
  const bySkuRows = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        sku: string;
        productName: string;
        category: string;
        unit: string;
        grnIn: number;
        ordered: number;
        dispatched: number;
        delivered: number;
        returnedGood: number;
        damaged: number;
        inTransit: number;
        rtvOut: number;
        amount: number;
        liveSellable: number;
        liveInTransit: number;
        liveDamaged: number;
      }
    >();

    for (const r of filteredMovements) {
      const prod = productMap.get(r.productId);
      const cur = map.get(r.productId) ?? {
        productId: r.productId,
        sku: r.sku,
        productName: r.productName,
        category: r.category,
        unit: r.unit,
        grnIn: 0,
        ordered: 0,
        dispatched: 0,
        delivered: 0,
        returnedGood: 0,
        damaged: 0,
        inTransit: 0,
        rtvOut: 0,
        amount: 0,
        liveSellable: prod?.sellableStock ?? 0,
        liveInTransit: prod?.inTransitStock ?? 0,
        liveDamaged: prod?.damagedStock ?? 0,
      };
      cur.grnIn += r.grnInQty;
      cur.ordered += r.orderedQty;
      cur.dispatched += r.dispatchedQty;
      cur.delivered += r.deliveredQty;
      cur.returnedGood += r.returnedGoodQty;
      cur.damaged += r.damagedQty;
      cur.inTransit += r.inTransitQty;
      cur.rtvOut += r.rtvOutQty;
      cur.amount += r.amount;
      map.set(r.productId, cur);
    }

    return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [filteredMovements, productMap]);

  // Grouped View 3: By Date
  const byDateRows = useMemo(() => {
    const map = new Map<
      string,
      {
        dateKey: string;
        docNos: Set<string>;
        grnIn: number;
        ordered: number;
        dispatched: number;
        delivered: number;
        returnedGood: number;
        damaged: number;
        inTransit: number;
        rtvOut: number;
        amount: number;
      }
    >();

    for (const r of filteredMovements) {
      const cur = map.get(r.dateKey) ?? {
        dateKey: r.dateKey,
        docNos: new Set<string>(),
        grnIn: 0,
        ordered: 0,
        dispatched: 0,
        delivered: 0,
        returnedGood: 0,
        damaged: 0,
        inTransit: 0,
        rtvOut: 0,
        amount: 0,
      };
      cur.docNos.add(r.finalInvoiceNo ? `${r.documentNo}/${r.finalInvoiceNo}` : r.documentNo);
      cur.grnIn += r.grnInQty;
      cur.ordered += r.orderedQty;
      cur.dispatched += r.dispatchedQty;
      cur.delivered += r.deliveredQty;
      cur.returnedGood += r.returnedGoodQty;
      cur.damaged += r.damagedQty;
      cur.inTransit += r.inTransitQty;
      cur.rtvOut += r.rtvOutQty;
      cur.amount += r.amount;
      map.set(r.dateKey, cur);
    }

    return Array.from(map.values())
      .map((x) => ({ ...x, docCount: x.docNos.size }))
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredMovements]);

  // Grouped View 4: By Invoice / Order / GRN / RTV Reference
  const byInvoiceRows = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        documentNo: string;
        finalInvoiceNo?: string;
        documentKind: 'GRN' | 'ORDER' | 'RTV';
        eventLabel: string;
        eventType: NormalizedStockMovement['eventType'];
        dateIso: string;
        dateKey: string;
        salesRepName: string;
        deliverymanName: string;
        counterpartyName: string;
        skuCount: number;
        grnIn: number;
        ordered: number;
        dispatched: number;
        delivered: number;
        returnedGood: number;
        damaged: number;
        inTransit: number;
        rtvOut: number;
        amount: number;
        orderRef?: Order;
        finalInvoiceRef?: FinalInvoice;
      }
    >();

    for (const r of filteredMovements) {
      const key = `${r.documentKind}::${r.documentNo}`;
      const cur = map.get(key) ?? {
        key,
        documentNo: r.documentNo,
        finalInvoiceNo: r.finalInvoiceNo,
        documentKind: r.documentKind,
        eventLabel: r.eventLabel,
        eventType: r.eventType,
        dateIso: r.dateIso,
        dateKey: r.dateKey,
        salesRepName: r.salesRepName,
        deliverymanName: r.deliverymanName,
        counterpartyName: r.counterpartyName,
        skuCount: 0,
        grnIn: 0,
        ordered: 0,
        dispatched: 0,
        delivered: 0,
        returnedGood: 0,
        damaged: 0,
        inTransit: 0,
        rtvOut: 0,
        amount: 0,
        orderRef: r.orderRef,
        finalInvoiceRef: r.finalInvoiceRef,
      };
      cur.skuCount += 1;
      cur.grnIn += r.grnInQty;
      cur.ordered += r.orderedQty;
      cur.dispatched += r.dispatchedQty;
      cur.delivered += r.deliveredQty;
      cur.returnedGood += r.returnedGoodQty;
      cur.damaged += r.damagedQty;
      cur.inTransit += r.inTransitQty;
      cur.rtvOut += r.rtvOutQty;
      cur.amount += r.amount;
      map.set(key, cur);
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.dateIso).getTime() - new Date(a.dateIso).getTime()
    );
  }, [filteredMovements]);

  // Grouped View 5: By Salesman
  const bySalesmanRows = useMemo(() => {
    const map = new Map<
      string,
      {
        salesRepId: string;
        salesRepName: string;
        territory: string;
        ordersSet: Set<string>;
        skusSet: Set<string>;
        ordered: number;
        dispatched: number;
        delivered: number;
        returnedGood: number;
        damaged: number;
        inTransit: number;
        amount: number;
      }
    >();

    for (const r of filteredMovements) {
      if (!r.salesRepId) continue;
      const user = state.users.find((u) => u.id === r.salesRepId);
      const cur = map.get(r.salesRepId) ?? {
        salesRepId: r.salesRepId,
        salesRepName: r.salesRepName,
        territory: user?.territory || '—',
        ordersSet: new Set<string>(),
        skusSet: new Set<string>(),
        ordered: 0,
        dispatched: 0,
        delivered: 0,
        returnedGood: 0,
        damaged: 0,
        inTransit: 0,
        amount: 0,
      };
      cur.ordersSet.add(r.documentNo);
      cur.skusSet.add(r.sku);
      cur.ordered += r.orderedQty;
      cur.dispatched += r.dispatchedQty;
      cur.delivered += r.deliveredQty;
      cur.returnedGood += r.returnedGoodQty;
      cur.damaged += r.damagedQty;
      cur.inTransit += r.inTransitQty;
      cur.amount += r.amount;
      map.set(r.salesRepId, cur);
    }

    return Array.from(map.values())
      .map((x) => ({
        ...x,
        orderCount: x.ordersSet.size,
        skuCount: x.skusSet.size,
        deliveryRate: x.ordered > 0 ? Math.round((x.delivered / x.ordered) * 100) : 0,
      }))
      .sort((a, b) => b.ordered - a.ordered);
  }, [filteredMovements, state.users]);

  // Grouped View 6: By Deliveryman
  const byDeliverymanRows = useMemo(() => {
    const map = new Map<
      string,
      {
        deliverymanId: string;
        deliverymanName: string;
        vehicleNo: string;
        ordersSet: Set<string>;
        invoicesSet: Set<string>;
        dispatched: number;
        delivered: number;
        returnedGood: number;
        damaged: number;
        inTransit: number;
        amount: number;
      }
    >();

    for (const r of filteredMovements) {
      if (!r.deliverymanId) continue;
      const user = state.users.find((u) => u.id === r.deliverymanId);
      const cur = map.get(r.deliverymanId) ?? {
        deliverymanId: r.deliverymanId,
        deliverymanName: r.deliverymanName,
        vehicleNo: user?.vehicleNo || '—',
        ordersSet: new Set<string>(),
        invoicesSet: new Set<string>(),
        dispatched: 0,
        delivered: 0,
        returnedGood: 0,
        damaged: 0,
        inTransit: 0,
        amount: 0,
      };
      cur.ordersSet.add(r.documentNo);
      if (r.finalInvoiceNo) cur.invoicesSet.add(r.finalInvoiceNo);
      cur.dispatched += r.dispatchedQty;
      cur.delivered += r.deliveredQty;
      cur.returnedGood += r.returnedGoodQty;
      cur.damaged += r.damagedQty;
      cur.inTransit += r.inTransitQty;
      cur.amount += r.amount;
      map.set(r.deliverymanId, cur);
    }

    return Array.from(map.values())
      .map((x) => ({
        ...x,
        orderCount: x.ordersSet.size,
        invoiceCount: x.invoicesSet.size,
        deliveryRate: x.dispatched > 0 ? Math.round((x.delivered / x.dispatched) * 100) : 0,
      }))
      .sort((a, b) => b.dispatched - a.dispatched);
  }, [filteredMovements, state.users]);

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (fromDate || toDate) parts.push(`Date: ${fromDate || 'Start'} to ${toDate || 'Today'}`);
    if (selectedInvoiceNo !== 'ALL') parts.push(`Invoice/Ref: ${selectedInvoiceNo}`);
    if (invoiceSearch.trim()) parts.push(`Search: "${invoiceSearch.trim()}"`);
    if (selectedSalesRepId !== 'ALL') {
      parts.push(
        `Salesman: ${salesReps.find((u) => u.id === selectedSalesRepId)?.name ?? selectedSalesRepId}`
      );
    }
    if (selectedDeliverymanId !== 'ALL') {
      parts.push(
        `Deliveryman: ${
          deliverymen.find((u) => u.id === selectedDeliverymanId)?.name ?? selectedDeliverymanId
        }`
      );
    }
    if (selectedProductId !== 'ALL') {
      const p = productMap.get(selectedProductId);
      parts.push(`Product: ${p ? `${p.sku} (${p.name})` : selectedProductId}`);
    }
    if (selectedCategory !== 'ALL') parts.push(`Category: ${selectedCategory}`);
    if (selectedStoreId !== 'ALL') {
      parts.push(
        `Store: ${state.stores.find((s) => s.id === selectedStoreId)?.name ?? selectedStoreId}`
      );
    }
    if (eventFilter !== 'ALL') parts.push(`Event: ${eventFilter.replace(/_/g, ' ')}`);
    return parts.length > 0 ? parts.join(' · ') : 'All Stock Records & Dates';
  }, [
    fromDate,
    toDate,
    selectedInvoiceNo,
    invoiceSearch,
    selectedSalesRepId,
    selectedDeliverymanId,
    selectedProductId,
    selectedCategory,
    selectedStoreId,
    eventFilter,
    salesReps,
    deliverymen,
    productMap,
    state.stores,
  ]);

  const handleExportCsv = () => {
    const stamp = toDateKey(new Date());
    if (groupMode === 'DETAILED') {
      downloadCsv(
        `warehouse-stock-query-detailed-${stamp}.csv`,
        [
          'Date',
          'Event',
          'Order/Ref #',
          'Final Invoice #',
          'SKU',
          'Product',
          'Category',
          'Salesman',
          'Deliveryman',
          'Store/Supplier',
          'GRN In',
          'Ordered',
          'Dispatched',
          'Delivered',
          'Returned Good',
          'Damaged',
          'In-Transit',
          'RTV Out',
          'Value (BDT)',
        ],
        filteredMovements.map((r) => [
          r.dateKey,
          r.eventLabel,
          r.documentNo,
          r.finalInvoiceNo ?? '',
          r.sku,
          r.productName,
          r.category,
          r.salesRepName,
          r.deliverymanName,
          r.counterpartyName,
          r.grnInQty,
          r.orderedQty,
          r.dispatchedQty,
          r.deliveredQty,
          r.returnedGoodQty,
          r.damagedQty,
          r.inTransitQty,
          r.rtvOutQty,
          r.amount,
        ])
      );
    } else if (groupMode === 'BY_SKU') {
      downloadCsv(
        `warehouse-stock-query-by-sku-${stamp}.csv`,
        [
          'SKU',
          'Product',
          'Category',
          'Unit',
          'GRN In',
          'Ordered',
          'Dispatched',
          'Delivered',
          'Returned Good',
          'Damaged',
          'In-Transit (Query)',
          'RTV Out',
          'Live Sellable',
          'Live In-Transit',
          'Live Damaged',
          'Value (BDT)',
        ],
        bySkuRows.map((r) => [
          r.sku,
          r.productName,
          r.category,
          r.unit,
          r.grnIn,
          r.ordered,
          r.dispatched,
          r.delivered,
          r.returnedGood,
          r.damaged,
          r.inTransit,
          r.rtvOut,
          r.liveSellable,
          r.liveInTransit,
          r.liveDamaged,
          r.amount,
        ])
      );
    } else if (groupMode === 'BY_DATE') {
      downloadCsv(
        `warehouse-stock-query-by-date-${stamp}.csv`,
        [
          'Date',
          'Documents',
          'GRN In',
          'Ordered',
          'Dispatched',
          'Delivered',
          'Returned Good',
          'Damaged',
          'In-Transit',
          'RTV Out',
          'Value (BDT)',
        ],
        byDateRows.map((r) => [
          r.dateKey,
          r.docCount,
          r.grnIn,
          r.ordered,
          r.dispatched,
          r.delivered,
          r.returnedGood,
          r.damaged,
          r.inTransit,
          r.rtvOut,
          r.amount,
        ])
      );
    } else if (groupMode === 'BY_INVOICE') {
      downloadCsv(
        `warehouse-stock-query-by-invoice-${stamp}.csv`,
        [
          'Document #',
          'Final Invoice #',
          'Date',
          'Type / Status',
          'Salesman',
          'Deliveryman',
          'Store/Supplier',
          'SKUs',
          'GRN In',
          'Ordered',
          'Dispatched',
          'Delivered',
          'Returned Good',
          'Damaged',
          'RTV Out',
          'Value (BDT)',
        ],
        byInvoiceRows.map((r) => [
          r.documentNo,
          r.finalInvoiceNo ?? '',
          r.dateKey,
          r.eventLabel,
          r.salesRepName,
          r.deliverymanName,
          r.counterpartyName,
          r.skuCount,
          r.grnIn,
          r.ordered,
          r.dispatched,
          r.delivered,
          r.returnedGood,
          r.damaged,
          r.rtvOut,
          r.amount,
        ])
      );
    } else if (groupMode === 'BY_SALESMAN') {
      downloadCsv(
        `warehouse-stock-query-by-salesman-${stamp}.csv`,
        [
          'Salesman',
          'Territory',
          'Orders',
          'Distinct SKUs',
          'Ordered Qty',
          'Dispatched Qty',
          'Delivered Qty',
          'Returned Good',
          'Damaged',
          'In-Transit',
          'Delivery %',
          'Value (BDT)',
        ],
        bySalesmanRows.map((r) => [
          r.salesRepName,
          r.territory,
          r.orderCount,
          r.skuCount,
          r.ordered,
          r.dispatched,
          r.delivered,
          r.returnedGood,
          r.damaged,
          r.inTransit,
          `${r.deliveryRate}%`,
          r.amount,
        ])
      );
    } else {
      downloadCsv(
        `warehouse-stock-query-by-deliveryman-${stamp}.csv`,
        [
          'Deliveryman',
          'Vehicle #',
          'Orders',
          'Final Invoices',
          'Dispatched Qty',
          'Delivered Qty',
          'Returned Good',
          'Damaged',
          'In-Transit',
          'Delivery %',
          'Value (BDT)',
        ],
        byDeliverymanRows.map((r) => [
          r.deliverymanName,
          r.vehicleNo,
          r.orderCount,
          r.invoiceCount,
          r.dispatched,
          r.delivered,
          r.returnedGood,
          r.damaged,
          r.inTransit,
          `${r.deliveryRate}%`,
          r.amount,
        ])
      );
    }
  };

  const handlePrintCurrentQuery = () => {
    const summaryMetrics = [
      { label: 'GRN In', value: String(totals.grnIn) },
      { label: 'Dispatched', value: String(totals.dispatched) },
      { label: 'Delivered', value: String(totals.delivered) },
      { label: 'Returned Good', value: String(totals.returnedGood) },
      { label: 'Damaged / RTV', value: `${totals.damaged} / ${totals.rtvOut}` },
      { label: 'Query Value', value: formatCurrency(totals.amount) },
    ];

    if (groupMode === 'BY_SKU') {
      onPrintReport({
        title: 'Warehouse Stock Query — By SKU & Product',
        subtitle: activeFilterSummary,
        periodLabel: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Dates',
        summaryMetrics,
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'product', label: 'Product' },
          { key: 'grnIn', label: 'GRN In', align: 'right' },
          { key: 'dispatched', label: 'Dispatched', align: 'right' },
          { key: 'delivered', label: 'Delivered', align: 'right' },
          { key: 'returned', label: 'Ret. Good', align: 'right' },
          { key: 'damaged', label: 'Damaged', align: 'right' },
          { key: 'liveTotal', label: 'Live Stock', align: 'right' },
          { key: 'value', label: 'Value', align: 'right' },
        ],
        rows: bySkuRows.map((r) => ({
          sku: r.sku,
          product: r.productName,
          grnIn: r.grnIn,
          dispatched: r.dispatched,
          delivered: r.delivered,
          returned: r.returnedGood,
          damaged: r.damaged,
          liveTotal: r.liveSellable + r.liveInTransit + r.liveDamaged,
          value: formatCurrency(r.amount),
        })),
        footerTotals: {
          sku: 'TOTAL',
          product: `${bySkuRows.length} SKUs`,
          grnIn: totals.grnIn,
          dispatched: totals.dispatched,
          delivered: totals.delivered,
          returned: totals.returnedGood,
          damaged: totals.damaged,
          liveTotal: bySkuRows.reduce(
            (s, r) => s + r.liveSellable + r.liveInTransit + r.liveDamaged,
            0
          ),
          value: formatCurrency(totals.amount),
        },
      });
      return;
    }

    if (groupMode === 'BY_DATE') {
      onPrintReport({
        title: 'Warehouse Stock Query — By Date',
        subtitle: activeFilterSummary,
        periodLabel: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Dates',
        summaryMetrics,
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'docs', label: 'Docs', align: 'right' },
          { key: 'grnIn', label: 'GRN In', align: 'right' },
          { key: 'dispatched', label: 'Dispatched', align: 'right' },
          { key: 'delivered', label: 'Delivered', align: 'right' },
          { key: 'returned', label: 'Ret. Good', align: 'right' },
          { key: 'damaged', label: 'Damaged', align: 'right' },
          { key: 'value', label: 'Value', align: 'right' },
        ],
        rows: byDateRows.map((r) => ({
          date: r.dateKey,
          docs: r.docCount,
          grnIn: r.grnIn,
          dispatched: r.dispatched,
          delivered: r.delivered,
          returned: r.returnedGood,
          damaged: r.damaged,
          value: formatCurrency(r.amount),
        })),
        footerTotals: {
          date: 'TOTAL',
          docs: byDateRows.reduce((s, r) => s + r.docCount, 0),
          grnIn: totals.grnIn,
          dispatched: totals.dispatched,
          delivered: totals.delivered,
          returned: totals.returnedGood,
          damaged: totals.damaged,
          value: formatCurrency(totals.amount),
        },
      });
      return;
    }

    if (groupMode === 'BY_INVOICE') {
      onPrintReport({
        title: 'Warehouse Stock Query — By Invoice / Reference',
        subtitle: activeFilterSummary,
        periodLabel: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Dates',
        summaryMetrics,
        columns: [
          { key: 'docNo', label: 'Invoice / Ref #' },
          { key: 'date', label: 'Date' },
          { key: 'salesman', label: 'Salesman' },
          { key: 'deliveryman', label: 'Deliveryman' },
          { key: 'ordered', label: 'Ord/In', align: 'right' },
          { key: 'delivered', label: 'Delivered', align: 'right' },
          { key: 'returned', label: 'Returned', align: 'right' },
          { key: 'value', label: 'Value', align: 'right' },
        ],
        rows: byInvoiceRows.map((r) => ({
          docNo: r.finalInvoiceNo ? `${r.documentNo} / ${r.finalInvoiceNo}` : r.documentNo,
          date: r.dateKey,
          salesman: r.salesRepName,
          deliveryman: r.deliverymanName,
          ordered: r.grnIn || r.ordered || r.rtvOut,
          delivered: r.delivered,
          returned: r.returnedGood + r.damaged,
          value: formatCurrency(r.amount),
        })),
        footerTotals: {
          docNo: 'TOTAL',
          date: `${byInvoiceRows.length} Docs`,
          salesman: '',
          deliveryman: '',
          ordered: totals.grnIn + totals.ordered + totals.rtvOut,
          delivered: totals.delivered,
          returned: totals.returnedGood + totals.damaged,
          value: formatCurrency(totals.amount),
        },
      });
      return;
    }

    if (groupMode === 'BY_SALESMAN') {
      onPrintReport({
        title: 'Warehouse Stock Query — By Salesman',
        subtitle: activeFilterSummary,
        periodLabel: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Dates',
        summaryMetrics,
        columns: [
          { key: 'name', label: 'Salesman' },
          { key: 'orders', label: 'Orders', align: 'right' },
          { key: 'ordered', label: 'Ordered', align: 'right' },
          { key: 'dispatched', label: 'Dispatched', align: 'right' },
          { key: 'delivered', label: 'Delivered', align: 'right' },
          { key: 'returned', label: 'Ret. Good', align: 'right' },
          { key: 'damaged', label: 'Damaged', align: 'right' },
          { key: 'value', label: 'Value', align: 'right' },
        ],
        rows: bySalesmanRows.map((r) => ({
          name: r.salesRepName,
          orders: r.orderCount,
          ordered: r.ordered,
          dispatched: r.dispatched,
          delivered: r.delivered,
          returned: r.returnedGood,
          damaged: r.damaged,
          value: formatCurrency(r.amount),
        })),
        footerTotals: {
          name: 'TOTAL',
          orders: bySalesmanRows.reduce((s, r) => s + r.orderCount, 0),
          ordered: bySalesmanRows.reduce((s, r) => s + r.ordered, 0),
          dispatched: bySalesmanRows.reduce((s, r) => s + r.dispatched, 0),
          delivered: bySalesmanRows.reduce((s, r) => s + r.delivered, 0),
          returned: bySalesmanRows.reduce((s, r) => s + r.returnedGood, 0),
          damaged: bySalesmanRows.reduce((s, r) => s + r.damaged, 0),
          value: formatCurrency(bySalesmanRows.reduce((s, r) => s + r.amount, 0)),
        },
      });
      return;
    }

    if (groupMode === 'BY_DELIVERYMAN') {
      onPrintReport({
        title: 'Warehouse Stock Query — By Deliveryman',
        subtitle: activeFilterSummary,
        periodLabel: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Dates',
        summaryMetrics,
        columns: [
          { key: 'name', label: 'Deliveryman' },
          { key: 'orders', label: 'Orders', align: 'right' },
          { key: 'dispatched', label: 'Dispatched', align: 'right' },
          { key: 'delivered', label: 'Delivered', align: 'right' },
          { key: 'returned', label: 'Ret. Good', align: 'right' },
          { key: 'damaged', label: 'Damaged', align: 'right' },
          { key: 'inTransit', label: 'In-Transit', align: 'right' },
          { key: 'value', label: 'Value', align: 'right' },
        ],
        rows: byDeliverymanRows.map((r) => ({
          name: `${r.deliverymanName} (${r.vehicleNo})`,
          orders: r.orderCount,
          dispatched: r.dispatched,
          delivered: r.delivered,
          returned: r.returnedGood,
          damaged: r.damaged,
          inTransit: r.inTransit,
          value: formatCurrency(r.amount),
        })),
        footerTotals: {
          name: 'TOTAL',
          orders: byDeliverymanRows.reduce((s, r) => s + r.orderCount, 0),
          dispatched: byDeliverymanRows.reduce((s, r) => s + r.dispatched, 0),
          delivered: byDeliverymanRows.reduce((s, r) => s + r.delivered, 0),
          returned: byDeliverymanRows.reduce((s, r) => s + r.returnedGood, 0),
          damaged: byDeliverymanRows.reduce((s, r) => s + r.damaged, 0),
          inTransit: byDeliverymanRows.reduce((s, r) => s + r.inTransit, 0),
          value: formatCurrency(byDeliverymanRows.reduce((s, r) => s + r.amount, 0)),
        },
      });
      return;
    }

    // DETAILED
    onPrintReport({
      title: 'Warehouse Stock Movement Query — Detailed Ledger',
      subtitle: activeFilterSummary,
      periodLabel: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : 'All Dates',
      summaryMetrics,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'docNo', label: 'Invoice / Ref #' },
        { key: 'sku', label: 'SKU' },
        { key: 'event', label: 'Event' },
        { key: 'salesman', label: 'Salesman' },
        { key: 'deliveryman', label: 'Deliveryman' },
        { key: 'qty', label: 'In/Ord/Del', align: 'right' },
        { key: 'value', label: 'Value', align: 'right' },
      ],
      rows: filteredMovements.map((r) => ({
        date: r.dateKey,
        docNo: r.finalInvoiceNo ? `${r.documentNo} / ${r.finalInvoiceNo}` : r.documentNo,
        sku: `${r.sku} — ${r.productName}`,
        event: r.eventLabel,
        salesman: r.salesRepName,
        deliveryman: r.deliverymanName,
        qty:
          r.documentKind === 'GRN'
            ? `+${r.grnInQty}`
            : r.documentKind === 'RTV'
            ? `-${r.rtvOutQty}`
            : `${r.orderedQty}/${r.deliveredQty}`,
        value: formatCurrency(r.amount),
      })),
      footerTotals: {
        date: 'TOTAL',
        docNo: `${filteredMovements.length} Rows`,
        sku: '',
        event: '',
        salesman: '',
        deliveryman: '',
        qty: `In:${totals.grnIn} Del:${totals.delivered}`,
        value: formatCurrency(totals.amount),
      },
    });
  };

  const eventBadgeVariant = (
    t: NormalizedStockMovement['eventType']
  ): 'emerald' | 'amber' | 'blue' | 'rose' | 'slate' => {
    switch (t) {
      case 'GRN_IN':
        return 'emerald';
      case 'ORDER_PENDING':
        return 'amber';
      case 'DISPATCHED_IN_TRANSIT':
        return 'blue';
      case 'DELIVERED_AWAITING_RETURN':
        return 'amber';
      case 'RECONCILED_INVOICED':
        return 'emerald';
      case 'RTV_OUT':
        return 'rose';
    }
  };

  const groupButtons: { id: StockQueryGroupMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'DETAILED', label: 'Detailed Ledger', icon: FileSpreadsheet },
    { id: 'BY_SKU', label: 'By SKU / Product', icon: Package },
    { id: 'BY_DATE', label: 'By Date', icon: Calendar },
    { id: 'BY_INVOICE', label: 'By Invoice / Ref', icon: Search },
    { id: 'BY_SALESMAN', label: 'By Salesman', icon: Users },
    { id: 'BY_DELIVERYMAN', label: 'By Deliveryman', icon: Truck },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">
              Warehouse Stock Query Generator
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Combine any filters — Date, Invoice/Order/GRN/RTV #, Salesman, Deliveryman, SKU/Product,
            Category, Store, or Stock Event — and group results in any format
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Filters
            </button>
          )}
          <button
            type="button"
            onClick={handlePrintCurrentQuery}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Query
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Multi-Dimensional Filter Panel */}
      <div className="p-5 bg-slate-50/70 border-b border-slate-200 space-y-4">
        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mr-1">
              Date Range:
            </span>
            {(
              [
                { id: 'ALL', label: 'All Dates' },
                { id: 'TODAY', label: 'Today' },
                { id: 'LAST_7', label: 'Last 7 Days' },
                { id: 'LAST_30', label: 'Last 30 Days' },
                { id: 'THIS_MONTH', label: 'This Month' },
              ] as { id: DatePreset; label: string }[]
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyDatePreset(p.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-500 font-medium">
            {filteredMovements.length} matching stock record
            {filteredMovements.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Combinable Filter Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Date From */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset('ALL');
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset('ALL');
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          {/* Invoice / Order / GRN / RTV Dropdown */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              By Invoice / Order / Ref #
            </label>
            <select
              value={selectedInvoiceNo}
              onChange={(e) => setSelectedInvoiceNo(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Invoices &amp; References ({invoiceOptions.length})</option>
              {invoiceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Keyword / Invoice # Search */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Quick Search (Invoice, SKU, Name)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                placeholder="ORD-, FINV-, SKU, store..."
                className="w-full pl-8 pr-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* By Salesman */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">By Salesman</label>
            <select
              value={selectedSalesRepId}
              onChange={(e) => setSelectedSalesRepId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Salesmen ({salesReps.length})</option>
              {salesReps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                  {rep.territory ? ` (${rep.territory})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* By Deliveryman */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">By Deliveryman</label>
            <select
              value={selectedDeliverymanId}
              onChange={(e) => setSelectedDeliverymanId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Deliverymen ({deliverymen.length})</option>
              {deliverymen.map((drv) => (
                <option key={drv.id} value={drv.id}>
                  {drv.name}
                  {drv.vehicleNo ? ` (${drv.vehicleNo})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* By SKU / Product */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">By SKU / Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Products / SKUs ({state.products.length})</option>
              {state.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* By Stock Event Type */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Stock Event / Status</label>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value as StockEventFilter)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Stock Events</option>
              <option value="GRN_IN">GRN Received (Stock In)</option>
              <option value="ORDER_PENDING">Pending Dispatch Orders</option>
              <option value="DISPATCHED_IN_TRANSIT">Dispatched (In-Transit)</option>
              <option value="DELIVERED_AWAITING_RETURN">Delivered (Return Pending)</option>
              <option value="RECONCILED_INVOICED">Reconciled &amp; Final Invoiced</option>
              <option value="HAS_RETURN_OR_DAMAGE">Returns / Damaged / RTV Only</option>
              <option value="RTV_OUT">RTV Debit Note (To Manufacturer)</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">By Product Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Categories ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Retail Store */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">By Retail Store</label>
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="ALL">All Stores ({state.stores.length})</option>
              {state.stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.zone})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Grouping Mode Selector */}
        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mr-1">
            Group Query Result:
          </span>
          {groupButtons.map((btn) => {
            const Icon = btn.icon;
            const active = groupMode === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => setGroupMode(btn.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Live Query Totals Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-x divide-y sm:divide-y-0 divide-slate-200 border-b border-slate-200 bg-white text-xs">
        <div className="p-3">
          <p className="text-[11px] text-slate-500 font-medium">GRN Stock In</p>
          <p className="font-mono text-sm font-bold text-emerald-700 mt-0.5">+{totals.grnIn}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-slate-500 font-medium">Ordered Qty</p>
          <p className="font-mono text-sm font-bold text-slate-900 mt-0.5">{totals.ordered}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-slate-500 font-medium">Dispatched Qty</p>
          <p className="font-mono text-sm font-bold text-blue-700 mt-0.5">{totals.dispatched}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-slate-500 font-medium">Delivered Qty</p>
          <p className="font-mono text-sm font-bold text-emerald-700 mt-0.5">{totals.delivered}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-slate-500 font-medium">Returned Good</p>
          <p className="font-mono text-sm font-bold text-indigo-700 mt-0.5">
            {totals.returnedGood}
          </p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-slate-500 font-medium">Damaged</p>
          <p className="font-mono text-sm font-bold text-rose-700 mt-0.5">{totals.damaged}</p>
        </div>
        <div className="p-3">
          <p className="text-[11px] text-slate-500 font-medium">In-Transit / RTV</p>
          <p className="font-mono text-sm font-bold text-amber-700 mt-0.5">
            {totals.inTransit} / {totals.rtvOut}
          </p>
        </div>
        <div className="p-3 bg-slate-50/70">
          <p className="text-[11px] text-slate-500 font-medium">Query Value</p>
          <p className="font-mono text-sm font-bold text-slate-900 mt-0.5">
            {formatCurrency(totals.amount)}
          </p>
        </div>
      </div>

      {/* Results Table by Selected Grouping Mode */}
      <div className="overflow-x-auto">
        {groupMode === 'DETAILED' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Date</th>
                <th className="py-2.5 px-3 font-semibold">Event</th>
                <th className="py-2.5 px-3 font-semibold">Invoice / Order / Ref #</th>
                <th className="py-2.5 px-3 font-semibold">SKU &amp; Product</th>
                <th className="py-2.5 px-3 font-semibold">Salesman</th>
                <th className="py-2.5 px-3 font-semibold">Deliveryman</th>
                <th className="py-2.5 px-3 font-semibold">Store / Supplier</th>
                <th className="py-2.5 px-3 font-semibold text-right">GRN In</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ordered</th>
                <th className="py-2.5 px-3 font-semibold text-right">Delivered</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ret. Good</th>
                <th className="py-2.5 px-3 font-semibold text-right">Damaged</th>
                <th className="py-2.5 px-3 font-semibold text-right">Value</th>
                <th className="py-2.5 px-3 font-semibold text-right">Print</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-10 px-4 text-center text-slate-500">
                    No stock movements match your current query filters.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                      <p className="font-mono font-medium text-slate-800">{r.dateKey}</p>
                      <p className="text-[10px] text-slate-400">{formatDateTime(r.dateIso)}</p>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StatusBadge variant={eventBadgeVariant(r.eventType)} label={r.eventLabel} />
                    </td>
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      <p className="font-semibold text-slate-900">{r.documentNo}</p>
                      {r.finalInvoiceNo && (
                        <p className="text-[10px] text-blue-700 font-semibold">
                          {r.finalInvoiceNo}
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-slate-900">{r.productName}</p>
                      <p className="font-mono text-[11px] text-slate-500">
                        {r.sku} · {r.category}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{r.salesRepName}</td>
                    <td className="py-2.5 px-3 text-slate-700">{r.deliverymanName}</td>
                    <td className="py-2.5 px-3 text-slate-700">{r.counterpartyName}</td>
                    <td className="py-2.5 px-3 font-mono text-right text-emerald-700 font-semibold">
                      {r.grnInQty > 0 ? `+${r.grnInQty}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-slate-800">
                      {r.orderedQty > 0 ? r.orderedQty : r.rtvOutQty > 0 ? `RTV -${r.rtvOutQty}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-emerald-700">
                      {r.deliveredQty > 0 ? r.deliveredQty : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-indigo-700">
                      {r.returnedGoodQty > 0 ? r.returnedGoodQty : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-rose-700">
                      {r.damagedQty > 0 ? r.damagedQty : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.finalInvoiceRef ? (
                        <button
                          type="button"
                          onClick={() => onPrintFinalInvoice(r.finalInvoiceRef!)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          Invoice
                        </button>
                      ) : r.orderRef ? (
                        <button
                          type="button"
                          onClick={() => onPrintOrder(r.orderRef!)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          Challan
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {groupMode === 'BY_SKU' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-semibold">SKU</th>
                <th className="py-2.5 px-3 font-semibold">Product &amp; Category</th>
                <th className="py-2.5 px-3 font-semibold text-right">GRN In</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ordered</th>
                <th className="py-2.5 px-3 font-semibold text-right">Dispatched</th>
                <th className="py-2.5 px-3 font-semibold text-right">Delivered</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ret. Good</th>
                <th className="py-2.5 px-3 font-semibold text-right">Damaged</th>
                <th className="py-2.5 px-3 font-semibold text-right">RTV Out</th>
                <th className="py-2.5 px-3 font-semibold text-right">Live Sellable</th>
                <th className="py-2.5 px-3 font-semibold text-right">Live Total</th>
                <th className="py-2.5 px-3 font-semibold text-right">Query Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bySkuRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-10 px-4 text-center text-slate-500">
                    No SKU stock records match your query filters.
                  </td>
                </tr>
              ) : (
                bySkuRows.map((r) => (
                  <tr key={r.productId} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">{r.sku}</td>
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-slate-900">{r.productName}</p>
                      <p className="text-[11px] text-slate-500">
                        {r.category} · {r.unit}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-emerald-700 font-semibold">
                      +{r.grnIn}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right">{r.ordered}</td>
                    <td className="py-2.5 px-3 font-mono text-right text-blue-700">
                      {r.dispatched}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-emerald-700">
                      {r.delivered}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-indigo-700">
                      {r.returnedGood}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-rose-700">{r.damaged}</td>
                    <td className="py-2.5 px-3 font-mono text-right text-rose-700">{r.rtvOut}</td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-emerald-700 bg-emerald-50/40">
                      {r.liveSellable}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-bold text-slate-900 bg-slate-50/60">
                      {r.liveSellable + r.liveInTransit + r.liveDamaged}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-slate-900">
                      {formatCurrency(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {groupMode === 'BY_DATE' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Date</th>
                <th className="py-2.5 px-4 font-semibold text-right">Invoices / Docs</th>
                <th className="py-2.5 px-4 font-semibold text-right">GRN Stock In</th>
                <th className="py-2.5 px-4 font-semibold text-right">Ordered Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Dispatched Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delivered Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Returned Good</th>
                <th className="py-2.5 px-4 font-semibold text-right">Damaged</th>
                <th className="py-2.5 px-4 font-semibold text-right">In-Transit</th>
                <th className="py-2.5 px-4 font-semibold text-right">RTV Out</th>
                <th className="py-2.5 px-4 font-semibold text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {byDateRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 px-4 text-center text-slate-500">
                    No dated stock records match your query filters.
                  </td>
                </tr>
              ) : (
                byDateRows.map((r) => (
                  <tr key={r.dateKey} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{r.dateKey}</td>
                    <td className="py-2.5 px-4 font-mono text-right text-slate-700">{r.docCount}</td>
                    <td className="py-2.5 px-4 font-mono text-right text-emerald-700 font-semibold">
                      +{r.grnIn}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right">{r.ordered}</td>
                    <td className="py-2.5 px-4 font-mono text-right text-blue-700">
                      {r.dispatched}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                      {r.delivered}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-indigo-700">
                      {r.returnedGood}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-rose-700">{r.damaged}</td>
                    <td className="py-2.5 px-4 font-mono text-right text-amber-700">
                      {r.inTransit}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-rose-700">{r.rtvOut}</td>
                    <td className="py-2.5 px-4 font-mono text-right font-bold text-slate-900">
                      {formatCurrency(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {groupMode === 'BY_INVOICE' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Order / Ref #</th>
                <th className="py-2.5 px-3 font-semibold">Final Invoice #</th>
                <th className="py-2.5 px-3 font-semibold">Date</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold">Salesman</th>
                <th className="py-2.5 px-3 font-semibold">Deliveryman</th>
                <th className="py-2.5 px-3 font-semibold">Store / Supplier</th>
                <th className="py-2.5 px-3 font-semibold text-right">SKUs</th>
                <th className="py-2.5 px-3 font-semibold text-right">In / Ordered</th>
                <th className="py-2.5 px-3 font-semibold text-right">Delivered</th>
                <th className="py-2.5 px-3 font-semibold text-right">Ret. / Dmg</th>
                <th className="py-2.5 px-3 font-semibold text-right">Value</th>
                <th className="py-2.5 px-3 font-semibold text-right">Print</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {byInvoiceRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 px-4 text-center text-slate-500">
                    No invoices or stock documents match your query filters.
                  </td>
                </tr>
              ) : (
                byInvoiceRows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {r.documentNo}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-blue-700">
                      {r.finalInvoiceNo ?? '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{r.dateKey}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <StatusBadge variant={eventBadgeVariant(r.eventType)} label={r.eventLabel} />
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">{r.salesRepName}</td>
                    <td className="py-2.5 px-3 text-slate-700">{r.deliverymanName}</td>
                    <td className="py-2.5 px-3 text-slate-700">{r.counterpartyName}</td>
                    <td className="py-2.5 px-3 font-mono text-right text-slate-600">
                      {r.skuCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-medium text-slate-900">
                      {r.documentKind === 'GRN'
                        ? `+${r.grnIn}`
                        : r.documentKind === 'RTV'
                        ? `-${r.rtvOut}`
                        : r.ordered}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-semibold text-emerald-700">
                      {r.delivered}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-slate-700">
                      {r.returnedGood} / <span className="text-rose-700">{r.damaged}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-bold text-slate-900">
                      {formatCurrency(r.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.finalInvoiceRef ? (
                        <button
                          type="button"
                          onClick={() => onPrintFinalInvoice(r.finalInvoiceRef!)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          Final Inv
                        </button>
                      ) : r.orderRef ? (
                        <button
                          type="button"
                          onClick={() => onPrintOrder(r.orderRef!)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          Challan
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {groupMode === 'BY_SALESMAN' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Salesman</th>
                <th className="py-2.5 px-4 font-semibold">Territory</th>
                <th className="py-2.5 px-4 font-semibold text-right">Orders</th>
                <th className="py-2.5 px-4 font-semibold text-right">Distinct SKUs</th>
                <th className="py-2.5 px-4 font-semibold text-right">Ordered Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Dispatched Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delivered Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Returned Good</th>
                <th className="py-2.5 px-4 font-semibold text-right">Damaged</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delivery Rate</th>
                <th className="py-2.5 px-4 font-semibold text-right">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bySalesmanRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 px-4 text-center text-slate-500">
                    No salesman stock activity matches your query filters.
                  </td>
                </tr>
              ) : (
                bySalesmanRows.map((r) => (
                  <tr key={r.salesRepId} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSalesRepId(r.salesRepId);
                          setGroupMode('DETAILED');
                        }}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 cursor-pointer"
                        title="Drill down into this salesman's stock ledger"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                        {r.salesRepName}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{r.territory}</td>
                    <td className="py-2.5 px-4 font-mono text-right">{r.orderCount}</td>
                    <td className="py-2.5 px-4 font-mono text-right">{r.skuCount}</td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-slate-900">
                      {r.ordered}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-blue-700">
                      {r.dispatched}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                      {r.delivered}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-indigo-700">
                      {r.returnedGood}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-rose-700">{r.damaged}</td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-slate-700">
                      {r.deliveryRate}%
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-bold text-slate-900">
                      {formatCurrency(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {groupMode === 'BY_DELIVERYMAN' && (
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                <th className="py-2.5 px-4 font-semibold">Vehicle #</th>
                <th className="py-2.5 px-4 font-semibold text-right">Orders</th>
                <th className="py-2.5 px-4 font-semibold text-right">Final Invoices</th>
                <th className="py-2.5 px-4 font-semibold text-right">Dispatched Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delivered Qty</th>
                <th className="py-2.5 px-4 font-semibold text-right">Returned Good</th>
                <th className="py-2.5 px-4 font-semibold text-right">Damaged</th>
                <th className="py-2.5 px-4 font-semibold text-right">Still In-Transit</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delivery Rate</th>
                <th className="py-2.5 px-4 font-semibold text-right">Delivered Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {byDeliverymanRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 px-4 text-center text-slate-500">
                    No deliveryman stock dispatches match your query filters.
                  </td>
                </tr>
              ) : (
                byDeliverymanRows.map((r) => (
                  <tr key={r.deliverymanId} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-4 font-semibold text-slate-900">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDeliverymanId(r.deliverymanId);
                          setGroupMode('DETAILED');
                        }}
                        className="inline-flex items-center gap-1.5 hover:text-blue-700 cursor-pointer"
                        title="Drill down into this deliveryman's stock ledger"
                      >
                        <Truck className="w-3.5 h-3.5 text-slate-400" />
                        {r.deliverymanName}
                      </button>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{r.vehicleNo}</td>
                    <td className="py-2.5 px-4 font-mono text-right">{r.orderCount}</td>
                    <td className="py-2.5 px-4 font-mono text-right text-blue-700">
                      {r.invoiceCount}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-blue-700">
                      {r.dispatched}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                      {r.delivered}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-indigo-700">
                      {r.returnedGood}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-rose-700">{r.damaged}</td>
                    <td className="py-2.5 px-4 font-mono text-right text-amber-700 font-semibold">
                      {r.inTransit}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-slate-700">
                      {r.deliveryRate}%
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-bold text-slate-900">
                      {formatCurrency(r.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
