import React from 'react';
import { LogOut, Smartphone } from 'lucide-react';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { LoginScreen } from './components/auth/LoginScreen';
import { CashierPortal } from './components/cashier/CashierPortal';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { OfflineIndicator } from './components/common/FieldAndroidAppBanner';
import { DeliveryPortal } from './components/delivery/DeliveryPortal';
import { SalesPortal } from './components/sales/SalesPortal';
import { WarehousePortal } from './components/warehouse/WarehousePortal';
import { DMSProvider, useDMS } from './context/DMSContext';
import { usePWAInstall } from './hooks/usePWAInstall';

const RoleRouter: React.FC = () => {
  const { currentUser, logout } = useDMS();
  const { appMode, isFieldAppMode, allowedRoles } = usePWAInstall();

  if (!currentUser) {
    return <LoginScreen />;
  }

  // Enforce mobile APK role restrictions when opened inside the Android app
  if (isFieldAppMode && allowedRoles && !allowedRoles.includes(currentUser.role)) {
    const appTitle =
      appMode === 'salesman'
        ? 'Salesman Only Android App'
        : appMode === 'distribution'
          ? 'Distribution Manager & Delivery Android App'
          : 'Field & Distribution Android App';
    const allowedText =
      appMode === 'salesman'
        ? 'Sales Representative'
        : appMode === 'distribution'
          ? 'Warehouse / Distribution Manager and Deliveryman'
          : 'Sales Representative, Distribution Manager, and Deliveryman';

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <Smartphone className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-slate-900">{appTitle}</h1>
            <p className="text-xs text-slate-600">
              This Android app only supports <strong>{allowedText}</strong> accounts. Please use the
              web portal at{' '}
              <span className="font-mono text-slate-900">dms.aerofiy.com</span> for other roles.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-emerald-700 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out &amp; Switch Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  switch (currentUser.role) {
    case 'ADMIN':
      return <AdminDashboard />;
    case 'WAREHOUSE_MANAGER':
      return <WarehousePortal />;
    case 'SALES_REP':
      return <SalesPortal />;
    case 'DELIVERYMAN':
      return <DeliveryPortal />;
    case 'CASHIER':
      return <CashierPortal />;
    default:
      return <LoginScreen />;
  }
};

export default function App() {
  return (
    <ErrorBoundary>
      <DMSProvider>
        <RoleRouter />
        <OfflineIndicator />
      </DMSProvider>
    </ErrorBoundary>
  );
}
