import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  Package,
  PackagePlus,
  Printer,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { toDateKey, useDMS } from '../../context/DMSContext';
import { FinalInvoice, GRNRecord, Order } from '../../types/dms';
import { FieldAndroidAppBanner } from '../common/FieldAndroidAppBanner';
import {
  PrintableDocumentModal,
  PrintableReportData,
} from '../common/PrintableDocumentModal';
import {
  formatCurrency,
  formatDateTime,
  OrderStatusBadge,
  StatusBadge,
} from '../common/StatusBadge';
import { DashboardLayout, NavItem } from '../layout/DashboardLayout';
import { StockQueryExplorer } from './StockQueryExplorer';

type WarehouseTab = 'overview' | 'queries' | 'dispatch' | 'grn' | 'reconciliation' | 'ledger';
type StockSortKey = 'SKU_ASC' | 'NAME_ASC' | 'TOTAL_DESC' | 'SELLABLE_ASC' | 'VALUE_DESC';

export const WarehousePortal: React.FC = () => {
  const {
    state,
    currentUser,
    getWorkDayStatus,
    receiveStockGRN,
    updateProductStock,
    dispatchOrder,
    reconcileRoute,
  } = useDMS();
  const dayLocked = getWorkDayStatus(currentUser).isLocked;
  const [activeTab, setActiveTab] = useState<WarehouseTab>('overview');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [printableOrder, setPrintableOrder] = useState<Order | null>(null);
  const [printableFinalInvoice, setPrintableFinalInvoice] = useState<FinalInvoice | null>(null);
  const [printableReport, setPrintableReport] = useState<PrintableReportData | null>(null);

  // Front Page SKU / Product Stock Filters
  const [stockSearch, setStockSearch] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState('ALL');
  const [stockSort, setStockSort] = useState<StockSortKey>('SKU_ASC');

  // Dispatch selection per order
  const deliverymen = useMemo(
    () => state.users.filter((u) => u.role === 'DELIVERYMAN' && u.active),
    [state.users]
  );
  const [driverSelection, setDriverSelection] = useState<Record<string, string>>({});

  // GRN Form State
  const [supplierName, setSupplierName] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [grnQtyByProduct, setGrnQtyByProduct] = useState<Record<string, number>>({});
  const [grnInvoiceImageDataUrl, setGrnInvoiceImageDataUrl] = useState<string>('');
  const [grnInvoiceImageName, setGrnInvoiceImageName] = useState<string>('');
  const [previewGrnPhoto, setPreviewGrnPhoto] = useState<GRNRecord | null>(null);

  // Reconciliation State
  const [selectedDriverId, setSelectedDriverId] = useState<string>(deliverymen[0]?.id ?? '');
  const [splitInputs, setSplitInputs] = useState<
    Record<string, { returnedToSellable: number; movedToDamaged: number }>
  >({});

  // Inline Stock Update Drafts (3-Bucket Ledger)
  const [stockDrafts, setStockDrafts] = useState<
    Record<string, { sellableStock: string; damagedStock: string }>
  >({});

  const pendingDispatchOrders = useMemo(
    () => state.orders.filter((o) => o.status === 'PENDING_DISPATCH'),
    [state.orders]
  );

  const unreconciledOrders = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.deliverymanId === selectedDriverId &&
          (o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY') &&
          !o.reconciled
      ),
    [state.orders, selectedDriverId]
  );

  const reconciliationSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        productId: string;
        sku: string;
        productName: string;
        dispatchedQty: number;
        deliveredQty: number;
        unsoldReturnQty: number;
      }
    >();

    for (const ord of unreconciledOrders) {
      for (const item of ord.items) {
        const cur = map.get(item.productId) ?? {
          productId: item.productId,
          sku: item.sku,
          productName: item.productName,
          dispatchedQty: 0,
          deliveredQty: 0,
          unsoldReturnQty: 0,
        };
        cur.dispatchedQty += item.orderedQty;
        cur.deliveredQty += item.deliveredQty;
        cur.unsoldReturnQty = Math.max(0, cur.dispatchedQty - cur.deliveredQty);
        map.set(item.productId, cur);
      }
    }
    return Array.from(map.values());
  }, [unreconciledOrders]);

  const totalUnreconciledCount = useMemo(
    () =>
      state.orders.filter(
        (o) => (o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY') && !o.reconciled
      ).length,
    [state.orders]
  );

  const productCategories = useMemo(() => {
    const set = new Set<string>(state.productCategories);
    state.products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [state.productCategories, state.products]);

  const activeInTransitOrdersCount = useMemo(
    () => state.orders.filter((o) => o.status === 'IN_TRANSIT').length,
    [state.orders]
  );

  // Front Page SKU & Product Stock Metrics (overall)
  const overallStockTotals = useMemo(() => {
    return state.products.reduce(
      (acc, p) => {
        const totalPhysical = p.sellableStock + p.inTransitStock + p.damagedStock;
        acc.skuCount += 1;
        acc.sellable += p.sellableStock;
        acc.inTransit += p.inTransitStock;
        acc.damaged += p.damagedStock;
        acc.totalPhysical += totalPhysical;
        acc.totalCostValue += totalPhysical * p.unitCost;
        acc.sellableRetailValue += p.sellableStock * p.sellingPrice;
        acc.damagedCostValue += p.damagedStock * p.unitCost;
        return acc;
      },
      {
        skuCount: 0,
        sellable: 0,
        inTransit: 0,
        damaged: 0,
        totalPhysical: 0,
        totalCostValue: 0,
        sellableRetailValue: 0,
        damagedCostValue: 0,
      }
    );
  }, [state.products]);

  const filteredStockProducts = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    const list = state.products.filter((p) => {
      if (stockCategoryFilter !== 'ALL' && p.category !== stockCategoryFilter) return false;
      if (q) {
        const hay = `${p.sku} ${p.name} ${p.category} ${p.unit}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      const aTotal = a.sellableStock + a.inTransitStock + a.damagedStock;
      const bTotal = b.sellableStock + b.inTransitStock + b.damagedStock;
      switch (stockSort) {
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        case 'TOTAL_DESC':
          return bTotal - aTotal;
        case 'SELLABLE_ASC':
          return a.sellableStock - b.sellableStock;
        case 'VALUE_DESC':
          return bTotal * b.unitCost - aTotal * a.unitCost;
        case 'SKU_ASC':
        default:
          return a.sku.localeCompare(b.sku);
      }
    });
  }, [state.products, stockSearch, stockCategoryFilter, stockSort]);

  const filteredStockTotals = useMemo(() => {
    return filteredStockProducts.reduce(
      (acc, p) => {
        const total = p.sellableStock + p.inTransitStock + p.damagedStock;
        acc.sellable += p.sellableStock;
        acc.inTransit += p.inTransitStock;
        acc.damaged += p.damagedStock;
        acc.total += total;
        acc.costValue += total * p.unitCost;
        acc.retailValue += p.sellableStock * p.sellingPrice;
        return acc;
      },
      { sellable: 0, inTransit: 0, damaged: 0, total: 0, costValue: 0, retailValue: 0 }
    );
  }, [filteredStockProducts]);

  const handleExportSkuStockCsv = () => {
    const headers = [
      'SKU',
      'Product Name',
      'Category',
      'Unit',
      'Sellable Stock',
      'In-Transit Stock',
      'Damaged Stock',
      'Total Physical Stock',
      'Unit Cost (BDT)',
      'Selling Price (BDT)',
      'Total Cost Value (BDT)',
      'Sellable Retail Value (BDT)',
    ];
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredStockProducts.map((p) => {
      const total = p.sellableStock + p.inTransitStock + p.damagedStock;
      return [
        p.sku,
        p.name,
        p.category,
        p.unit,
        p.sellableStock,
        p.inTransitStock,
        p.damagedStock,
        total,
        p.unitCost,
        p.sellingPrice,
        total * p.unitCost,
        p.sellableStock * p.sellingPrice,
      ];
    });
    const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join(
      '\n'
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warehouse-sku-stock-summary-${toDateKey(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrintSkuStockReport = () => {
    setPrintableReport({
      title: 'Warehouse Total Stock Summary — By SKU & Product',
      subtitle:
        stockCategoryFilter !== 'ALL'
          ? `Category: ${stockCategoryFilter}`
          : 'All Active Warehouse SKUs & Products',
      periodLabel: `As of ${toDateKey(new Date())}`,
      summaryMetrics: [
        { label: 'Total SKUs', value: String(filteredStockProducts.length) },
        { label: 'Sellable Stock', value: String(filteredStockTotals.sellable) },
        { label: 'In-Transit Stock', value: String(filteredStockTotals.inTransit) },
        { label: 'Damaged Stock', value: String(filteredStockTotals.damaged) },
        { label: 'Grand Total Units', value: String(filteredStockTotals.total) },
        { label: 'Cost Valuation', value: formatCurrency(filteredStockTotals.costValue) },
      ],
      columns: [
        { key: 'sku', label: 'SKU' },
        { key: 'product', label: 'Product' },
        { key: 'unit', label: 'Unit' },
        { key: 'sellable', label: 'Sellable', align: 'right' },
        { key: 'inTransit', label: 'In-Transit', align: 'right' },
        { key: 'damaged', label: 'Damaged', align: 'right' },
        { key: 'total', label: 'Total', align: 'right' },
        { key: 'costVal', label: 'Cost Value', align: 'right' },
      ],
      rows: filteredStockProducts.map((p) => {
        const total = p.sellableStock + p.inTransitStock + p.damagedStock;
        return {
          sku: p.sku,
          product: `${p.name} (${p.category})`,
          unit: p.unit,
          sellable: p.sellableStock,
          inTransit: p.inTransitStock,
          damaged: p.damagedStock,
          total,
          costVal: formatCurrency(total * p.unitCost),
        };
      }),
      footerTotals: {
        sku: 'TOTAL',
        product: `${filteredStockProducts.length} SKUs`,
        unit: '',
        sellable: filteredStockTotals.sellable,
        inTransit: filteredStockTotals.inTransit,
        damaged: filteredStockTotals.damaged,
        total: filteredStockTotals.total,
        costVal: formatCurrency(filteredStockTotals.costValue),
      },
    });
  };

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Total Stock by SKU & Product', icon: LayoutDashboard },
    { id: 'queries', label: 'Warehouse Stock Query Generator', icon: Search },
    {
      id: 'dispatch',
      label: 'Order Dispatch Center',
      icon: Truck,
      badge: pendingDispatchOrders.length || undefined,
    },
    { id: 'grn', label: 'Receive Stock (GRN)', icon: PackagePlus },
    {
      id: 'reconciliation',
      label: 'Returns & Final Invoice',
      icon: ClipboardCheck,
      badge: totalUnreconciledCount || undefined,
    },
    { id: 'ledger', label: '3-Bucket Ledger', icon: Boxes },
  ];

  const handleDispatch = (orderId: string) => {
    const driverId = driverSelection[orderId] || deliverymen[0]?.id;
    if (!driverId) {
      setFeedback({ type: 'error', text: 'No active deliveryman available.' });
      return;
    }
    const res = dispatchOrder(orderId, driverId);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Dispatch failed.' });
      return;
    }
    const driverName = deliverymen.find((d) => d.id === driverId)?.name ?? 'Deliveryman';
    setFeedback({
      type: 'success',
      text: `Order dispatched to ${driverName}. Stock moved from Sellable to In-Transit.`,
    });
  };

  const handleGrnInvoiceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', text: 'Please select a valid image file (JPG, PNG, WebP).' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      const img = new window.Image();
      img.onload = () => {
        const maxWidth = 1024;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let compressed = canvas.toDataURL('image/jpeg', 0.72);
          if (compressed.length > 520000) {
            compressed = canvas.toDataURL('image/jpeg', 0.5);
          }
          setGrnInvoiceImageDataUrl(compressed);
        } else {
          setGrnInvoiceImageDataUrl(rawDataUrl);
        }
        setGrnInvoiceImageName(file.name);
        setFeedback(null);
      };
      img.onerror = () => {
        setGrnInvoiceImageDataUrl(rawDataUrl);
        setGrnInvoiceImageName(file.name);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleReceiveGRN = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grnInvoiceImageDataUrl) {
      setFeedback({
        type: 'error',
        text: 'Please capture or upload the supplier invoice picture before posting GRN stock.',
      });
      return;
    }
    const items = Object.entries(grnQtyByProduct)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({ productId, qty }));
    const res = receiveStockGRN(
      supplierName,
      referenceNo,
      items,
      grnInvoiceImageDataUrl,
      grnInvoiceImageName
    );
    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to record GRN.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `GRN ${res.data.referenceNo} logged with supplier invoice photo (${formatCurrency(res.data.totalValue)}). Added to sellable stock.`,
    });
    setGrnQtyByProduct({});
    setReferenceNo('');
    setGrnInvoiceImageDataUrl('');
    setGrnInvoiceImageName('');
  };

  const handleFinalizeAndGenerateInvoice = () => {
    const normalizedSplits: Record<
      string,
      { returnedToSellable: number; movedToDamaged: number }
    > = {};

    for (const row of reconciliationSummary) {
      const current = splitInputs[row.productId] ?? {
        returnedToSellable: row.unsoldReturnQty,
        movedToDamaged: 0,
      };
      normalizedSplits[row.productId] = current;
    }

    const res = reconcileRoute(
      selectedDriverId,
      unreconciledOrders.map((o) => o.id),
      normalizedSplits
    );
    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Reconciliation failed.' });
      return;
    }
    setSplitInputs({});
    setFeedback({
      type: 'success',
      text: `Returned stock added back to inventory & Final Invoice ${res.data.finalInvoice.invoiceNumber} sent to Cashier Portal (${formatCurrency(res.data.finalInvoice.expectedCashFromWarehouse)} cash due).`,
    });
    setPrintableFinalInvoice(res.data.finalInvoice);
  };

  const handleSaveStockRow = (productId: string, sku: string) => {
    const draft = stockDrafts[productId];
    if (!draft) return;
    const sellable = Number(draft.sellableStock);
    const damaged = Number(draft.damagedStock);
    const res = updateProductStock(productId, sellable, damaged);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to update stock.' });
      return;
    }
    setStockDrafts((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
    setFeedback({
      type: 'success',
      text: `Updated warehouse stock for ${sku}: Sellable ${Math.floor(sellable)}, Damaged ${Math.floor(damaged)}.`,
    });
  };

  return (
    <DashboardLayout
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as WarehouseTab);
        setFeedback(null);
      }}
      pageTitle="Warehouse Management Portal"
      pageSubtitle="GRN receiving, dispatch allocation, return stock restocking, and Final Invoice generation"
    >
      {feedback && (
        <div
          className={`mb-5 px-4 py-3 rounded-lg border text-xs font-medium flex items-center justify-between gap-4 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {(activeTab === 'overview' || activeTab === 'queries') && (
        <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('overview');
              setFeedback(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Total Stock by SKU &amp; Product
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('queries');
              setFeedback(null);
            }}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              activeTab === 'queries'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Search className="w-4 h-4" />
            Warehouse Stock Query Generator
          </button>
        </div>
      )}

      <FieldAndroidAppBanner roleLabel="Distribution Manager" />

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Top KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total SKUs / Products</span>
                <Package className="w-4 h-4 text-slate-400" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
                {overallStockTotals.skuCount}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Across {productCategories.length} categor{productCategories.length === 1 ? 'y' : 'ies'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Sellable Stock</span>
                <Boxes className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-emerald-700">
                {overallStockTotals.sellable.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Retail Value: {formatCurrency(overallStockTotals.sellableRetailValue)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total In-Transit Stock</span>
                <Truck className="w-4 h-4 text-blue-600" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-blue-700">
                {overallStockTotals.inTransit.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {activeInTransitOrdersCount} active route order
                {activeInTransitOrdersCount === 1 ? '' : 's'}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Total Damaged Stock</span>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-rose-700">
                {overallStockTotals.damaged.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Cost Pending RTV: {formatCurrency(overallStockTotals.damagedCostValue)}
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-900 rounded-xl p-4 text-white">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Grand Total Physical</span>
                <LayoutDashboard className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="mt-2 font-mono text-2xl font-bold text-white">
                {overallStockTotals.totalPhysical.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                Total Cost Value: {formatCurrency(overallStockTotals.totalCostValue)}
              </p>
            </div>
          </div>

          {/* Total Stock by SKU & Product Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Total Stock by SKU &amp; Product
                </h2>
                <p className="text-xs text-slate-500">
                  Live warehouse stock breakdown across Sellable, In-Transit, and Damaged buckets
                  per SKU
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('ledger')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg cursor-pointer"
                >
                  <Boxes className="w-3.5 h-3.5" />
                  Update Stock
                </button>
                <button
                  type="button"
                  onClick={handlePrintSkuStockReport}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Sheet
                </button>
                <button
                  type="button"
                  onClick={handleExportSkuStockCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Search, Category Filter & Sort Bar */}
            <div className="px-5 py-3 bg-slate-50/70 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Search by SKU, product name, unit..."
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <select
                value={stockCategoryFilter}
                onChange={(e) => setStockCategoryFilter(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="ALL">All Categories ({productCategories.length})</option>
                {productCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <select
                value={stockSort}
                onChange={(e) => setStockSort(e.target.value as StockSortKey)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="SKU_ASC">Sort: SKU (A → Z)</option>
                <option value="NAME_ASC">Sort: Product Name (A → Z)</option>
                <option value="TOTAL_DESC">Sort: Total Stock (High → Low)</option>
                <option value="SELLABLE_ASC">Sort: Sellable Stock (Low → High)</option>
                <option value="VALUE_DESC">Sort: Stock Cost Value (High → Low)</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">SKU</th>
                    <th className="py-2.5 px-4 font-semibold">Product &amp; Category</th>
                    <th className="py-2.5 px-4 font-semibold">Unit</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Sellable Stock</th>
                    <th className="py-2.5 px-4 font-semibold text-right">In-Transit Stock</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Damaged Stock</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Total Stock (SKU)</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Total Cost Value</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Sellable Retail Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStockProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 px-4 text-center text-slate-500">
                        {state.products.length === 0
                          ? 'No products in catalog yet. Ask Admin to add products to begin tracking stock.'
                          : 'No SKUs match your current search or category filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredStockProducts.map((p) => {
                      const totalSkuStock = p.sellableStock + p.inTransitStock + p.damagedStock;
                      const costVal = totalSkuStock * p.unitCost;
                      const retailVal = p.sellableStock * p.sellingPrice;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                            {p.sku}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-900">{p.name}</p>
                            <p className="text-[11px] text-slate-500">{p.category}</p>
                          </td>
                          <td className="py-3 px-4 text-slate-600">{p.unit}</td>
                          <td className="py-3 px-4 font-mono text-right font-semibold text-emerald-700">
                            {p.sellableStock.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-semibold text-blue-700">
                            {p.inTransitStock.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-semibold text-rose-700">
                            {p.damagedStock.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-bold text-slate-900 bg-slate-50/70">
                            {totalSkuStock.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-right text-slate-800">
                            {formatCurrency(costVal)}
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-medium text-emerald-800">
                            {formatCurrency(retailVal)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredStockProducts.length > 0 && (
                  <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-slate-900">
                    <tr>
                      <td className="py-3 px-4 font-mono">TOTAL</td>
                      <td className="py-3 px-4">
                        {filteredStockProducts.length} SKU
                        {filteredStockProducts.length === 1 ? '' : 's'}
                      </td>
                      <td className="py-3 px-4 text-slate-500">—</td>
                      <td className="py-3 px-4 font-mono text-right text-emerald-800">
                        {filteredStockTotals.sellable.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-blue-800">
                        {filteredStockTotals.inTransit.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-rose-800">
                        {filteredStockTotals.damaged.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-slate-950">
                        {filteredStockTotals.total.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-right">
                        {formatCurrency(filteredStockTotals.costValue)}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-emerald-900">
                        {formatCurrency(filteredStockTotals.retailValue)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'queries' && (
        <StockQueryExplorer
          onPrintOrder={(ord) => setPrintableOrder(ord)}
          onPrintFinalInvoice={(inv) => setPrintableFinalInvoice(inv)}
          onPrintReport={(rep) => setPrintableReport(rep)}
        />
      )}

      {activeTab === 'dispatch' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Order Dispatch Center (Pending Allocation)
                </h2>
                <p className="text-xs text-slate-500">
                  Assign a deliveryman and dispatch to move inventory from Sellable to In-Transit
                </p>
              </div>
              <StatusBadge
                variant={pendingDispatchOrders.length > 0 ? 'amber' : 'emerald'}
                label={`${pendingDispatchOrders.length} Pending`}
              />
            </div>

            {pendingDispatchOrders.length === 0 ? (
              <div className="p-10 text-center space-y-1">
                <p className="text-sm font-semibold text-slate-800">All orders dispatched</p>
                <p className="text-xs text-slate-500">
                  New orders submitted by Sales Representatives will appear here immediately.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Order #</th>
                      <th className="py-2.5 px-4 font-semibold">Retail Store</th>
                      <th className="py-2.5 px-4 font-semibold">Sales Rep</th>
                      <th className="py-2.5 px-4 font-semibold">Line Items</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Order Value</th>
                      <th className="py-2.5 px-4 font-semibold">Assign Deliveryman</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {pendingDispatchOrders.map((ord) => {
                      const chosenDriver = driverSelection[ord.id] || deliverymen[0]?.id || '';
                      return (
                        <tr key={ord.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                            {ord.orderNumber}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">{ord.storeName}</td>
                          <td className="py-3 px-4 text-slate-600">{ord.salesRepName}</td>
                          <td className="py-3 px-4 text-slate-600">
                            <div className="space-y-0.5">
                              {ord.items.map((item) => (
                                <div key={item.productId} className="font-mono text-[11px]">
                                  {item.sku} × {item.orderedQty}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono text-right font-semibold text-slate-900">
                            {formatCurrency(ord.totalOrderedAmount)}
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={chosenDriver}
                              onChange={(e) =>
                                setDriverSelection((prev) => ({
                                  ...prev,
                                  [ord.id]: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                            >
                              {deliverymen.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name} ({d.vehicleNo})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setPrintableOrder(ord)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Challan
                            </button>
                            <button
                              type="button"
                              disabled={dayLocked}
                              onClick={() => handleDispatch(ord.id)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              Dispatch Order
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">Active In-Transit Orders</h2>
              <p className="text-xs text-slate-500">Orders currently out on delivery routes</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Order #</th>
                    <th className="py-2.5 px-4 font-semibold">Store</th>
                    <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                    <th className="py-2.5 px-4 font-semibold">Dispatched</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Value</th>
                    <th className="py-2.5 px-4 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Challan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.orders
                    .filter((o) => o.status === 'IN_TRANSIT')
                    .map((ord) => (
                      <tr key={ord.id} className="hover:bg-slate-50/80">
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                          {ord.orderNumber}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-800">{ord.storeName}</td>
                        <td className="py-2.5 px-4 text-slate-600">{ord.deliverymanName}</td>
                        <td className="py-2.5 px-4 text-slate-500">
                          {ord.dispatchedAt ? formatDateTime(ord.dispatchedAt) : '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold">
                          {formatCurrency(ord.totalOrderedAmount)}
                        </td>
                        <td className="py-2.5 px-4">
                          <OrderStatusBadge status={ord.status} />
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setPrintableOrder(ord)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Challan
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'grn' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleReceiveGRN}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-5"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Receive Stock from Manufacturer (GRN)
              </h2>
              <p className="text-xs text-slate-500">
                Log incoming shipment quantities directly into Sellable Warehouse Stock
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Manufacturer / Supplier
                </label>
                <input
                  required
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Batch / Invoice Reference #
                </label>
                <input
                  required
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="MFG-INV-88510"
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            {/* Mandatory Supplier Invoice Picture Upload / Capture */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-blue-600" />
                    Supplier Invoice Picture <span className="text-rose-600">*</span>
                  </label>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Required: take a photo or upload a clear image of the manufacturer invoice
                    before posting GRN.
                  </p>
                </div>
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-600 rounded-lg cursor-pointer transition-colors">
                  <Camera className="w-3.5 h-3.5" />
                  {grnInvoiceImageDataUrl ? 'Change Photo' : 'Upload / Capture Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleGrnInvoiceFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {grnInvoiceImageDataUrl ? (
                <div className="flex items-center gap-3 p-2.5 bg-white border border-emerald-200 rounded-lg">
                  <img
                    src={grnInvoiceImageDataUrl}
                    alt="Supplier Invoice Preview"
                    className="w-16 h-16 object-cover rounded-md border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-emerald-800 truncate">
                      {grnInvoiceImageName || 'supplier-invoice.jpg'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Invoice picture attached and ready to submit with GRN.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setGrnInvoiceImageDataUrl('');
                      setGrnInvoiceImageName('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              ) : (
                <div className="border border-dashed border-amber-300 bg-amber-50/70 rounded-lg px-3.5 py-3 flex items-center gap-2.5 text-amber-900">
                  <ImageIcon className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    No invoice picture uploaded yet. GRN submission is locked until an invoice photo
                    is attached.
                  </span>
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">SKU &amp; Product</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Current Sellable</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Unit Cost</th>
                    <th className="py-2.5 px-3 font-semibold text-right w-32">Receive Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.products.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-3">
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="font-mono text-[11px] text-slate-500">{p.sku}</p>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right text-slate-600">
                        {p.sellableStock}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-right text-slate-600">
                        {formatCurrency(p.unitCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={grnQtyByProduct[p.id] ?? ''}
                          onChange={(e) =>
                            setGrnQtyByProduct((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                          placeholder="0"
                          className="w-24 px-2.5 py-1.5 text-right font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={dayLocked || !grnInvoiceImageDataUrl}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <PackagePlus className="w-4 h-4" />
                Post GRN to Sellable Stock
              </button>
            </div>
          </form>

          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">Recent GRN Receipts</h3>
              <p className="text-xs text-slate-500">
                Logged manufacturer inbound shipments &amp; attached invoice photos
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {state.grns.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No GRN receipts logged yet.
                </div>
              ) : (
                state.grns.map((grn) => (
                  <div key={grn.id} className="p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900">
                        {grn.referenceNo}
                      </span>
                      <span className="font-mono font-semibold text-emerald-700">
                        {formatCurrency(grn.totalValue)}
                      </span>
                    </div>
                    <p className="text-slate-700 font-medium">{grn.supplierName}</p>
                    <p className="text-[11px] text-slate-500">
                      {formatDateTime(grn.receivedAt)} · Received by {grn.receivedBy}
                    </p>
                    <div className="pt-1 flex flex-wrap gap-2">
                      {grn.items.map((item) => (
                        <span
                          key={item.productId}
                          className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded"
                        >
                          {item.sku}: +{item.qty}
                        </span>
                      ))}
                    </div>
                    {grn.invoiceImageDataUrl && (
                      <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100 mt-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={grn.invoiceImageDataUrl}
                            alt={`Invoice ${grn.referenceNo}`}
                            className="w-10 h-10 object-cover rounded border border-slate-200 shrink-0"
                          />
                          <span className="text-[11px] text-slate-600 truncate">
                            {grn.invoiceImageName || 'Supplier Invoice Photo'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPreviewGrnPhoto(grn)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 cursor-pointer shrink-0"
                        >
                          <Eye className="w-3 h-3" />
                          View Photo
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Receive Returned Products &amp; Generate Final Invoice
                </h2>
                <p className="text-xs text-slate-500">
                  Restock good unsold returns back into Sellable Stock, log damaged items, and
                  issue the Final Invoice to the Cashier Portal
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <label className="font-medium text-slate-700">Deliveryman:</label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => {
                    setSelectedDriverId(e.target.value);
                    setSplitInputs({});
                  }}
                  className="px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {deliverymen.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.vehicleNo})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {unreconciledOrders.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">
                  No pending route reconciliations for this driver
                </p>
                <p className="text-xs text-slate-500">
                  Completed deliveries by this driver will queue here for return stock restocking
                  and Final Invoice generation.
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">Completed orders included:</span>
                  {unreconciledOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setPrintableOrder(o)}
                      className="inline-flex items-center gap-1.5 font-mono bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded text-slate-700 cursor-pointer transition-colors"
                    >
                      <Printer className="w-3 h-3" />
                      {o.orderNumber}
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold">SKU &amp; Product</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Dispatched Qty</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Actual Delivered</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Returned Qty</th>
                        <th className="py-2.5 px-3 font-semibold text-right">
                          Add Back to Sellable
                        </th>
                        <th className="py-2.5 px-3 font-semibold text-right">Move to Damaged</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {reconciliationSummary.map((row) => {
                        const split = splitInputs[row.productId] ?? {
                          returnedToSellable: row.unsoldReturnQty,
                          movedToDamaged: 0,
                        };
                        return (
                          <tr key={row.productId}>
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-slate-900">{row.productName}</p>
                              <p className="font-mono text-[11px] text-slate-500">{row.sku}</p>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right">
                              {row.dispatchedQty}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right text-emerald-700 font-semibold">
                              {row.deliveredQty}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right font-bold text-blue-700">
                              {row.unsoldReturnQty}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                max={row.unsoldReturnQty}
                                value={split.returnedToSellable}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(row.unsoldReturnQty, Number(e.target.value) || 0)
                                  );
                                  setSplitInputs((prev) => ({
                                    ...prev,
                                    [row.productId]: {
                                      returnedToSellable: val,
                                      movedToDamaged: row.unsoldReturnQty - val,
                                    },
                                  }));
                                }}
                                className="w-20 px-2 py-1 text-right font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                max={row.unsoldReturnQty}
                                value={split.movedToDamaged}
                                onChange={(e) => {
                                  const val = Math.max(
                                    0,
                                    Math.min(row.unsoldReturnQty, Number(e.target.value) || 0)
                                  );
                                  setSplitInputs((prev) => ({
                                    ...prev,
                                    [row.productId]: {
                                      returnedToSellable: row.unsoldReturnQty - val,
                                      movedToDamaged: val,
                                    },
                                  }));
                                }}
                                className="w-20 px-2 py-1 text-right font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-600"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                  <div className="text-xs text-slate-600">
                    Cash collected on these stops:{' '}
                    <span className="font-mono font-bold text-slate-900">
                      {formatCurrency(
                        unreconciledOrders.reduce((s, o) => s + o.cashCollected, 0)
                      )}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={dayLocked}
                    onClick={handleFinalizeAndGenerateInvoice}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    Receive Returns &amp; Generate Final Invoice
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Issued Final Invoices */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-bold text-slate-900">
                Final Invoices Sent to Cashier Portal
              </h3>
              <p className="text-xs text-slate-500">
                Final route invoices awaiting or completed for Cashier cash collection
              </p>
            </div>
            {state.finalInvoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No final invoices generated yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Final Invoice #</th>
                      <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                      <th className="py-2.5 px-4 font-semibold">Issued</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Net Payable</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Cash Due to Cashier</th>
                      <th className="py-2.5 px-4 font-semibold">Cashier Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Print</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {state.finalInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          <p>{inv.invoiceNumber}</p>
                          {inv.settlementDueDateKey && (
                            <p className="text-[11px] font-normal text-amber-700">
                              Due: {inv.settlementDueDateKey}
                              {inv.rescheduledReason ? ` · ${inv.rescheduledReason}` : ''}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-800">{inv.deliverymanName}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {formatDateTime(inv.createdAt)}
                        </td>
                        <td className="py-3 px-4 font-mono text-right">
                          {formatCurrency(inv.netFinalPayable)}
                        </td>
                        <td className="py-3 px-4 font-mono text-right font-bold text-blue-700">
                          {formatCurrency(inv.expectedCashFromWarehouse)}
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge
                            variant={inv.cashSettled ? 'emerald' : 'amber'}
                            label={
                              inv.cashSettled ? 'Cash Received' : 'Pending Cashier Receipt'
                            }
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setPrintableFinalInvoice(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            Final Invoice
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">
              3-Bucket Warehouse Stock Ledger &amp; Stock Updater
            </h2>
            <p className="text-xs text-slate-500">
              Adjust Sellable and Damaged stock counts directly; In-Transit stock updates
              automatically during dispatch and route reconciliation
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">SKU</th>
                  <th className="py-2.5 px-4 font-semibold">Product</th>
                  <th className="py-2.5 px-4 font-semibold">Unit</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Sellable Stock</th>
                  <th className="py-2.5 px-4 font-semibold text-right">In-Transit Stock</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Damaged Stock</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Total Physical</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 px-4 text-center text-slate-500">
                      No products added in catalog yet. Ask Admin to add products first.
                    </td>
                  </tr>
                ) : (
                  state.products.map((p) => {
                    const draft = stockDrafts[p.id];
                    const sellableVal = draft ? draft.sellableStock : String(p.sellableStock);
                    const damagedVal = draft ? draft.damagedStock : String(p.damagedStock);
                    const isDirty =
                      draft !== undefined &&
                      (Number(draft.sellableStock) !== p.sellableStock ||
                        Number(draft.damagedStock) !== p.damagedStock);
                    const liveTotal =
                      (Math.max(0, Number(sellableVal) || 0)) +
                      p.inTransitStock +
                      (Math.max(0, Number(damagedVal) || 0));

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono text-slate-600">{p.sku}</td>
                        <td className="py-3 px-4 font-semibold text-slate-900">{p.name}</td>
                        <td className="py-3 px-4 text-slate-600">{p.unit}</td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            disabled={dayLocked}
                            aria-label={`Sellable stock for ${p.name}`}
                            value={sellableVal}
                            onChange={(e) =>
                              setStockDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  sellableStock: e.target.value,
                                  damagedStock: prev[p.id]?.damagedStock ?? String(p.damagedStock),
                                },
                              }))
                            }
                            className="w-24 px-2 py-1 text-right font-mono font-semibold text-emerald-700 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono text-right font-semibold text-blue-700">
                          {p.inTransitStock}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            disabled={dayLocked}
                            aria-label={`Damaged stock for ${p.name}`}
                            value={damagedVal}
                            onChange={(e) =>
                              setStockDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  sellableStock:
                                    prev[p.id]?.sellableStock ?? String(p.sellableStock),
                                  damagedStock: e.target.value,
                                },
                              }))
                            }
                            className="w-24 px-2 py-1 text-right font-mono font-semibold text-rose-700 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-rose-600 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono text-right font-bold text-slate-900">
                          {liveTotal}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isDirty ? (
                            <button
                              type="button"
                              disabled={dayLocked}
                              onClick={() => handleSaveStockRow(p.id, p.sku)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              Save Stock
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Synced</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {previewGrnPhoto && previewGrnPhoto.invoiceImageDataUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Supplier Invoice Photo — {previewGrnPhoto.referenceNo}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {previewGrnPhoto.supplierName} · {formatDateTime(previewGrnPhoto.receivedAt)} ·
                  Received by {previewGrnPhoto.receivedBy}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewGrnPhoto.invoiceImageDataUrl}
                  download={`${previewGrnPhoto.referenceNo}-invoice.jpg`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewGrnPhoto(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[75vh] overflow-auto">
              <img
                src={previewGrnPhoto.invoiceImageDataUrl}
                alt={`GRN Invoice ${previewGrnPhoto.referenceNo}`}
                className="max-w-full max-h-[68vh] object-contain rounded-lg border border-slate-200 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      <PrintableDocumentModal
        payload={
          printableReport
            ? { kind: 'REPORT', report: printableReport }
            : printableFinalInvoice
            ? { kind: 'FINAL_INVOICE', invoice: printableFinalInvoice }
            : printableOrder
            ? {
                kind: 'ORDER',
                order: printableOrder,
                store: state.stores.find((s) => s.id === printableOrder.storeId),
                driver: state.users.find(
                  (u) =>
                    u.id ===
                    (printableOrder.deliverymanId ||
                      driverSelection[printableOrder.id] ||
                      deliverymen[0]?.id)
                ),
              }
            : null
        }
        onClose={() => {
          setPrintableOrder(null);
          setPrintableFinalInvoice(null);
          setPrintableReport(null);
        }}
      />
    </DashboardLayout>
  );
};
