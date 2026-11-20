import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useDMS } from '../../context/DMSContext';
import { ROLE_LABELS } from '../../data/seedData';
import { UserRole } from '../../types/dms';

export interface NavItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string | number;
}

interface DashboardLayoutProps {
  navItems: NavItem[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  pageTitle: string;
  pageSubtitle?: string;
  children: React.ReactNode;
}

const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  ADMIN: 'bg-slate-900 text-white border-slate-900',
  WAREHOUSE_MANAGER: 'bg-blue-50 text-blue-800 border-blue-200',
  SALES_REP: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  DELIVERYMAN: 'bg-amber-50 text-amber-800 border-amber-200',
  CASHIER: 'bg-slate-100 text-slate-800 border-slate-300',
};

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  navItems,
  activeTab,
  onTabChange,
  pageTitle,
  pageSubtitle,
  children,
}) => {
  const { state, currentUser, logout, getWorkDayStatus, finishToday } = useDMS();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishFeedback, setFinishFeedback] = useState<string | null>(null);

  if (!currentUser) return null;

  const isNonAdmin = currentUser.role !== 'ADMIN';
  const workStatus = getWorkDayStatus(currentUser);
  const { companyProfile } = state;

  const handleConfirmFinishToday = () => {
    const res = finishToday();
    setFinishConfirmOpen(false);
    if (!res.ok) {
      setFinishFeedback(res.error ?? 'Could not finish today.');
    } else {
      setFinishFeedback(null);
    }
  };

  const renderNavContent = (isMobile: boolean) => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          {companyProfile.logoDataUrl ? (
            <img
              src={companyProfile.logoDataUrl}
              alt={companyProfile.companyName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
          )}
          {(!collapsed || isMobile) && (
            <span className="text-sm font-bold tracking-tight text-white truncate">
              {companyProfile.companyName || 'aerofiy DMS'}
            </span>
          )}
        </div>
        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="p-1.5 text-slate-400 hover:text-white rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onTabChange(item.id);
                setMobileOpen(false);
              }}
              title={collapsed && !isMobile ? item.label : undefined}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <Icon className="w-4 h-4 shrink-0" />
                {(!collapsed || isMobile) && (
                  <span className="truncate whitespace-nowrap">{item.label}</span>
                )}
              </span>
              {(!collapsed || isMobile) &&
                item.badge !== undefined &&
                item.badge !== 0 && (
                  <span
                    className={`font-mono text-[11px] px-1.5 py-0.5 rounded ${
                      isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800 shrink-0">
        <button
          type="button"
          onClick={logout}
          title={collapsed && !isMobile ? 'Sign Out' : undefined}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(!collapsed || isMobile) && <span className="whitespace-nowrap">Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop collapsible sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-slate-800 transition-all duration-150 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderNavContent(false)}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] h-full z-50">
            {renderNavContent(true)}
          </aside>
        </div>
      )}

      {/* Main viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {pageTitle}
              </h1>
              {pageSubtitle && (
                <p className="text-xs text-slate-500 truncate hidden sm:block">
                  {pageSubtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser.name}
              </p>
              <p className="text-[11px] font-mono text-slate-500 leading-tight">
                @{currentUser.username}
              </p>
            </div>
            <span
              className={`px-2.5 py-1 text-xs font-semibold border rounded-md whitespace-nowrap shrink-0 ${
                ROLE_BADGE_CLASSES[currentUser.role]
              }`}
            >
              {ROLE_LABELS[currentUser.role]}
            </span>
            <div className="pl-3 border-l border-slate-200 flex items-center shrink-0">
              <span className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-700 bg-clip-text text-transparent whitespace-nowrap select-none">
                aerofiy <span className="font-extrabold text-emerald-700">DMS</span>
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {isNonAdmin && (
            <div
              className={`mb-6 rounded-xl border p-4 flex flex-col gap-3 ${
                workStatus.isLocked
                  ? 'bg-slate-900 text-white border-slate-800'
                  : workStatus.isAdminUnlocked
                  ? 'bg-blue-50 border-blue-200 text-blue-950'
                  : workStatus.finishBlockedReason
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      workStatus.isLocked
                        ? 'bg-slate-800 text-amber-400'
                        : workStatus.isAdminUnlocked
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {workStatus.isLocked ? (
                      <Lock className="w-4 h-4" />
                    ) : workStatus.isAdminUnlocked ? (
                      <Clock className="w-4 h-4" />
                    ) : (
                      <CalendarCheck2 className="w-4 h-4" />
                    )}
                  </div>

                  <div className="space-y-0.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">
                        Work Date:{' '}
                        <span className="font-mono">{workStatus.activeDateKey}</span>
                      </span>
                      {workStatus.isLocked ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30 rounded">
                          Day Finished &amp; Locked
                        </span>
                      ) : workStatus.isAdminUnlocked ? (
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-600 text-white rounded">
                          Admin 1-Hour Live Window ({workStatus.unlockRemainingMinutes}m left)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                          Shift Open
                        </span>
                      )}
                    </div>
                    <p
                      className={
                        workStatus.isLocked ? 'text-slate-300' : 'text-slate-600'
                      }
                    >
                      {workStatus.isLocked
                        ? `You finished work for ${workStatus.activeDateKey}. All edits are locked until tomorrow unless Admin grants a 1-hour live window.`
                        : workStatus.isAdminUnlocked
                        ? `Admin activated your Finish Today window for ${workStatus.activeDateKey}. Complete any edits and click Finish Today before the 1-hour timer expires.`
                        : 'Complete your tasks for today, then click Finish Today to lock this date.'}
                    </p>
                  </div>
                </div>

                {!workStatus.isLocked && (
                  <button
                    type="button"
                    disabled={!workStatus.canFinishToday}
                    onClick={() => setFinishConfirmOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-blue-600 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <CalendarCheck2 className="w-4 h-4" />
                    Finish Today
                  </button>
                )}
              </div>

              {workStatus.pendingPrerequisites.length > 0 && !workStatus.isLocked && (
                <div className="px-3.5 py-2.5 rounded-lg bg-amber-100/70 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      {currentUser.role === 'CASHIER'
                        ? 'Cashier cannot finish today before Warehouse Manager completes Finish Today:'
                        : 'Warehouse Manager cannot finish today until all Sales Reps and Deliverymen click Finish Today:'}
                    </p>
                    <p className="mt-0.5 text-amber-900">
                      Pending: {workStatus.pendingPrerequisites.join(' · ')}
                    </p>
                  </div>
                </div>
              )}

              {workStatus.warehousePendingInvoices.length > 0 && !workStatus.isLocked && (
                <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Pending Invoices Detected — Warehouse Manager Finish Today Blocked
                    </p>
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {workStatus.warehousePendingInvoices.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {workStatus.cashierMismatchDetails.length > 0 && !workStatus.isLocked && (
                <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">
                      Cash Mismatch / Unsettled Invoice Detected — Finish Today Blocked
                    </p>
                    <ul className="mt-1 list-disc list-inside space-y-0.5">
                      {workStatus.cashierMismatchDetails.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {finishFeedback && (
                <p className="text-xs font-medium text-rose-700">{finishFeedback}</p>
              )}
            </div>
          )}

          {children}
        </main>
      </div>

      {finishConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Confirm Finish Today ({workStatus.activeDateKey})
              </h3>
              <button
                type="button"
                onClick={() => setFinishConfirmOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2 text-xs text-slate-600 leading-relaxed">
              <p>
                Once you finish today&apos;s work for{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {workStatus.activeDateKey}
                </span>
                , you will no longer be able to create, modify, or edit records for this date.
              </p>
              <p>
                You will be able to resume work tomorrow, or an Administrator can grant a 1-hour
                live window if an urgent correction is needed.
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFinishConfirmOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFinishToday}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-blue-600 cursor-pointer"
              >
                Confirm &amp; Lock Today
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
