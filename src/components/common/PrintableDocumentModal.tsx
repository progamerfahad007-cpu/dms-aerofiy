import React from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { useDMS } from '../../context/DMSContext';
import {
  FinalInvoice,
  Order,
  PrintTemplateId,
  RetailStore,
  RTVRecord,
  StaffUser,
} from '../../types/dms';
import { formatCurrency, formatDateTime, OrderStatusBadge, StatusBadge } from './StatusBadge';

export interface PrintableReportData {
  title: string;
  subtitle?: string;
  periodLabel: string;
  summaryMetrics?: { label: string; value: string }[];
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
  rows: Record<string, string | number>[];
  footerTotals?: Record<string, string | number>;
}

export type PrintablePayload =
  | { kind: 'ORDER'; order: Order; store?: RetailStore; driver?: StaffUser }
  | { kind: 'FINAL_INVOICE'; invoice: FinalInvoice }
  | { kind: 'RTV'; rtv: RTVRecord }
  | { kind: 'REPORT'; report: PrintableReportData };

export const PRINT_TEMPLATE_LABELS: Record<
  PrintTemplateId,
  { name: string; subtitle: string }
> = {
  MODERN_EMERALD: {
    name: 'Aerofiy Modern A5',
    subtitle: 'Emerald header band & clean structured layout',
  },
  CLASSIC_LEDGER: {
    name: 'Classic Ledger A5',
    subtitle: 'Formal accounting grid & double-rule header',
  },
  COMPACT_THERMAL_A5: {
    name: 'Compact Mono A5',
    subtitle: 'High-density monospace slip for max rows per page',
  },
};

export const PrintableDocumentModal: React.FC<{
  payload: PrintablePayload | null;
  onClose: () => void;
}> = ({ payload, onClose }) => {
  const { state, currentUser, setPrintTemplate } = useDMS();

  if (!payload) return null;

  const activeTemplate: PrintTemplateId = state.printTemplate || 'MODERN_EMERALD';
  const { companyProfile } = state;
  const isAdmin = currentUser?.role === 'ADMIN';

  const isPreDelivery =
    payload.kind === 'ORDER' &&
    (payload.order.status === 'PENDING_DISPATCH' || payload.order.status === 'IN_TRANSIT');

  const assignedDriverName =
    payload.kind === 'ORDER'
      ? payload.order.deliverymanName || payload.driver?.name || 'Pending Assignment'
      : '';

  const modalTitle =
    payload.kind === 'ORDER'
      ? `Sales Invoice & Delivery Challan — ${payload.order.orderNumber}`
      : payload.kind === 'FINAL_INVOICE'
      ? `Warehouse Final Invoice — ${payload.invoice.invoiceNumber}`
      : payload.kind === 'RTV'
      ? `Manufacturer Return Debit Note — ${payload.rtv.debitNoteNo}`
      : payload.report.title;

  const docHeading =
    payload.kind === 'ORDER'
      ? 'Sales Invoice & Delivery Challan'
      : payload.kind === 'FINAL_INVOICE'
      ? 'Warehouse Final Settlement Invoice'
      : payload.kind === 'RTV'
      ? 'Return to Manufacturer Debit Note'
      : payload.report.title;

  const docNumber =
    payload.kind === 'ORDER'
      ? payload.order.orderNumber
      : payload.kind === 'FINAL_INVOICE'
      ? payload.invoice.invoiceNumber
      : payload.kind === 'RTV'
      ? payload.rtv.debitNoteNo
      : 'RPT-A5';

  const docTimestamp =
    payload.kind === 'ORDER'
      ? payload.order.createdAt
      : payload.kind === 'FINAL_INVOICE'
      ? payload.invoice.createdAt
      : payload.kind === 'RTV'
      ? payload.rtv.createdAt
      : new Date().toISOString();

  // Template-specific classes for A5 print sheet
  const isClassic = activeTemplate === 'CLASSIC_LEDGER';
  const isCompact = activeTemplate === 'COMPACT_THERMAL_A5';
  const isModern = activeTemplate === 'MODERN_EMERALD';

  const tableWrapperClass = isClassic
    ? 'overflow-x-auto border border-slate-400'
    : isCompact
    ? 'overflow-x-auto border border-dashed border-slate-400'
    : 'overflow-x-auto border border-slate-200 rounded-md';

  const theadClass = isClassic
    ? 'bg-slate-100 border-b border-slate-400 text-slate-900'
    : isCompact
    ? 'bg-slate-50 border-b border-dashed border-slate-400 text-slate-800 font-mono'
    : 'bg-emerald-50/70 border-b border-emerald-200 text-emerald-950';

  const cellPad = isCompact ? 'py-1 px-1.5 text-[10px]' : 'py-1.5 px-2 text-[11px]';

  const summaryBoxClass = isClassic
    ? 'w-full sm:max-w-[230px] space-y-1 text-[11px] border border-slate-400 p-2.5 bg-white'
    : isCompact
    ? 'w-full sm:max-w-[220px] space-y-1 text-[10px] font-mono border border-dashed border-slate-400 p-2 bg-slate-50'
    : 'w-full sm:max-w-[230px] space-y-1 text-[11px] border border-emerald-200 rounded-md p-2.5 bg-emerald-50/40';

  const content = (
    <div
      id="printable-portal-root"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/55 p-4 sm:py-6 overflow-y-auto print:static print:block print:bg-white print:p-0 print:overflow-visible"
    >
      <div className="w-full max-w-2xl bg-slate-100 rounded-xl border border-slate-200 shadow-xl overflow-hidden my-auto sm:my-0 print:max-w-none print:rounded-none print:border-0 print:shadow-none print:bg-white">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{modalTitle}</h3>
            <p className="text-xs text-slate-500">
              A5 Paper Format (148mm × 210mm) · Template:{' '}
              <span className="font-semibold text-emerald-700">
                {PRINT_TEMPLATE_LABELS[activeTemplate].name}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <select
                aria-label="Choose A5 Print Template"
                value={activeTemplate}
                onChange={(e) => setPrintTemplate(e.target.value as PrintTemplateId)}
                className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {(Object.keys(PRINT_TEMPLATE_LABELS) as PrintTemplateId[]).map((tpl) => (
                  <option key={tpl} value={tpl}>
                    {PRINT_TEMPLATE_LABELS[tpl].name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print A5 Document
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* A5 Preview Sheet Wrapper */}
        <div className="p-4 sm:p-6 flex justify-center print:p-0 print:block">
          <div
            id="printable-document"
            className={`w-full max-w-[148mm] min-h-[200mm] print:min-h-0 bg-white text-slate-900 border border-slate-300 shadow-sm p-5 space-y-4 print:border-0 print:shadow-none print:p-0 print:max-w-none ${
              isCompact ? 'font-mono text-[10px]' : 'text-[11px]'
            }`}
          >
            {/* Top accent for Modern Emerald template */}
            {isModern && <div className="h-1.5 w-full bg-emerald-600 rounded-full" />}

            {/* Company Branding Header (Logo, Name, Address, Contact Info) */}
            <div
              className={`flex items-start justify-between gap-3 pb-3 ${
                isClassic
                  ? 'border-b-2 border-slate-900'
                  : isCompact
                  ? 'border-b border-dashed border-slate-400'
                  : 'border-b border-emerald-200'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {companyProfile.logoDataUrl && (
                  <img
                    src={companyProfile.logoDataUrl}
                    alt={companyProfile.companyName}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 object-contain rounded border border-slate-200 bg-white p-0.5 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-sm font-bold tracking-tight ${
                        isClassic
                          ? 'text-slate-900 uppercase'
                          : isCompact
                          ? 'text-slate-900 font-mono uppercase'
                          : 'text-emerald-700'
                      }`}
                    >
                      {companyProfile.companyName || 'aerofiy DMS'}
                    </span>
                    <span className="text-[9px] font-semibold text-emerald-700">
                      aerofiy DMS
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 leading-snug mt-0.5">
                    {companyProfile.address}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {companyProfile.phone}
                    {companyProfile.email ? ` · ${companyProfile.email}` : ''}
                  </p>
                  <h2
                    className={`font-bold text-slate-900 mt-1.5 ${
                      isCompact ? 'text-xs uppercase' : 'text-sm'
                    }`}
                  >
                    {docHeading}
                  </h2>
                </div>
              </div>

              <div className="text-right space-y-0.5 shrink-0">
                <p className="font-mono text-xs font-bold text-slate-900">{docNumber}</p>
                <p className="text-[10px] text-slate-500">
                  Issued: {formatDateTime(docTimestamp)}
                </p>
                {payload.kind === 'ORDER' && (
                  <div className="pt-0.5">
                    <OrderStatusBadge status={payload.order.status} />
                  </div>
                )}
                {payload.kind === 'FINAL_INVOICE' && (
                  <div className="pt-0.5 space-y-0.5">
                    <StatusBadge
                      variant={payload.invoice.cashSettled ? 'emerald' : 'amber'}
                      label={
                        payload.invoice.cashSettled ? 'Cash Received' : 'Pending Cashier'
                      }
                    />
                    {payload.invoice.settlementDueDateKey && (
                      <p className="text-[9px] font-mono text-blue-700 font-semibold">
                        Due Date: {payload.invoice.settlementDueDateKey}
                      </p>
                    )}
                  </div>
                )}
                {payload.kind === 'REPORT' && (
                  <p className="text-[10px] font-mono text-emerald-700 font-semibold">
                    {payload.report.periodLabel}
                  </p>
                )}
              </div>
            </div>

            {payload.kind === 'ORDER' && (
              <>
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-500">Retail Store (Consignee)</p>
                    <p className="text-xs font-semibold text-slate-900">
                      {payload.order.storeName}
                    </p>
                    {payload.store && (
                      <>
                        <p className="text-slate-600">
                          {payload.store.ownerName} · {payload.store.zone}
                        </p>
                        <p className="text-slate-600">{payload.store.address}</p>
                        <p className="text-slate-600 font-mono">{payload.store.phone}</p>
                      </>
                    )}
                  </div>
                  <div className="space-y-0.5 text-right">
                    <p className="font-semibold text-slate-500">Dispatch &amp; Fulfillment</p>
                    <p className="text-slate-700">Sales: {payload.order.salesRepName}</p>
                    <p className="text-slate-700">
                      Driver:{' '}
                      <span className="font-medium text-slate-900">{assignedDriverName}</span>
                    </p>
                    {payload.order.dispatchedAt && (
                      <p className="text-slate-500">
                        Dispatched: {formatDateTime(payload.order.dispatchedAt)}
                      </p>
                    )}
                    {payload.order.deliveredAt && (
                      <p className="text-slate-500">
                        Delivered: {formatDateTime(payload.order.deliveredAt)}
                      </p>
                    )}
                  </div>
                </div>

                <div className={tableWrapperClass}>
                  <table className="w-full text-left border-collapse">
                    <thead className={theadClass}>
                      <tr>
                        <th className={`${cellPad} font-semibold`}>SKU</th>
                        <th className={`${cellPad} font-semibold`}>Product</th>
                        <th className={`${cellPad} font-semibold text-right`}>Price</th>
                        <th className={`${cellPad} font-semibold text-right`}>Ord</th>
                        <th className={`${cellPad} font-semibold text-right`}>Del</th>
                        <th className={`${cellPad} font-semibold text-right`}>Dmg</th>
                        <th className={`${cellPad} font-semibold text-right`}>Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payload.order.items.map((item) => {
                        const effectiveQty = isPreDelivery
                          ? item.orderedQty
                          : item.deliveredQty;
                        const lineNet =
                          effectiveQty * item.unitPrice -
                          item.damagedReturnQty * item.unitPrice;
                        return (
                          <tr key={item.productId}>
                            <td className={`${cellPad} font-mono text-slate-600`}>
                              {item.sku}
                            </td>
                            <td className={`${cellPad} font-medium text-slate-900`}>
                              {item.productName}
                            </td>
                            <td className={`${cellPad} font-mono text-right`}>
                              {formatCurrency(item.unitPrice)}
                            </td>
                            <td className={`${cellPad} font-mono text-right font-semibold`}>
                              {item.orderedQty}
                            </td>
                            <td className={`${cellPad} font-mono text-right`}>
                              {isPreDelivery ? '[  ]' : item.deliveredQty}
                            </td>
                            <td className={`${cellPad} font-mono text-right text-rose-700`}>
                              {isPreDelivery
                                ? '[  ]'
                                : item.damagedReturnQty > 0
                                ? item.damagedReturnQty
                                : '0'}
                            </td>
                            <td className={`${cellPad} font-mono text-right font-semibold`}>
                              {formatCurrency(lineNet)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div className="text-[10px] text-slate-500 space-y-0.5 max-w-[210px]">
                    <p className="font-semibold text-slate-700">Challan Notes</p>
                    <p>
                      Verify carton counts and note transit shortages or damaged returns upon
                      delivery.
                    </p>
                  </div>

                  <div className={summaryBoxClass}>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Ordered Value</span>
                      <span className="font-mono font-medium">
                        {formatCurrency(payload.order.totalOrderedAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Return Credit</span>
                      <span className="font-mono text-rose-700">
                        -{formatCurrency(payload.order.returnCreditAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-300 text-xs font-bold">
                      <span>Net Payable</span>
                      <span className="font-mono">
                        {formatCurrency(payload.order.netPayableAmount)}
                      </span>
                    </div>
                    {!isPreDelivery && (
                      <>
                        <div className="flex justify-between text-emerald-700">
                          <span>Cash Collected</span>
                          <span className="font-mono font-semibold">
                            {formatCurrency(payload.order.cashCollected)}
                          </span>
                        </div>
                        <div className="flex justify-between text-rose-700">
                          <span>Store Due</span>
                          <span className="font-mono font-semibold">
                            {formatCurrency(payload.order.dueAdded)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-5 mt-2 border-t border-slate-200 text-[10px] text-slate-600">
                  <div className="pt-4 border-t border-slate-300">
                    <p className="font-semibold text-slate-800">Warehouse</p>
                    <p className="text-slate-400">Authorized Sign</p>
                  </div>
                  <div className="pt-4 border-t border-slate-300">
                    <p className="font-semibold text-slate-800">Deliveryman</p>
                    <p className="text-slate-400">{assignedDriverName}</p>
                  </div>
                  <div className="pt-4 border-t border-slate-300">
                    <p className="font-semibold text-slate-800">Store Receiver</p>
                    <p className="text-slate-400">Sign &amp; Stamp</p>
                  </div>
                </div>
              </>
            )}

            {payload.kind === 'FINAL_INVOICE' && (
              <>
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-500">Warehouse &amp; Route</p>
                    <p className="font-semibold text-slate-900">
                      Prepared by: {payload.invoice.createdBy}
                    </p>
                    <p className="text-slate-600">
                      Driver: {payload.invoice.deliverymanName}
                    </p>
                    <p className="text-slate-600">
                      Deliveries: {payload.invoice.orders.length} store stops
                    </p>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <p className="font-semibold text-slate-500">Cashier Settlement</p>
                    <p className="text-slate-700">
                      Expected Cash:{' '}
                      <span className="font-mono font-bold text-slate-900">
                        {formatCurrency(payload.invoice.expectedCashFromWarehouse)}
                      </span>
                    </p>
                    {payload.invoice.cashSettled ? (
                      <>
                        <p className="text-emerald-700 font-medium">
                          Received:{' '}
                          <span className="font-mono font-bold">
                            {formatCurrency(payload.invoice.cashReceivedByCashier ?? 0)}
                          </span>
                        </p>
                        <p className="text-slate-500">
                          Settled by {payload.invoice.settledBy}
                        </p>
                      </>
                    ) : (
                      <p className="text-amber-700 font-medium">
                        Awaiting Cashier cash receipt
                      </p>
                    )}
                    {payload.invoice.rescheduledReason && (
                      <p className="text-blue-700">
                        Rescheduled: {payload.invoice.rescheduledReason}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-700">
                    1. Store Orders Summary
                  </p>
                  <div className={tableWrapperClass}>
                    <table className="w-full text-left border-collapse">
                      <thead className={theadClass}>
                        <tr>
                          <th className={`${cellPad} font-semibold`}>Order #</th>
                          <th className={`${cellPad} font-semibold`}>Store</th>
                          <th className={`${cellPad} font-semibold text-right`}>Net</th>
                          <th className={`${cellPad} font-semibold text-right`}>Due</th>
                          <th className={`${cellPad} font-semibold text-right`}>Cash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {payload.invoice.orders.map((ord) => (
                          <tr key={ord.orderId}>
                            <td className={`${cellPad} font-mono font-semibold text-slate-900`}>
                              {ord.orderNumber}
                            </td>
                            <td className={`${cellPad} font-medium text-slate-800`}>
                              {ord.storeName}
                            </td>
                            <td className={`${cellPad} font-mono text-right`}>
                              {formatCurrency(ord.netPayableAmount)}
                            </td>
                            <td className={`${cellPad} font-mono text-right text-rose-700`}>
                              {formatCurrency(ord.dueAdded)}
                            </td>
                            <td
                              className={`${cellPad} font-mono text-right font-bold text-emerald-700`}
                            >
                              {formatCurrency(ord.cashCollectedByDriver)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[10px] font-semibold text-slate-700">
                    2. Returned Stock Ledger Reconciliation
                  </p>
                  <div className={tableWrapperClass}>
                    <table className="w-full text-left border-collapse">
                      <thead className={theadClass}>
                        <tr>
                          <th className={`${cellPad} font-semibold`}>SKU</th>
                          <th className={`${cellPad} font-semibold text-right`}>Disp</th>
                          <th className={`${cellPad} font-semibold text-right`}>Deliv</th>
                          <th className={`${cellPad} font-semibold text-right`}>Ret</th>
                          <th className={`${cellPad} font-semibold text-right`}>Sellable</th>
                          <th className={`${cellPad} font-semibold text-right`}>Dmg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {payload.invoice.items.map((item) => (
                          <tr key={item.productId}>
                            <td className={`${cellPad} font-mono text-slate-700`}>
                              {item.sku}
                            </td>
                            <td className={`${cellPad} font-mono text-right`}>
                              {item.dispatchedQty}
                            </td>
                            <td className={`${cellPad} font-mono text-right`}>
                              {item.deliveredQty}
                            </td>
                            <td className={`${cellPad} font-mono text-right font-semibold`}>
                              {item.unsoldReturnQty}
                            </td>
                            <td
                              className={`${cellPad} font-mono text-right text-emerald-700 font-semibold`}
                            >
                              +{item.returnedToSellable}
                            </td>
                            <td
                              className={`${cellPad} font-mono text-right text-rose-700 font-semibold`}
                            >
                              +{item.movedToDamaged}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-end">
                  <div className={summaryBoxClass}>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Delivered Value</span>
                      <span className="font-mono font-medium">
                        {formatCurrency(payload.invoice.totalDeliveredAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Return Credit</span>
                      <span className="font-mono text-rose-700">
                        -{formatCurrency(payload.invoice.totalReturnCredit)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-300 text-xs font-bold">
                      <span>Cash Due to Cashier</span>
                      <span className="font-mono text-emerald-700">
                        {formatCurrency(payload.invoice.expectedCashFromWarehouse)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-5 mt-2 border-t border-slate-200 text-[10px] text-slate-600">
                  <div className="pt-4 border-t border-slate-300">
                    <p className="font-semibold text-slate-800">Warehouse Mgr</p>
                    <p className="text-slate-400">{payload.invoice.createdBy}</p>
                  </div>
                  <div className="pt-4 border-t border-slate-300">
                    <p className="font-semibold text-slate-800">Deliveryman</p>
                    <p className="text-slate-400">{payload.invoice.deliverymanName}</p>
                  </div>
                  <div className="pt-4 border-t border-slate-300">
                    <p className="font-semibold text-slate-800">Cashier Receipt</p>
                    <p className="text-slate-400">
                      {payload.invoice.settledBy || 'Signature'}
                    </p>
                  </div>
                </div>
              </>
            )}

            {payload.kind === 'RTV' && (
              <>
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-500">Manufacturer / Supplier</p>
                    <p className="text-xs font-semibold text-slate-900">
                      {payload.rtv.manufacturerName}
                    </p>
                  </div>
                  <div className="space-y-0.5 text-right">
                    <p className="font-semibold text-slate-500">Authorized By</p>
                    <p className="text-slate-700">{payload.rtv.createdBy}</p>
                  </div>
                </div>

                <div className={tableWrapperClass}>
                  <table className="w-full text-left border-collapse">
                    <thead className={theadClass}>
                      <tr>
                        <th className={`${cellPad} font-semibold`}>SKU</th>
                        <th className={`${cellPad} font-semibold`}>Product</th>
                        <th className={`${cellPad} font-semibold text-right`}>Dmg Qty</th>
                        <th className={`${cellPad} font-semibold text-right`}>Unit Cost</th>
                        <th className={`${cellPad} font-semibold text-right`}>Claim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payload.rtv.items.map((item) => (
                        <tr key={item.productId}>
                          <td className={`${cellPad} font-mono text-slate-600`}>
                            {item.sku}
                          </td>
                          <td className={`${cellPad} font-medium text-slate-900`}>
                            {item.productName}
                          </td>
                          <td className={`${cellPad} font-mono text-right`}>{item.qty}</td>
                          <td className={`${cellPad} font-mono text-right`}>
                            {formatCurrency(item.unitCost)}
                          </td>
                          <td className={`${cellPad} font-mono text-right font-semibold`}>
                            {formatCurrency(item.claimAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <div className={summaryBoxClass}>
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span>Total Credit Claim</span>
                      <span className="font-mono text-emerald-700">
                        {formatCurrency(payload.rtv.totalClaimAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {payload.kind === 'REPORT' && (
              <>
                {payload.report.subtitle && (
                  <p className="text-[10px] text-slate-600">{payload.report.subtitle}</p>
                )}

                {payload.report.summaryMetrics &&
                  payload.report.summaryMetrics.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {payload.report.summaryMetrics.map((m, i) => (
                        <div
                          key={i}
                          className={`p-2 border ${
                            isClassic
                              ? 'border-slate-400 bg-white'
                              : isCompact
                              ? 'border-dashed border-slate-400 bg-slate-50'
                              : 'border-emerald-200 rounded bg-emerald-50/40'
                          }`}
                        >
                          <p className="text-[9px] text-slate-500">{m.label}</p>
                          <p className="text-xs font-mono font-bold text-slate-900">{m.value}</p>
                        </div>
                      ))}
                    </div>
                  )}

                <div className={tableWrapperClass}>
                  <table className="w-full text-left border-collapse">
                    <thead className={theadClass}>
                      <tr>
                        {payload.report.columns.map((col) => (
                          <th
                            key={col.key}
                            className={`${cellPad} font-semibold ${
                              col.align === 'right' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {payload.report.rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={payload.report.columns.length}
                            className={`${cellPad} text-center text-slate-500`}
                          >
                            No records found for selected filter.
                          </td>
                        </tr>
                      ) : (
                        payload.report.rows.map((row, idx) => (
                          <tr key={idx}>
                            {payload.report.columns.map((col) => (
                              <td
                                key={col.key}
                                className={`${cellPad} ${
                                  col.align === 'right' ? 'text-right font-mono' : 'text-left'
                                }`}
                              >
                                {row[col.key] ?? '—'}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                    {payload.report.footerTotals && (
                      <tfoot className="bg-slate-100 border-t border-slate-300 font-bold">
                        <tr>
                          {payload.report.columns.map((col) => (
                            <td
                              key={col.key}
                              className={`${cellPad} ${
                                col.align === 'right' ? 'text-right font-mono' : 'text-left'
                              }`}
                            >
                              {payload.report.footerTotals?.[col.key] ?? ''}
                            </td>
                          ))}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 text-[9px] text-slate-500">
                  <span>
                    Generated by {currentUser?.name || 'Admin'} · aerofiy DMS A5 Print Engine
                  </span>
                  <span className="font-mono">
                    Template: {PRINT_TEMPLATE_LABELS[activeTemplate].name}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
