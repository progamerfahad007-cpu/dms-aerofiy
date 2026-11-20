import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  BookOpen,
  CheckCircle2,
  CreditCard,
  FileText,
  Plus,
  Printer,
  X,
} from 'lucide-react';
import { useDMS } from '../../context/DMSContext';
import { FinalInvoice, RetailStore } from '../../types/dms';
import { PrintableDocumentModal } from '../common/PrintableDocumentModal';
import { formatCurrency, formatDateTime, StatusBadge } from '../common/StatusBadge';
import { DashboardLayout, NavItem } from '../layout/DashboardLayout';

type CashierTab = 'settlement' | 'dues' | 'cashbook';

export const CashierPortal: React.FC = () => {
  const {
    state,
    currentUser,
    getWorkDayStatus,
    settleFinalInvoice,
    collectStoreDue,
    recordExpense,
  } = useDMS();
  const dayLocked = getWorkDayStatus(currentUser).isLocked;
  const [activeTab, setActiveTab] = useState<CashierTab>('settlement');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [printableFinalInvoice, setPrintableFinalInvoice] = useState<FinalInvoice | null>(null);

  const deliverymen = useMemo(
    () => state.users.filter((u) => u.role === 'DELIVERYMAN' && u.active),
    [state.users]
  );

  // Selected Final Invoice for cash receipt
  const pendingFinalInvoices = useMemo(
    () => state.finalInvoices.filter((f) => !f.cashSettled),
    [state.finalInvoices]
  );
  const settledFinalInvoices = useMemo(
    () => state.finalInvoices.filter((f) => f.cashSettled),
    [state.finalInvoices]
  );

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>(
    pendingFinalInvoices[0]?.id ?? ''
  );
  const activeFinalInvoice =
    pendingFinalInvoices.find((f) => f.id === selectedInvoiceId) ??
    pendingFinalInvoices[0] ??
    null;

  const [physicalCashInput, setPhysicalCashInput] = useState<string>('');

  // Store due payment modal
  const [payingStore, setPayingStore] = useState<RetailStore | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentRef, setPaymentRef] = useState<string>('');

  // Record expense modal
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: 'FUEL_EXPENSE' as 'FUEL_EXPENSE' | 'OTHER_EXPENSE',
    description: '',
    amount: '',
    deliverymanId: deliverymen[0]?.id ?? '',
    referenceId: '',
  });

  const expectedCash = activeFinalInvoice?.expectedCashFromWarehouse ?? 0;
  const physicalCashNum =
    physicalCashInput === '' ? expectedCash : Math.max(0, Number(physicalCashInput) || 0);
  const cashVariance = Number((physicalCashNum - expectedCash).toFixed(2));

  const storesWithDue = useMemo(
    () => state.stores.filter((s) => s.creditBalance > 0),
    [state.stores]
  );

  const cashbookTotals = useMemo(() => {
    const inflows = state.cashbook
      .filter((c) => c.type === 'INFLOW')
      .reduce((sum, c) => sum + c.amount, 0);
    const outflows = state.cashbook
      .filter((c) => c.type === 'OUTFLOW')
      .reduce((sum, c) => sum + c.amount, 0);
    return {
      inflows,
      outflows,
      netBalance: inflows - outflows,
    };
  }, [state.cashbook]);

  const navItems: NavItem[] = [
    {
      id: 'settlement',
      label: 'Warehouse Final Invoices',
      icon: FileText,
      badge: pendingFinalInvoices.length || undefined,
    },
    {
      id: 'dues',
      label: 'Store Due Collection',
      icon: CreditCard,
      badge: storesWithDue.length || undefined,
    },
    { id: 'cashbook', label: 'Daily Cashbook', icon: BookOpen },
  ];

  const handleSettleFinalInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeFinalInvoice) return;
    const res = settleFinalInvoice(activeFinalInvoice.id, physicalCashNum);
    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to receive cash.' });
      return;
    }
    setPhysicalCashInput('');
    setSelectedInvoiceId('');
    setFeedback({
      type: 'success',
      text: `Cash received against Final Invoice ${activeFinalInvoice.invoiceNumber} from Warehouse (${formatCurrency(res.data.physicalCash)} · Variance: ${res.data.variance >= 0 ? '+' : ''}${formatCurrency(res.data.variance)}).`,
    });
  };

  const handleCollectDue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingStore) return;
    const amt = Number(paymentAmount);
    const res = collectStoreDue(payingStore.id, amt, paymentRef);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to record payment.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Collected ${formatCurrency(amt)} from ${payingStore.name}. Recorded in Daily Cashbook.`,
    });
    setPayingStore(null);
    setPaymentAmount('');
    setPaymentRef('');
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expenseForm.amount);
    const res = recordExpense(
      expenseForm.category,
      expenseForm.description,
      amt,
      expenseForm.deliverymanId || undefined,
      expenseForm.referenceId || undefined
    );
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not record expense.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Recorded cash outflow of ${formatCurrency(amt)}.`,
    });
    setExpenseModalOpen(false);
    setExpenseForm({
      category: 'FUEL_EXPENSE',
      description: '',
      amount: '',
      deliverymanId: deliverymen[0]?.id ?? '',
      referenceId: '',
    });
  };

  return (
    <DashboardLayout
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as CashierTab);
        setFeedback(null);
      }}
      pageTitle="Cashier & Treasury Portal"
      pageSubtitle="Receive cash against Warehouse Final Invoices, collect store dues, and maintain the BDT cashbook"
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

      {activeTab === 'settlement' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Final Invoices from Warehouse Manager (Pending Cash Receipt)
                </h2>
                <p className="text-xs text-slate-500">
                  Select a Final Invoice generated by the Warehouse Manager and receive cash
                  handover
                </p>
              </div>
              {pendingFinalInvoices.length > 0 && (
                <div className="flex items-center gap-2 text-xs">
                  <label className="font-medium text-slate-700">Final Invoice:</label>
                  <select
                    value={activeFinalInvoice?.id ?? ''}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                      setPhysicalCashInput('');
                    }}
                    className="px-3 py-2 border border-slate-200 rounded-lg bg-white font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {pendingFinalInvoices.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {inv.deliverymanName} (
                        {formatCurrency(inv.expectedCashFromWarehouse)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {!activeFinalInvoice ? (
              <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">
                  All Warehouse Final Invoices settled
                </p>
                <p className="text-xs text-slate-500">
                  When the Warehouse Manager receives returned stock and generates a Final Invoice,
                  it will appear here for cash collection.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-8 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono font-bold text-slate-900">
                        {activeFinalInvoice.invoiceNumber}
                      </span>
                      <span className="text-slate-600">
                        Warehouse Manager: <strong>{activeFinalInvoice.createdBy}</strong>
                      </span>
                      <span className="text-slate-600">
                        Driver: <strong>{activeFinalInvoice.deliverymanName}</strong>
                      </span>
                      {activeFinalInvoice.settlementDueDateKey && (
                        <StatusBadge
                          variant="amber"
                          label={`Rescheduled Due: ${activeFinalInvoice.settlementDueDateKey}${
                            activeFinalInvoice.rescheduledReason
                              ? ` (${activeFinalInvoice.rescheduledReason})`
                              : ''
                          }`}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrintableFinalInvoice(activeFinalInvoice)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Final Invoice
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="py-2.5 px-3 font-semibold">Order #</th>
                          <th className="py-2.5 px-3 font-semibold">Retail Store</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Delivered</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Ret. Credit</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Net Payable</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Store Due</th>
                          <th className="py-2.5 px-3 font-semibold text-right">Cash Collected</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {activeFinalInvoice.orders.map((ord) => (
                          <tr key={ord.orderId}>
                            <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                              {ord.orderNumber}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-800">
                              {ord.storeName}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right">
                              {formatCurrency(ord.deliveredAmount)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right text-rose-700">
                              -{formatCurrency(ord.returnCreditAmount)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right font-semibold">
                              {formatCurrency(ord.netPayableAmount)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right text-rose-700">
                              {formatCurrency(ord.dueAdded)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-right font-semibold text-emerald-700">
                              {formatCurrency(ord.cashCollectedByDriver)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <form
                  onSubmit={handleSettleFinalInvoice}
                  className="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">
                      Expected Cash from Warehouse
                    </span>
                    <span className="font-mono text-base font-bold text-slate-900">
                      {formatCurrency(expectedCash)}
                    </span>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Physical Cash Received (BDT)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={physicalCashInput === '' ? expectedCash : physicalCashInput}
                      onChange={(e) => setPhysicalCashInput(e.target.value)}
                      className="w-full px-3 py-2 font-mono text-sm font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                    <span className="font-medium text-slate-700">Surplus / Shortage Variance</span>
                    <StatusBadge
                      variant={
                        cashVariance < 0
                          ? 'rose'
                          : cashVariance > 0
                          ? 'blue'
                          : 'emerald'
                      }
                      label={`${cashVariance >= 0 ? '+' : ''}${formatCurrency(cashVariance)}`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={dayLocked}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Receive Cash Against Final Invoice
                  </button>
                </form>
              </div>
            )}
          </div>

          {settledFinalInvoices.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">
                  Settled Warehouse Final Invoices
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Final Invoice #</th>
                      <th className="py-2.5 px-4 font-semibold">Warehouse Mgr / Driver</th>
                      <th className="py-2.5 px-4 font-semibold">Settled At</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Expected Cash</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Cash Received</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Variance</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Print</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {settledFinalInvoices.map((inv) => {
                      const v = inv.variance ?? 0;
                      return (
                        <tr key={inv.id}>
                          <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                            <p>{inv.invoiceNumber}</p>
                            {inv.settlementDueDateKey && (
                              <p className="text-[11px] font-normal text-amber-700">
                                Due: {inv.settlementDueDateKey}
                                {inv.rescheduledReason ? ` · ${inv.rescheduledReason}` : ''}
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-800">
                            {inv.createdBy} · {inv.deliverymanName}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            {inv.settledAt ? formatDateTime(inv.settledAt) : '—'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right">
                            {formatCurrency(inv.expectedCashFromWarehouse)}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                            {formatCurrency(inv.cashReceivedByCashier ?? 0)}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right">
                            <StatusBadge
                              variant={v < 0 ? 'rose' : v > 0 ? 'blue' : 'emerald'}
                              label={`${v >= 0 ? '+' : ''}${formatCurrency(v)}`}
                            />
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => setPrintableFinalInvoice(inv)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'dues' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Store Credit &amp; Pending Dues
              </h2>
              <p className="text-xs text-slate-500">
                Collect outstanding store credit balances directly into the cashbook
              </p>
            </div>
            <span className="font-mono text-sm font-bold text-rose-700">
              Total Due: {formatCurrency(storesWithDue.reduce((s, st) => s + st.creditBalance, 0))}
            </span>
          </div>

          {storesWithDue.length === 0 ? (
            <div className="p-10 text-center space-y-1">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-800">Zero pending store dues</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Store Name</th>
                    <th className="py-2.5 px-4 font-semibold">Owner &amp; Phone</th>
                    <th className="py-2.5 px-4 font-semibold">Zone</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Pending Due</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {storesWithDue.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">{s.name}</td>
                      <td className="py-3 px-4">
                        <p className="text-slate-800">{s.ownerName}</p>
                        <p className="font-mono text-[11px] text-slate-500">{s.phone}</p>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{s.zone}</td>
                      <td className="py-3 px-4 font-mono text-right font-bold text-rose-700">
                        {formatCurrency(s.creditBalance)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          disabled={dayLocked}
                          onClick={() => {
                            setPayingStore(s);
                            setPaymentAmount(s.creditBalance.toFixed(2));
                            setPaymentRef('');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <Banknote className="w-3.5 h-3.5" />
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cashbook' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Total Cash Inflows</p>
              <p className="text-xl font-bold font-mono text-emerald-700">
                {formatCurrency(cashbookTotals.inflows)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Total Cash Outflows</p>
              <p className="text-xl font-bold font-mono text-rose-700">
                {formatCurrency(cashbookTotals.outflows)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
              <p className="text-xs font-medium text-slate-500">Daily Net Cash Balance</p>
              <p className="text-xl font-bold font-mono text-slate-900">
                {formatCurrency(cashbookTotals.netBalance)}
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Daily Cashbook Ledger</h2>
                <p className="text-xs text-slate-500">
                  Final Invoice settlements, credit collections, and fleet fuel/operating outflows
                </p>
              </div>
              <button
                type="button"
                disabled={dayLocked}
                onClick={() => setExpenseModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Record Fuel / Expense Outflow
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Timestamp</th>
                    <th className="py-2.5 px-4 font-semibold">Type</th>
                    <th className="py-2.5 px-4 font-semibold">Reference</th>
                    <th className="py-2.5 px-4 font-semibold">Description</th>
                    <th className="py-2.5 px-4 font-semibold">Recorded By</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.cashbook.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 text-slate-500">
                        {formatDateTime(entry.timestamp)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            entry.type === 'INFLOW' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {entry.type === 'INFLOW' ? (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          )}
                          {entry.type === 'INFLOW' ? 'Inflow' : 'Outflow'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {entry.referenceId || '—'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{entry.description}</td>
                      <td className="py-3 px-4 text-slate-600">{entry.recordedBy}</td>
                      <td
                        className={`py-3 px-4 font-mono text-right font-bold ${
                          entry.type === 'INFLOW' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {entry.type === 'INFLOW' ? '+' : '-'}
                        {formatCurrency(entry.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Store Due Payment Modal */}
      {payingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCollectDue}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Record Store Due Payment</h3>
              <button
                type="button"
                onClick={() => setPayingStore(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-bold text-slate-900">{payingStore.name}</p>
                <p className="text-slate-600">Owner: {payingStore.ownerName}</p>
                <p className="font-mono text-rose-700 font-semibold">
                  Outstanding Balance: {formatCurrency(payingStore.creditBalance)}
                </p>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Payment Amount (BDT)
                </label>
                <input
                  required
                  type="number"
                  min="0.01"
                  max={payingStore.creditBalance}
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 font-mono text-sm font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Receipt / Reference # (Optional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="PAY-9045"
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayingStore(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Confirm Payment
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Record Expense Modal */}
      {expenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleAddExpense}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Record Cash Outflow</h3>
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm((p) => ({
                      ...p,
                      category: e.target.value as 'FUEL_EXPENSE' | 'OTHER_EXPENSE',
                    }))
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="FUEL_EXPENSE">Delivery Fuel Expense</option>
                  <option value="OTHER_EXPENSE">Other Operating Expense</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Deliveryman / Vehicle (Optional)
                </label>
                <select
                  value={expenseForm.deliverymanId}
                  onChange={(e) =>
                    setExpenseForm((p) => ({ ...p, deliverymanId: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="">General Depot Expense</option>
                  {deliverymen.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.vehicleNo})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Description</label>
                <input
                  required
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) =>
                    setExpenseForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Route A afternoon diesel refill"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Amount (BDT)</label>
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm((p) => ({ ...p, amount: e.target.value }))}
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Voucher #</label>
                  <input
                    type="text"
                    value={expenseForm.referenceId}
                    onChange={(e) =>
                      setExpenseForm((p) => ({ ...p, referenceId: e.target.value }))
                    }
                    placeholder="FUEL-340"
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExpenseModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-blue-600 cursor-pointer"
              >
                Record Outflow
              </button>
            </div>
          </form>
        </div>
      )}

      <PrintableDocumentModal
        payload={
          printableFinalInvoice
            ? { kind: 'FINAL_INVOICE', invoice: printableFinalInvoice }
            : null
        }
        onClose={() => setPrintableFinalInvoice(null)}
      />
    </DashboardLayout>
  );
};
