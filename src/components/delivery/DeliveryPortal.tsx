import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Navigation,
  PackageCheck,
  Printer,
  Truck,
  X,
} from 'lucide-react';
import { useDMS } from '../../context/DMSContext';
import { Order } from '../../types/dms';
import { LeafletMap, MapStorePin } from '../common/LeafletMap';
import { FieldAndroidAppBanner } from '../common/FieldAndroidAppBanner';
import { PrintableDocumentModal } from '../common/PrintableDocumentModal';
import { formatCurrency, formatDateTime, OrderStatusBadge } from '../common/StatusBadge';
import { DashboardLayout, NavItem } from '../layout/DashboardLayout';

type DeliveryTab = 'route' | 'handover';

export const DeliveryPortal: React.FC = () => {
  const { state, currentUser, getWorkDayStatus, completeDelivery } = useDMS();
  const dayLocked = getWorkDayStatus(currentUser).isLocked;
  const [activeTab, setActiveTab] = useState<DeliveryTab>('route');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [printableOrder, setPrintableOrder] = useState<Order | null>(null);

  // Delivery execution modal state
  const [executingOrder, setExecutingOrder] = useState<Order | null>(null);
  const [executions, setExecutions] = useState<
    Record<string, { deliveredQty: number; damagedReturnQty: number }>
  >({});
  const [cashCollectedInput, setCashCollectedInput] = useState<string>('0');

  const assignedInTransit = useMemo(
    () =>
      state.orders.filter(
        (o) => o.deliverymanId === currentUser?.id && o.status === 'IN_TRANSIT'
      ),
    [state.orders, currentUser?.id]
  );

  const completedToday = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.deliverymanId === currentUser?.id &&
          (o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY')
      ),
    [state.orders, currentUser?.id]
  );

  // Route map pins (numbered 1, 2, 3...)
  const routePins: MapStorePin[] = useMemo(() => {
    const pins: MapStorePin[] = [];
    assignedInTransit.forEach((ord, idx) => {
      const store = state.stores.find((s) => s.id === ord.storeId);
      if (store && store.lat !== null && store.lng !== null) {
        pins.push({
          id: `${ord.id}-${store.id}`,
          name: store.name,
          ownerName: store.ownerName,
          address: store.address,
          lat: store.lat,
          lng: store.lng,
          creditBalance: store.creditBalance,
          state: 'PENDING_DELIVERY',
          stopNumber: idx + 1,
          orderNumber: ord.orderNumber,
        });
      }
    });
    return pins;
  }, [assignedInTransit, state.stores]);

  // Live Trip Handover Summary
  const handoverTotals = useMemo(() => {
    const unsettledCash = completedToday
      .filter((o) => !o.cashSettled)
      .reduce((sum, o) => sum + o.cashCollected, 0);

    const unsoldReturnUnits = completedToday
      .filter((o) => !o.reconciled)
      .reduce(
        (sum, o) =>
          sum +
          o.items.reduce(
            (s, i) => s + Math.max(0, i.orderedQty - i.deliveredQty),
            0
          ),
        0
      );

    const damagedCollectedUnits = completedToday
      .filter((o) => !o.reconciled)
      .reduce(
        (sum, o) =>
          sum + o.items.reduce((s, i) => s + i.damagedReturnQty, 0),
        0
      );

    return { unsettledCash, unsoldReturnUnits, damagedCollectedUnits };
  }, [completedToday]);

  // Live Invoice math inside execution modal
  const liveInvoice = useMemo(() => {
    if (!executingOrder) return { grossDelivered: 0, returnCredit: 0, netPayable: 0, dueAdded: 0 };
    let grossDelivered = 0;
    let returnCredit = 0;
    for (const item of executingOrder.items) {
      const ex = executions[item.productId] ?? {
        deliveredQty: item.orderedQty,
        damagedReturnQty: 0,
      };
      grossDelivered += ex.deliveredQty * item.unitPrice;
      returnCredit += ex.damagedReturnQty * item.unitPrice;
    }
    const netPayable = Math.max(0, grossDelivered - returnCredit);
    const cash = Math.max(0, Number(cashCollectedInput) || 0);
    const dueAdded = Math.max(0, netPayable - cash);
    return { grossDelivered, returnCredit, netPayable, dueAdded };
  }, [executingOrder, executions, cashCollectedInput]);

  const openExecutionModal = (order: Order) => {
    const initial: Record<string, { deliveredQty: number; damagedReturnQty: number }> = {};
    let total = 0;
    for (const item of order.items) {
      initial[item.productId] = {
        deliveredQty: item.orderedQty,
        damagedReturnQty: 0,
      };
      total += item.orderedQty * item.unitPrice;
    }
    setExecutions(initial);
    setCashCollectedInput(total.toFixed(2));
    setExecutingOrder(order);
  };

  const handleConfirmDelivery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!executingOrder) return;
    const cash = Math.max(0, Number(cashCollectedInput) || 0);
    const res = completeDelivery(executingOrder.id, executions, cash);
    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to complete delivery.' });
      return;
    }
    setExecutingOrder(null);
    setFeedback({
      type: 'success',
      text: `${res.data.orderNumber} marked ${res.data.status === 'DELIVERED' ? 'Delivered' : 'Partial Delivery'}. Cash collected: ${formatCurrency(res.data.cashCollected)}, Store due added: ${formatCurrency(res.data.dueAdded)}.`,
    });
  };

  const navItems: NavItem[] = [
    {
      id: 'route',
      label: 'Assigned Route & Stops',
      icon: Navigation,
      badge: assignedInTransit.length || undefined,
    },
    {
      id: 'handover',
      label: 'Trip Handover Summary',
      icon: ClipboardCheck,
      badge: completedToday.length || undefined,
    },
  ];

  return (
    <DashboardLayout
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as DeliveryTab);
        setFeedback(null);
      }}
      pageTitle="Deliveryman Route Portal"
      pageSubtitle={`${currentUser?.vehicleNo || 'Route Van'} · ${currentUser?.territory || 'Active Trip'}`}
    >
      <FieldAndroidAppBanner roleLabel="Deliveryman" />

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

      {/* Live Trip Handover Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">Cash to Deposit with Cashier</p>
          <p className="text-xl font-bold font-mono text-emerald-700">
            {formatCurrency(handoverTotals.unsettledCash)}
          </p>
          <p className="text-[11px] text-slate-400">From unsettled completed stops today</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">Unsold Units for Warehouse Return</p>
          <p className="text-xl font-bold font-mono text-blue-700">
            {handoverTotals.unsoldReturnUnits} units
          </p>
          <p className="text-[11px] text-slate-400">Undelivered stock currently on truck</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500">Damaged Returns Collected</p>
          <p className="text-xl font-bold font-mono text-rose-700">
            {handoverTotals.damagedCollectedUnits} units
          </p>
          <p className="text-[11px] text-slate-400">Expired/damaged items taken from stores</p>
        </div>
      </div>

      {activeTab === 'route' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Assigned In-Transit Stops ({assignedInTransit.length})
              </h2>
            </div>

            {assignedInTransit.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-900">All route stops completed</p>
                <p className="text-xs text-slate-500">
                  Proceed to Trip Handover Summary or return to the depot for settlement.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {assignedInTransit.map((ord, index) => {
                  const store = state.stores.find((s) => s.id === ord.storeId);
                  return (
                    <div
                      key={ord.id}
                      className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="w-7 h-7 rounded-full bg-blue-600 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                            {index + 1}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{ord.storeName}</p>
                            <p className="font-mono text-[11px] text-slate-500">
                              {ord.orderNumber} · {ord.items.length} SKUs
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-sm font-bold text-slate-900">
                          {formatCurrency(ord.totalOrderedAmount)}
                        </span>
                      </div>

                      {store && (
                        <p className="text-xs text-slate-600">{store.address}</p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                        {store && store.lat !== null && store.lng !== null ? (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Get Directions
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400">No GPS coordinates</span>
                        )}

                        <button
                          type="button"
                          disabled={dayLocked}
                          onClick={() => openExecutionModal(ord)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Execute Delivery
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Live Route Map</h2>
                <p className="text-xs text-slate-500">
                  Numbered pins match your active delivery sequence
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                <Truck className="w-4 h-4" />
                {routePins.length} Geo-Tagged Stops
              </span>
            </div>
            <LeafletMap pins={routePins} heightClass="h-[460px]" />
          </div>
        </div>
      )}

      {activeTab === 'handover' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Completed Stops & Handover Log</h2>
            <p className="text-xs text-slate-500">
              Deliveries executed on this shift ready for Cashier & Warehouse verification
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Order #</th>
                  <th className="py-2.5 px-4 font-semibold">Store</th>
                  <th className="py-2.5 px-4 font-semibold">Completed At</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Net Payable</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Cash Collected</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Store Due</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {completedToday.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No completed stops recorded yet for this shift.
                    </td>
                  </tr>
                ) : (
                  completedToday.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {ord.orderNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{ord.storeName}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {ord.deliveredAt ? formatDateTime(ord.deliveredAt) : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-right font-semibold">
                        {formatCurrency(ord.netPayableAmount)}
                      </td>
                      <td className="py-3 px-4 font-mono text-right font-semibold text-emerald-700">
                        {formatCurrency(ord.cashCollected)}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-rose-700">
                        {formatCurrency(ord.dueAdded)}
                      </td>
                      <td className="py-3 px-4">
                        <OrderStatusBadge status={ord.status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setPrintableOrder(ord)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delivery Execution & Partial Fulfillment Modal */}
      {executingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <form
            onSubmit={handleConfirmDelivery}
            className="w-full max-w-3xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden my-8"
          >
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Delivery Execution — {executingOrder.storeName}
                </h3>
                <p className="font-mono text-xs text-slate-500">{executingOrder.orderNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setExecutingOrder(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Product</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Price</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Ordered</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Delivered Qty</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Damaged Return</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Line Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {executingOrder.items.map((item) => {
                      const ex = executions[item.productId] ?? {
                        deliveredQty: item.orderedQty,
                        damagedReturnQty: 0,
                      };
                      const lineNet =
                        ex.deliveredQty * item.unitPrice -
                        ex.damagedReturnQty * item.unitPrice;
                      return (
                        <tr key={item.productId}>
                          <td className="py-2.5 px-3">
                            <p className="font-medium text-slate-900">{item.productName}</p>
                            <p className="font-mono text-[11px] text-slate-500">{item.sku}</p>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-right">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-right font-semibold">
                            {item.orderedQty}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              max={item.orderedQty}
                              value={ex.deliveredQty}
                              onChange={(e) => {
                                const val = Math.max(
                                  0,
                                  Math.min(item.orderedQty, Number(e.target.value) || 0)
                                );
                                setExecutions((prev) => ({
                                  ...prev,
                                  [item.productId]: { ...ex, deliveredQty: val },
                                }));
                              }}
                              className="w-20 px-2 py-1 text-right font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              min="0"
                              value={ex.damagedReturnQty}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setExecutions((prev) => ({
                                  ...prev,
                                  [item.productId]: { ...ex, damagedReturnQty: val },
                                }));
                              }}
                              className="w-20 px-2 py-1 text-right font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-mono text-right font-semibold text-slate-900">
                            {formatCurrency(lineNet)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Gross Delivered Value</span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(liveInvoice.grossDelivered)}
                    </span>
                  </div>
                  <div className="flex justify-between text-rose-700">
                    <span>Damaged Return Credit</span>
                    <span className="font-mono font-semibold">
                      -{formatCurrency(liveInvoice.returnCredit)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                    <span>Net Payable</span>
                    <span className="font-mono">{formatCurrency(liveInvoice.netPayable)}</span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Cash Collected from Store (BDT)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cashCollectedInput}
                      onChange={(e) => setCashCollectedInput(e.target.value)}
                      className="w-full px-3 py-2 font-mono text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg">
                    <span className="font-medium text-rose-900">Unpaid Balance → Store Due</span>
                    <span className="font-mono font-bold text-rose-700">
                      {formatCurrency(liveInvoice.dueAdded)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setExecutingOrder(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={dayLocked}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Submit & Complete Stop
              </button>
            </div>
          </form>
        </div>
      )}

      <PrintableDocumentModal
        payload={
          printableOrder
            ? {
                kind: 'ORDER',
                order: printableOrder,
                store: state.stores.find((s) => s.id === printableOrder.storeId),
              }
            : null
        }
        onClose={() => setPrintableOrder(null)}
      />
    </DashboardLayout>
  );
};
