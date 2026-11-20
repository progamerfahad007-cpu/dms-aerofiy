import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarCheck2,
  CalendarClock,
  Check,
  Clock,
  Download,
  FileBarChart2,
  FileText,
  Globe,
  ImagePlus,
  KeyRound,
  LayoutDashboard,
  LayoutTemplate,
  Lock,
  MapPin,
  Package,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Settings,
  ShieldAlert,
  Smartphone,
  Tag,
  Trash2,
  Unlock,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { toDateKey, useDMS } from '../../context/DMSContext';
import { ROLE_LABELS } from '../../data/seedData';
import {
  CompanyProfile,
  PrintTemplateId,
  Product,
  RTVRecord,
  StaffUser,
  UserRole,
} from '../../types/dms';
import { LeafletMap, MapStorePin, PinState } from '../common/LeafletMap';
import {
  PRINT_TEMPLATE_LABELS,
  PrintableDocumentModal,
} from '../common/PrintableDocumentModal';
import { formatCurrency, formatDateTime, StatusBadge } from '../common/StatusBadge';
import { DashboardLayout, NavItem } from '../layout/DashboardLayout';
import { exportCatalogToCsv } from '../../utils/productCsv';
import { AdminReportsPanel } from './AdminReportsPanel';
import { BulkProductCsvModal } from './BulkProductCsvModal';

type AdminTab =
  | 'overview'
  | 'reports'
  | 'day-control'
  | 'staff'
  | 'products'
  | 'rtv'
  | 'settings';

export const AdminDashboard: React.FC = () => {
  const {
    state,
    currentUser,
    currentTimeMs,
    simulateAfter8PM,
    setSimulateAfter8PM,
    getWorkDayStatus,
    getCashierMismatchSummary,
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
    bulkImportProducts,
    updateProduct,
    deleteProduct,
    updateProductPrices,
    generateRTVDebitNote,
    resetDemoData,
  } = useDMS();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // User modal state
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    name: '',
    email: '',
    phone: '',
    role: 'SALES_REP' as UserRole,
    territory: '',
    vehicleNo: '',
    active: true,
  });

  // Change user password modal state
  const [passwordTargetUser, setPasswordTargetUser] = useState<StaffUser | null>(null);
  const [newUserPassword, setNewUserPassword] = useState('');

  // Admin own password change state
  const [adminPwdForm, setAdminPwdForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Product modal state
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [bulkCsvModalOpen, setBulkCsvModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState({
    sku: '',
    name: '',
    category: '',
    unit: 'Case',
    unitCost: '',
    sellingPrice: '',
    sellableStock: '',
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [modalCategoryInput, setModalCategoryInput] = useState('');

  // Inline product price drafts
  const [priceDrafts, setPriceDrafts] = useState<
    Record<string, { unitCost: string; sellingPrice: string }>
  >({});

  // RTV state
  const [manufacturerName, setManufacturerName] = useState('');
  const [printableRTV, setPrintableRTV] = useState<RTVRecord | null>(null);

  // Delete confirmation modal targets
  const [deleteTargetUser, setDeleteTargetUser] = useState<StaffUser | null>(null);
  const [deleteTargetProduct, setDeleteTargetProduct] = useState<Product | null>(null);

  // Reset confirmation
  const [confirmReset, setConfirmReset] = useState(false);

  // Day Control & 1-Hour Live Window state
  const nonAdminUsers = useMemo(
    () => state.users.filter((u) => u.role !== 'ADMIN'),
    [state.users]
  );
  const todayKey = toDateKey(new Date(currentTimeMs));
  const [unlockUserId, setUnlockUserId] = useState<string>(nonAdminUsers[0]?.id ?? '');
  const [unlockDateKey, setUnlockDateKey] = useState<string>(todayKey);

  const currentHour = new Date(currentTimeMs).getHours();
  const isAfter8PM = currentHour >= 20 || simulateAfter8PM;
  const todayMismatch = getCashierMismatchSummary(todayKey);
  const showAfter8PMAlert = isAfter8PM && todayMismatch.hasMismatch;

  // Invoice settlement rescheduling drafts
  const [rescheduleDrafts, setRescheduleDrafts] = useState<
    Record<string, { dateKey: string; reason: string }>
  >({});

  // Company Profile & Branding form
  const [companyForm, setCompanyForm] = useState<CompanyProfile>(state.companyProfile);

  useEffect(() => {
    setCompanyForm(state.companyProfile);
  }, [state.companyProfile]);

  const metrics = useMemo(() => {
    const completedOrders = state.orders.filter(
      (o) => o.status === 'DELIVERED' || o.status === 'PARTIAL_DELIVERY'
    );
    const totalSales = completedOrders.reduce((sum, o) => sum + o.netPayableAmount, 0);

    const todayStr = new Date().toDateString();
    const cashCollectedToday = state.cashbook
      .filter((c) => c.type === 'INFLOW' && new Date(c.timestamp).toDateString() === todayStr)
      .reduce((sum, c) => sum + c.amount, 0);

    const totalStoreReceivables = state.stores.reduce((sum, s) => sum + s.creditBalance, 0);
    const sellableValue = state.products.reduce(
      (sum, p) => sum + p.sellableStock * p.unitCost,
      0
    );
    const damagedValue = state.products.reduce(
      (sum, p) => sum + p.damagedStock * p.unitCost,
      0
    );
    const damagedUnits = state.products.reduce((sum, p) => sum + p.damagedStock, 0);

    return {
      totalSales,
      cashCollectedToday,
      totalStoreReceivables,
      sellableValue,
      damagedValue,
      damagedUnits,
    };
  }, [state]);

  const mapPins: MapStorePin[] = useMemo(() => {
    const pendingStoreIds = new Set(
      state.orders
        .filter((o) => o.status === 'PENDING_DISPATCH' || o.status === 'IN_TRANSIT')
        .map((o) => o.storeId)
    );
    return state.stores
      .filter((s) => s.lat !== null && s.lng !== null)
      .map((s) => {
        let pinState: PinState = 'ACTIVE';
        if (s.creditBalance > 0) {
          pinState = 'HAS_DUE';
        } else if (pendingStoreIds.has(s.id)) {
          pinState = 'PENDING_DELIVERY';
        }
        return {
          id: s.id,
          name: s.name,
          ownerName: s.ownerName,
          address: s.address,
          lat: s.lat as number,
          lng: s.lng as number,
          creditBalance: s.creditBalance,
          state: pinState,
        };
      });
  }, [state.stores, state.orders]);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview & Map', icon: LayoutDashboard },
    { id: 'reports', label: 'Reports & Analytics', icon: FileBarChart2 },
    {
      id: 'day-control',
      label: 'Day Control & Locks',
      icon: CalendarCheck2,
      badge: showAfter8PMAlert ? '!' : undefined,
    },
    { id: 'staff', label: 'Staff & Passwords', icon: Users, badge: state.users.length },
    { id: 'products', label: 'Products & Pricing', icon: Package, badge: state.products.length },
    {
      id: 'rtv',
      label: 'Manufacturer RTV',
      icon: FileText,
      badge: metrics.damagedUnits > 0 ? metrics.damagedUnits : undefined,
    },
    { id: 'settings', label: 'Security & Settings', icon: Settings },
  ];

  const openAddUser = () => {
    setEditingUser(null);
    setUserForm({
      username: '',
      password: '',
      name: '',
      email: '',
      phone: '',
      role: 'SALES_REP',
      territory: '',
      vehicleNo: '',
      active: true,
    });
    setUserModalOpen(true);
  };

  const openEditUser = (u: StaffUser) => {
    setEditingUser(u);
    setUserForm({
      username: u.username,
      password: u.password,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      territory: u.territory ?? '',
      vehicleNo: u.vehicleNo ?? '',
      active: u.active,
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name.trim() || !userForm.username.trim()) return;
    if (editingUser) {
      const res = updateUser({
        ...editingUser,
        ...userForm,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error ?? 'Could not update user.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: `Updated staff account "${userForm.username.trim()}" (${userForm.name.trim()}).`,
      });
    } else {
      const res = addUser(userForm);
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error ?? 'Could not create user.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: `Added user "${res.data?.username}" (${ROLE_LABELS[userForm.role]}) — synced live across all devices.`,
      });
    }
    setUserModalOpen(false);
  };

  const handleChangeTargetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetUser) return;
    const res = changeUserPassword(passwordTargetUser.id, newUserPassword);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to change password.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Password updated for user "${passwordTargetUser.username}" (${passwordTargetUser.name}).`,
    });
    setPasswordTargetUser(null);
    setNewUserPassword('');
  };

  const handleChangeOwnPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPwdForm.newPassword !== adminPwdForm.confirmPassword) {
      setFeedback({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    const res = changeOwnAdminPassword(
      adminPwdForm.currentPassword,
      adminPwdForm.newPassword
    );
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not update Admin password.' });
      return;
    }
    setAdminPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setFeedback({
      type: 'success',
      text: 'Admin password updated successfully. Use your new password on next sign-in.',
    });
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addProductCategory(newCategoryName);
    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not add category.' });
      return;
    }
    setNewCategoryName('');
    setFeedback({ type: 'success', text: `Added product category "${res.data}".` });
  };

  const handleQuickAddModalCategory = () => {
    const res = addProductCategory(modalCategoryInput);
    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not add category.' });
      return;
    }
    setProductForm((p) => ({ ...p, category: res.data as string }));
    setModalCategoryInput('');
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setModalCategoryInput('');
    setProductForm({
      sku: '',
      name: '',
      category: state.productCategories[0] ?? '',
      unit: 'Case',
      unitCost: '',
      sellingPrice: '',
      sellableStock: '0',
    });
    setProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setModalCategoryInput('');
    setProductForm({
      sku: p.sku,
      name: p.name,
      category: p.category,
      unit: p.unit,
      unitCost: String(p.unitCost),
      sellingPrice: String(p.sellingPrice),
      sellableStock: String(p.sellableStock),
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const unitCost = Number(productForm.unitCost);
    const sellingPrice = Number(productForm.sellingPrice);
    const sellableStock = Number(productForm.sellableStock);
    if (
      !productForm.sku.trim() ||
      !productForm.name.trim() ||
      !productForm.category.trim() ||
      isNaN(unitCost) ||
      isNaN(sellingPrice)
    ) {
      if (!productForm.category.trim()) {
        setFeedback({
          type: 'error',
          text: 'Please create and select a product category first.',
        });
      }
      return;
    }

    if (editingProduct) {
      const res = updateProduct({
        ...editingProduct,
        sku: productForm.sku.trim().toUpperCase(),
        name: productForm.name.trim(),
        category: productForm.category.trim(),
        unit: productForm.unit.trim(),
        unitCost,
        sellingPrice,
        sellableStock: isNaN(sellableStock) ? editingProduct.sellableStock : sellableStock,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error ?? 'Could not update product.' });
        return;
      }
      setPriceDrafts((prev) => {
        const next = { ...prev };
        delete next[editingProduct.id];
        return next;
      });
      setFeedback({ type: 'success', text: `Updated SKU ${productForm.sku.toUpperCase()}.` });
      setProductModalOpen(false);
    } else {
      const res = addProduct({
        sku: productForm.sku,
        name: productForm.name.trim(),
        category: productForm.category.trim(),
        unit: productForm.unit.trim(),
        unitCost,
        sellingPrice,
        sellableStock: isNaN(sellableStock) ? 0 : sellableStock,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error ?? 'Could not add product.' });
        return;
      }
      setFeedback({ type: 'success', text: `Added new product ${res.data?.sku}.` });
      setProductModalOpen(false);
    }
  };

  const handleBulkImportProducts = (
    rows: Omit<Product, 'id' | 'inTransitStock' | 'damagedStock'>[],
    duplicateMode: 'UPDATE' | 'SKIP'
  ) => {
    const res = bulkImportProducts(rows, duplicateMode);
    if (!res.ok || !res.data) {
      return res;
    }
    const { added, updated, skipped, categoriesAdded } = res.data;
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (updated > 0) parts.push(`${updated} updated`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (categoriesAdded > 0) parts.push(`${categoriesAdded} new categor${categoriesAdded === 1 ? 'y' : 'ies'} created`);
    setPriceDrafts({});
    setFeedback({
      type: 'success',
      text: `Bulk CSV import complete: ${parts.join(', ')} — synced live across all devices.`,
    });
    return res;
  };

  const handleInlinePriceSave = (p: Product) => {
    const draft = priceDrafts[p.id];
    if (!draft) return;
    const cost = Number(draft.unitCost);
    const sell = Number(draft.sellingPrice);
    const res = updateProductPrices(p.id, cost, sell);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Invalid price.' });
      return;
    }
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    setFeedback({
      type: 'success',
      text: `Updated prices for ${p.sku}: Cost ${formatCurrency(cost)} · Selling ${formatCurrency(sell)}.`,
    });
  };

  const handleConfirmDeleteUser = () => {
    if (!deleteTargetUser) return;
    const target = deleteTargetUser;
    const res = deleteUser(target.id);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not delete user.' });
      setDeleteTargetUser(null);
      return;
    }
    setDeleteTargetUser(null);
    setFeedback({
      type: 'success',
      text: `Deleted staff account "${target.username}" (${target.name}).`,
    });
  };

  const handleConfirmDeleteProduct = () => {
    if (!deleteTargetProduct) return;
    const target = deleteTargetProduct;
    const res = deleteProduct(target.id);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not delete product.' });
      setDeleteTargetProduct(null);
      return;
    }
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
    setDeleteTargetProduct(null);
    setFeedback({
      type: 'success',
      text: `Deleted product ${target.sku} (${target.name}) from catalog.`,
    });
  };

  const handleGenerateRTV = () => {
    const res = generateRTVDebitNote(manufacturerName);
    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to generate RTV.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Debit Note ${res.data.debitNoteNo} generated for ${formatCurrency(res.data.totalClaimAmount)}. Damaged stock cleared.`,
    });
    setPrintableRTV(res.data);
  };

  const handleActivateWindow = (targetUserId: string, targetDate: string) => {
    const res = activateOneHourFinishWindow(targetUserId, targetDate);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not activate 1-hour window.' });
      return;
    }
    const targetUser = state.users.find((u) => u.id === targetUserId);
    setFeedback({
      type: 'success',
      text: `Finish Today button activated for 1 hour for ${targetUser?.name ?? 'User'} on ${targetDate}.`,
    });
  };

  const handleRescheduleInvoice = (invoiceId: string, fallbackDateKey: string) => {
    const draft = rescheduleDrafts[invoiceId];
    const targetDate = draft?.dateKey || fallbackDateKey;
    const reason = draft?.reason ?? '';
    const res = rescheduleInvoiceSettlementDate(invoiceId, targetDate, reason);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Failed to reschedule settlement date.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: `Rescheduled settlement date to ${targetDate}${reason.trim() ? ` (${reason.trim()})` : ''}.`,
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({
        type: 'error',
        text: 'Please select a valid image file for the company logo.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const rawDataUrl = reader.result;
      const img = new window.Image();
      img.onload = () => {
        const maxDim = 420;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let out = canvas.toDataURL('image/png');
          if (out.length > 300000) {
            out = canvas.toDataURL('image/jpeg', 0.8);
          }
          setCompanyForm((prev) => ({ ...prev, logoDataUrl: out }));
        } else if (rawDataUrl.length <= 320000) {
          setCompanyForm((prev) => ({ ...prev, logoDataUrl: rawDataUrl }));
        }
      };
      img.onerror = () => {
        if (rawDataUrl.length <= 320000) {
          setCompanyForm((prev) => ({ ...prev, logoDataUrl: rawDataUrl }));
        } else {
          setFeedback({
            type: 'error',
            text: 'Logo image is too large. Please upload a smaller image.',
          });
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompanyProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const res = updateCompanyProfile(companyForm);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not save company profile.' });
      return;
    }
    setFeedback({
      type: 'success',
      text: 'Company logo, address, and contact information updated across the app and A5 printouts.',
    });
  };

  const [downloadingCpanelZip, setDownloadingCpanelZip] = useState(false);

  const handleDownloadCpanelBundle = async () => {
    setDownloadingCpanelZip(true);
    try {
      const response = await fetch('./dms-aerofiy-com-cpanel.zip', { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('text/html')) {
        throw new Error('Deployment archive not found.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'dms-aerofiy-com-cpanel.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      setFeedback({
        type: 'success',
        text: 'Downloaded dms-aerofiy-com-cpanel.zip — upload and extract inside your dms.aerofiy.com cPanel folder.',
      });
    } catch {
      setFeedback({
        type: 'error',
        text: 'Could not download ZIP automatically. You can also copy files directly from cpanel-deploy/dms.aerofiy.com/ in your downloaded project.',
      });
    } finally {
      setDownloadingCpanelZip(false);
    }
  };

  const damagedProducts = state.products.filter((p) => p.damagedStock > 0);

  return (
    <DashboardLayout
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as AdminTab);
        setFeedback(null);
      }}
      pageTitle="Admin Operations Center"
      pageSubtitle="Executive KPIs, date-filtered reports, day-close locks, product pricing, and role credentials"
    >
      {showAfter8PMAlert && (
        <div className="mb-5 bg-rose-50 border border-rose-300 rounded-xl p-4 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1 text-xs text-rose-950">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm">
                  After 8:00 PM Escalation: Cashier Mismatch Blocking Day Close
                </span>
                <span className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-rose-200/70 text-rose-900 rounded">
                  {todayKey}
                  {simulateAfter8PM && currentHour < 20 ? ' · Simulated > 20:00' : ''}
                </span>
              </div>
              <p className="text-rose-800">
                Cashier cannot finish work for today because an unsettled Final Invoice or cash
                variance remains open past 8:00 PM:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-rose-900 font-medium">
                {todayMismatch.reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          </div>
          {activeTab !== 'day-control' && (
            <button
              type="button"
              onClick={() => setActiveTab('day-control')}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 cursor-pointer shrink-0"
            >
              Review in Day Control
            </button>
          )}
        </div>
      )}

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

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Total Sales (Delivered)</p>
              <p className="text-xl font-bold font-mono text-slate-900">
                {formatCurrency(metrics.totalSales)}
              </p>
              <p className="text-[11px] text-slate-400">Net payable across completed stops</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Cash Collected Today</p>
              <p className="text-xl font-bold font-mono text-emerald-700">
                {formatCurrency(metrics.cashCollectedToday)}
              </p>
              <p className="text-[11px] text-slate-400">Cashier vault inflows today</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Store Receivables (Dues)</p>
              <p className="text-xl font-bold font-mono text-rose-700">
                {formatCurrency(metrics.totalStoreReceivables)}
              </p>
              <p className="text-[11px] text-slate-400">
                {state.stores.filter((s) => s.creditBalance > 0).length} stores with balance
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Sellable Inventory Value</p>
              <p className="text-xl font-bold font-mono text-slate-900">
                {formatCurrency(metrics.sellableValue)}
              </p>
              <p className="text-[11px] text-slate-400">At warehouse unit cost</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Damaged Stock Value</p>
              <p className="text-xl font-bold font-mono text-amber-700">
                {formatCurrency(metrics.damagedValue)}
              </p>
              <p className="text-[11px] text-slate-400">
                {metrics.damagedUnits} units queued for RTV
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Master Geo-Tagged Store Map
                </h2>
                <p className="text-xs text-slate-500">
                  Showing {mapPins.length} geo-tagged retail outlets across territory (
                  {state.stores.length - mapPins.length} awaiting GPS pin)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  Active
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  Pending Delivery
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
                  Has Due
                </span>
              </div>
            </div>

            <LeafletMap pins={mapPins} heightClass="h-[440px]" />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Live 3-Bucket Inventory Ledger
                </h2>
                <p className="text-xs text-slate-500">
                  Real-time split across warehouse sellable, route in-transit, and damaged RTV
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">SKU</th>
                    <th className="py-2.5 px-4 font-semibold">Product</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Unit Cost</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Sell Price</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Sellable</th>
                    <th className="py-2.5 px-4 font-semibold text-right">In Transit</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Damaged</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.products.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-4 font-mono text-slate-600">{p.sku}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">{p.name}</td>
                      <td className="py-2.5 px-4 font-mono text-right text-slate-600">
                        {formatCurrency(p.unitCost)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right text-slate-900">
                        {formatCurrency(p.sellingPrice)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-semibold text-emerald-700">
                        {p.sellableStock}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-semibold text-blue-700">
                        {p.inTransitStock}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-right font-semibold text-rose-700">
                        {p.damagedStock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && <AdminReportsPanel />}

      {activeTab === 'day-control' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const targetId = unlockUserId || nonAdminUsers[0]?.id || '';
                handleActivateWindow(targetId, unlockDateKey);
              }}
              className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                  <Unlock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Activate &ldquo;Finish Today&rdquo; Window (1 Hour Live Access)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Re-open a finished day or grant 1-hour edit &amp; Finish Today access for any
                    non-admin staff member on any selected date.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Select Staff User
                  </label>
                  <select
                    value={unlockUserId || nonAdminUsers[0]?.id || ''}
                    onChange={(e) => setUnlockUserId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {nonAdminUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({ROLE_LABELS[u.role]} · @{u.username})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Select Operational Date
                  </label>
                  <input
                    required
                    type="date"
                    value={unlockDateKey}
                    onChange={(e) => setUnlockDateKey(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-slate-500">
                  Grants live edit &amp; Finish Today permission for exactly 60 minutes from
                  activation.
                </span>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
                >
                  <Clock className="w-4 h-4" />
                  Activate Finish Today for 1 Hour
                </button>
              </div>
            </form>

            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      todayMismatch.hasMismatch
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">
                      After 8:00 PM Cashier Mismatch Monitor
                    </h2>
                    <p className="text-xs text-slate-500">
                      Local time:{' '}
                      <span className="font-mono font-semibold text-slate-700">
                        {new Date(currentTimeMs).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>{' '}
                      · Escalation triggers at 20:00 (8:00 PM)
                    </p>
                  </div>
                </div>
              </div>

              {todayMismatch.hasMismatch ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1">
                  <p className="font-semibold">
                    Cashier close blocked for {todayKey}:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {todayMismatch.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900">
                  No cash variance or unsettled Final Invoice mismatches detected for {todayKey}.
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  Test 8:00 PM admin notification before 20:00
                </span>
                <button
                  type="button"
                  onClick={() => setSimulateAfter8PM(!simulateAfter8PM)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                    simulateAfter8PM
                      ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {simulateAfter8PM ? 'Disable 8 PM Preview' : 'Simulate After 8:00 PM'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">
                Daily Staff Close Status ({todayKey})
              </h2>
              <p className="text-xs text-slate-500">
                Sales Reps &amp; Deliverymen finish first; Warehouse Manager unlocks Finish Today
                after all active SRs &amp; Deliverymen finish AND zero invoices remain pending
                dispatch, in-transit, or awaiting Final Invoice; Cashier cannot finish before
                Warehouse Manager and requires zero unresolved mismatches (unless rescheduled by
                Admin).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Staff Member</th>
                    <th className="py-2.5 px-4 font-semibold">Role</th>
                    <th className="py-2.5 px-4 font-semibold">Active Date</th>
                    <th className="py-2.5 px-4 font-semibold">Close State</th>
                    <th className="py-2.5 px-4 font-semibold">Rule / Blocking Reason</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Admin Override</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {nonAdminUsers.map((u) => {
                    const ws = getWorkDayStatus(u);
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{u.name}</p>
                          <p className="font-mono text-[11px] text-slate-500">@{u.username}</p>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge variant="blue" label={ROLE_LABELS[u.role]} />
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">{ws.activeDateKey}</td>
                        <td className="py-3 px-4">
                          {ws.isLocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300 rounded">
                              <Lock className="w-3 h-3" />
                              Finished &amp; Locked
                            </span>
                          ) : ws.isAdminUnlocked ? (
                            <StatusBadge
                              variant="blue"
                              label={`1h Live (${ws.unlockRemainingMinutes}m left)`}
                            />
                          ) : !ws.canFinishToday ? (
                            <StatusBadge variant="amber" label="Finish Blocked" />
                          ) : (
                            <StatusBadge variant="emerald" label="Shift Open" />
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-xs">
                          {ws.finishBlockedReason ||
                            (ws.isLocked
                              ? 'Day closed; edits locked'
                              : ws.isAdminUnlocked
                              ? 'Temporary 1-hour window active'
                              : 'Ready to finish anytime')}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleActivateWindow(u.id, unlockDateKey)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 cursor-pointer"
                          >
                            <Unlock className="w-3 h-3" />
                            Activate 1h ({unlockDateKey})
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {state.dayLocks.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">
                  Day Lock &amp; 1-Hour Activation Audit Log
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-4 font-semibold">Staff Member</th>
                      <th className="py-2.5 px-4 font-semibold">Role</th>
                      <th className="py-2.5 px-4 font-semibold">Finished At</th>
                      <th className="py-2.5 px-4 font-semibold">1h Window Expires</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {state.dayLocks.map((rec) => {
                      const isLiveNow =
                        rec.unlockedUntil &&
                        new Date(rec.unlockedUntil).getTime() > currentTimeMs;
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">
                            {rec.dateKey}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-800">
                            {rec.userName}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {ROLE_LABELS[rec.userRole]}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            {rec.finishedAt ? formatDateTime(rec.finishedAt) : '—'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-600">
                            {rec.unlockedUntil ? (
                              <span
                                className={
                                  isLiveNow ? 'text-blue-700 font-semibold' : 'text-slate-400'
                                }
                              >
                                {formatDateTime(rec.unlockedUntil)}
                                {isLiveNow ? ' (Live)' : ' (Expired)'}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleActivateWindow(rec.userId, rec.dateKey)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                            >
                              <Unlock className="w-3 h-3" />
                              Re-Activate 1h
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

          {/* Invoice Settlement Date Rescheduling */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                  <CalendarClock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Reschedule Final Invoice Settlement Date (Dispute Extension)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Extend the settlement date of any disputed or pending Final Invoice so Cashier
                    can close today without blocking while the dispute is resolved within the new
                    period.
                  </p>
                </div>
              </div>
            </div>

            {state.finalInvoices.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No Final Invoices have been issued by the Warehouse Manager yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">Invoice #</th>
                      <th className="py-2.5 px-4 font-semibold">Driver / Status</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Expected / Variance</th>
                      <th className="py-2.5 px-4 font-semibold">Active Settlement Date</th>
                      <th className="py-2.5 px-4 font-semibold">New Date &amp; Dispute Note</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {state.finalInvoices.map((inv) => {
                      const effectiveDue = inv.settlementDueDateKey || toDateKey(inv.createdAt);
                      const draft = rescheduleDrafts[inv.id] ?? {
                        dateKey: effectiveDue,
                        reason: inv.rescheduledReason ?? '',
                      };
                      const variance = inv.variance ?? 0;
                      return (
                        <tr key={inv.id} className="hover:bg-slate-50/80 align-top">
                          <td className="py-3 px-4">
                            <p className="font-mono font-semibold text-slate-900">
                              {inv.invoiceNumber}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Issued {toDateKey(inv.createdAt)}
                            </p>
                          </td>
                          <td className="py-3 px-4 space-y-1">
                            <p className="font-medium text-slate-800">{inv.deliverymanName}</p>
                            <StatusBadge
                              variant={
                                !inv.cashSettled
                                  ? 'amber'
                                  : Math.abs(variance) > 0.01
                                  ? 'rose'
                                  : 'emerald'
                              }
                              label={
                                !inv.cashSettled
                                  ? 'Pending Settlement'
                                  : Math.abs(variance) > 0.01
                                  ? 'Variance Dispute'
                                  : 'Settled Matched'
                              }
                            />
                          </td>
                          <td className="py-3 px-4 font-mono text-right">
                            <p className="font-semibold text-slate-900">
                              {formatCurrency(inv.expectedCashFromWarehouse)}
                            </p>
                            {inv.cashSettled && (
                              <p
                                className={`text-[11px] font-semibold ${
                                  Math.abs(variance) > 0.01
                                    ? 'text-rose-700'
                                    : 'text-emerald-700'
                                }`}
                              >
                                Var: {variance >= 0 ? '+' : ''}
                                {formatCurrency(variance)}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-mono font-semibold text-slate-900">
                              {effectiveDue}
                            </p>
                            {inv.settlementDueDateKey && (
                              <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                                Extended {inv.rescheduledBy ? `by ${inv.rescheduledBy}` : ''}
                              </p>
                            )}
                            {inv.rescheduledReason && (
                              <p className="text-[11px] text-slate-500 mt-0.5 max-w-[180px]">
                                {inv.rescheduledReason}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4 space-y-1.5 min-w-[230px]">
                            <input
                              type="date"
                              value={draft.dateKey}
                              onChange={(e) =>
                                setRescheduleDrafts((prev) => ({
                                  ...prev,
                                  [inv.id]: { ...draft, dateKey: e.target.value },
                                }))
                              }
                              className="w-full px-2.5 py-1.5 font-mono border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                            <input
                              type="text"
                              value={draft.reason}
                              onChange={(e) =>
                                setRescheduleDrafts((prev) => ({
                                  ...prev,
                                  [inv.id]: { ...draft, reason: e.target.value },
                                }))
                              }
                              placeholder="Dispute / extension reason..."
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleRescheduleInvoice(inv.id, draft.dateKey)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-blue-600 cursor-pointer"
                            >
                              <CalendarClock className="w-3.5 h-3.5" />
                              Reschedule Date
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
        </div>
      )}

      {activeTab === 'staff' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Staff Directory & Access Credentials
              </h2>
              <p className="text-xs text-slate-500">
                Create users for any role, assign login usernames, and manage or reset user
                passwords
              </p>
            </div>
            <button
              type="button"
              onClick={openAddUser}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Staff User
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Name</th>
                  <th className="py-2.5 px-4 font-semibold">Login Username</th>
                  <th className="py-2.5 px-4 font-semibold">Role</th>
                  <th className="py-2.5 px-4 font-semibold">Phone</th>
                  <th className="py-2.5 px-4 font-semibold">Territory / Vehicle</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900">{u.name}</p>
                      <p className="text-[11px] text-slate-500">{u.email}</p>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                      {u.username}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge variant="blue" label={ROLE_LABELS[u.role]} />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{u.phone}</td>
                    <td className="py-3 px-4 text-slate-600">
                      {u.territory || '—'}
                      {u.vehicleNo ? ` · ${u.vehicleNo}` : ''}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        variant={u.active ? 'emerald' : 'slate'}
                        label={u.active ? 'Active' : 'Inactive'}
                      />
                    </td>
                    <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setPasswordTargetUser(u);
                          setNewUserPassword('');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md hover:bg-amber-100 cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3" />
                        Change Password
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditUser(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={u.id === currentUser?.id}
                        title={
                          u.id === currentUser?.id
                            ? 'Cannot delete your active signed-in Admin account'
                            : `Delete ${u.name}`
                        }
                        onClick={() => setDeleteTargetUser(u)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'products' && (
        <div className="space-y-6">
          {/* Admin Product Category Manager */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Tag className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Product Categories</h2>
                  <p className="text-xs text-slate-500">
                    Create categories here so they appear in the Category dropdown when adding or
                    editing products
                  </p>
                </div>
              </div>
              <form onSubmit={handleAddCategory} className="flex items-center gap-2 text-xs">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name..."
                  className="px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 w-52"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add Category
                </button>
              </form>
            </div>

            {state.productCategories.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-4 py-3">
                No product categories created yet. Add your first category above to populate the
                product dropdown.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {state.productCategories.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 border border-slate-200 rounded-lg"
                  >
                    {cat}
                    <button
                      type="button"
                      aria-label={`Remove category ${cat}`}
                      onClick={() => {
                        const res = deleteProductCategory(cat);
                        if (res.ok) {
                          setFeedback({
                            type: 'success',
                            text: `Removed category "${cat}".`,
                          });
                        }
                      }}
                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Product Catalog & Price Editor (BDT)
                </h2>
                <p className="text-xs text-slate-500">
                  Edit each product&apos;s Unit Cost and Selling Price directly inline or via full
                  SKU editor
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {state.products.length > 0 && (
                  <button
                    type="button"
                    onClick={() => exportCatalogToCsv(state.products)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBulkCsvModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Bulk Upload CSV
                </button>
                <button
                  type="button"
                  onClick={openAddProduct}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Add Product
                </button>
              </div>
            </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">SKU</th>
                  <th className="py-2.5 px-4 font-semibold">Product Name</th>
                  <th className="py-2.5 px-4 font-semibold">Unit</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Unit Cost (BDT)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Selling Price (BDT)</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Sellable</th>
                  <th className="py-2.5 px-4 font-semibold text-right">In Transit</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Damaged</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {state.products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 px-4 text-center text-slate-500">
                      No products in catalog yet. Click <strong>Add Product</strong> or{' '}
                      <strong>Bulk Upload CSV</strong> to import your catalog.
                    </td>
                  </tr>
                ) : (
                  state.products.map((p) => {
                    const draft = priceDrafts[p.id];
                    const costVal = draft ? draft.unitCost : String(p.unitCost);
                    const sellVal = draft ? draft.sellingPrice : String(p.sellingPrice);
                    const isDirty =
                      draft !== undefined &&
                      (Number(draft.unitCost) !== p.unitCost ||
                        Number(draft.sellingPrice) !== p.sellingPrice);

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono font-medium text-slate-700">{p.sku}</td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="text-[11px] text-slate-500">{p.category}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{p.unit}</td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            aria-label={`Unit cost for ${p.name}`}
                            value={costVal}
                            onChange={(e) =>
                              setPriceDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  unitCost: e.target.value,
                                  sellingPrice: prev[p.id]?.sellingPrice ?? String(p.sellingPrice),
                                },
                              }))
                            }
                            className="w-24 px-2 py-1 text-right font-mono border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            aria-label={`Selling price for ${p.name}`}
                            value={sellVal}
                            onChange={(e) =>
                              setPriceDrafts((prev) => ({
                                ...prev,
                                [p.id]: {
                                  unitCost: prev[p.id]?.unitCost ?? String(p.unitCost),
                                  sellingPrice: e.target.value,
                                },
                              }))
                            }
                            className="w-24 px-2 py-1 text-right font-mono font-semibold border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-emerald-700 font-semibold">
                          {p.sellableStock}
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-blue-700">
                          {p.inTransitStock}
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-rose-700">
                          {p.damagedStock}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                          {isDirty && (
                            <button
                              type="button"
                              onClick={() => handleInlinePriceSave(p)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded-md hover:bg-emerald-700 cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                              Save Price
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetProduct(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>
        </div>
      )}

      {activeTab === 'rtv' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Accumulated Damaged Stock (Pending Manufacturer Return)
                </h2>
                <p className="text-xs text-slate-500">
                  Generate a Return to Manufacturer Debit Note to clear damaged inventory and log a
                  credit claim
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  value={manufacturerName}
                  onChange={(e) => setManufacturerName(e.target.value)}
                  placeholder="Manufacturer Name"
                  className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[220px]"
                />
                <button
                  type="button"
                  disabled={damagedProducts.length === 0}
                  onClick={handleGenerateRTV}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-4 h-4" />
                  Generate Return to Manufacturer Debit Note
                </button>
              </div>
            </div>

            {damagedProducts.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-lg p-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No damaged stock currently queued
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Damaged returns from stores or warehouse reconciliations will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold">SKU</th>
                      <th className="py-2.5 px-4 font-semibold">Product</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Damaged Qty</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Unit Cost</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Claim Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {damagedProducts.map((p) => (
                      <tr key={p.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{p.sku}</td>
                        <td className="py-2.5 px-4 font-medium text-slate-900">{p.name}</td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold text-rose-700">
                          {p.damagedStock}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right text-slate-600">
                          {formatCurrency(p.unitCost)}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-right font-semibold text-slate-900">
                          {formatCurrency(p.damagedStock * p.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-sm font-bold text-slate-900">Issued RTV Debit Notes</h2>
              <p className="text-xs text-slate-500">Historical credit claims sent to manufacturers</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Debit Note #</th>
                    <th className="py-2.5 px-4 font-semibold">Manufacturer</th>
                    <th className="py-2.5 px-4 font-semibold">Issued Date</th>
                    <th className="py-2.5 px-4 font-semibold">Created By</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Items</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Total Claim</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Print</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.rtvs.map((rtv) => (
                    <tr key={rtv.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {rtv.debitNoteNo}
                      </td>
                      <td className="py-3 px-4 text-slate-800">{rtv.manufacturerName}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDateTime(rtv.createdAt)}</td>
                      <td className="py-3 px-4 text-slate-600">{rtv.createdBy}</td>
                      <td className="py-3 px-4 font-mono text-right text-slate-700">
                        {rtv.items.reduce((s, i) => s + i.qty, 0)} units
                      </td>
                      <td className="py-3 px-4 font-mono text-right font-semibold text-blue-700">
                        {formatCurrency(rtv.totalClaimAmount)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => setPrintableRTV(rtv)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          View
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

      {activeTab === 'settings' && (
        <div className="max-w-4xl space-y-6">
          {/* cPanel Ready Download for dms.aerofiy.com */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      cPanel Hosting Package (Copy &amp; Paste Ready)
                    </h2>
                    <StatusBadge variant="emerald" label="dms.aerofiy.com" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Download the pre-compiled static bundle containing{' '}
                    <span className="font-mono font-semibold text-slate-800">index.html</span>,{' '}
                    <span className="font-mono font-semibold text-slate-800">.htaccess</span>{' '}
                    (HTTPS + routing), and{' '}
                    <span className="font-mono font-semibold text-slate-800">assets/</span>. No
                    Node.js or build step needed on your cPanel server.
                  </p>
                </div>
              </div>

              {typeof window !== 'undefined' &&
              window.location.hostname === 'dms.aerofiy.com' ? (
                <StatusBadge variant="emerald" label="Live on dms.aerofiy.com" />
              ) : (
                <button
                  type="button"
                  disabled={downloadingCpanelZip}
                  onClick={handleDownloadCpanelBundle}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-60 cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4" />
                  {downloadingCpanelZip
                    ? 'Preparing ZIP...'
                    : 'Download cPanel ZIP (dms.aerofiy.com)'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-mono text-[11px] font-bold text-emerald-700">STEP 1</p>
                <p className="font-semibold text-slate-900">Create Subdomain</p>
                <p className="text-slate-600">
                  In cPanel → Domains, create <span className="font-mono">dms.aerofiy.com</span>{' '}
                  with its own Document Root (uncheck Share document root).
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-mono text-[11px] font-bold text-emerald-700">STEP 2</p>
                <p className="font-semibold text-slate-900">Upload &amp; Extract</p>
                <p className="text-slate-600">
                  Upload <span className="font-mono">dms-aerofiy-com-cpanel.zip</span> into the
                  subdomain folder in File Manager and click Extract.
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-mono text-[11px] font-bold text-emerald-700">STEP 3</p>
                <p className="font-semibold text-slate-900">Run AutoSSL</p>
                <p className="text-slate-600">
                  Enable HTTPS in cPanel → SSL/TLS Status so browser GPS capture works cleanly.
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <p className="font-mono text-[11px] font-bold text-emerald-700">STEP 4</p>
                <p className="font-semibold text-slate-900">Go Live</p>
                <p className="text-slate-600">
                  Open <span className="font-mono">https://dms.aerofiy.com</span> and log in with{' '}
                  <span className="font-mono">Admin / 1234</span>.
                </p>
              </div>
            </div>
          </div>

          {/* Signed Android APK Downloads */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    Signed Android Apps (.apk) — Ready to Install
                  </h2>
                  <StatusBadge variant="emerald" label="Android 7.0 – 15" />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Direct signed <span className="font-mono font-semibold text-slate-800">.apk</span>{' '}
                  installers connected in real time to{' '}
                  <span className="font-mono font-semibold text-slate-800">dms.aerofiy.com</span>{' '}
                  with native GPS location and camera support. All APKs are also bundled inside the
                  cPanel ZIP above.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">Salesman App (.apk)</p>
                  <p className="text-slate-600">
                    Dedicated Android app for Sales Representatives: store onboarding, GPS tagging,
                    and field order booking.
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">aerofiy-salesman-app.apk</p>
                </div>
                <a
                  href="./aerofiy-salesman-app.apk"
                  download="aerofiy-salesman-app.apk"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Salesman APK
                </a>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">Distribution Manager App (.apk)</p>
                  <p className="text-slate-600">
                    Dedicated Android app for Warehouse / Distribution Managers &amp; Deliverymen:
                    GRN invoice camera, dispatch, and stock queries.
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">
                    aerofiy-distribution-manager-app.apk
                  </p>
                </div>
                <a
                  href="./aerofiy-distribution-manager-app.apk"
                  download="aerofiy-distribution-manager-app.apk"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Distribution APK
                </a>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <p className="font-bold text-slate-900">All-in-One Field App (.apk)</p>
                  <p className="text-slate-600">
                    Single combined Android APK supporting Salesman, Distribution Manager, and
                    Deliveryman accounts.
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">aerofiy-field-app.apk</p>
                </div>
                <a
                  href="./aerofiy-field-app.apk"
                  download="aerofiy-field-app.apk"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Combined APK
                </a>
              </div>
            </div>
          </div>

          {/* Company Logo, Address & Contact Information */}
          <form
            onSubmit={handleSaveCompanyProfile}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-slate-900">
                  Company Logo, Address &amp; Contact Information
                </h2>
                <p className="text-xs text-slate-600">
                  Configure your distributor logo, street address, phone, email, and website shown
                  on the login screen, sidebar, and all A5 printed invoices and reports.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              <div className="md:col-span-4 space-y-3">
                <label className="block text-xs font-medium text-slate-700">
                  Company Logo
                </label>
                <div className="border border-dashed border-slate-300 rounded-xl p-4 bg-slate-50 flex flex-col items-center justify-center gap-3 text-center">
                  {companyForm.logoDataUrl ? (
                    <img
                      src={companyForm.logoDataUrl}
                      alt="Company Logo Preview"
                      className="max-h-20 max-w-full object-contain rounded"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                      <ImagePlus className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="sr-only"
                      />
                    </label>
                    {companyForm.logoDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setCompanyForm((prev) => ({ ...prev, logoDataUrl: '' }))
                        }
                        className="px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    PNG, JPG, SVG up to 1 MB (or paste image URL below)
                  </p>
                </div>
                <input
                  type="text"
                  value={companyForm.logoDataUrl}
                  onChange={(e) =>
                    setCompanyForm((prev) => ({ ...prev, logoDataUrl: e.target.value }))
                  }
                  placeholder="Optional logo image URL..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">Company Name</label>
                  <input
                    required
                    type="text"
                    value={companyForm.companyName}
                    onChange={(e) =>
                      setCompanyForm((prev) => ({ ...prev, companyName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Office &amp; Warehouse Address
                  </label>
                  <input
                    required
                    type="text"
                    value={companyForm.address}
                    onChange={(e) =>
                      setCompanyForm((prev) => ({ ...prev, address: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contact Phone</label>
                  <input
                    required
                    type="text"
                    value={companyForm.phone}
                    onChange={(e) =>
                      setCompanyForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Contact Email</label>
                  <input
                    required
                    type="email"
                    value={companyForm.email}
                    onChange={(e) =>
                      setCompanyForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">
                    Website / Portal URL
                  </label>
                  <input
                    type="text"
                    value={companyForm.website ?? ''}
                    onChange={(e) =>
                      setCompanyForm((prev) => ({ ...prev, website: e.target.value }))
                    }
                    placeholder="www.aerofiydms.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Save Company Branding
              </button>
            </div>
          </form>

          {/* 3 A5 Print Templates Selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <LayoutTemplate className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-slate-900">
                  A5 Paper Print Template (Invoices, Challans &amp; All Reports)
                </h2>
                <p className="text-xs text-slate-600">
                  Select the active A5 (148mm × 210mm) layout template applied across all invoices,
                  delivery challans, RTV debit notes, and Admin reports.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(
                [
                  {
                    id: 'MODERN_EMERALD',
                    desc: 'Clean emerald gradient header band, crisp rounded cards, and aerofiy DMS accent highlights.',
                    swatch: 'bg-emerald-600',
                  },
                  {
                    id: 'CLASSIC_LEDGER',
                    desc: 'Traditional double-bordered formal accounting voucher with high-contrast monochrome table grids.',
                    swatch: 'bg-slate-900',
                  },
                  {
                    id: 'COMPACT_THERMAL_A5',
                    desc: 'High-density monospace docket optimized for fast route summaries and minimal ink usage on A5.',
                    swatch: 'bg-slate-600',
                  },
                ] as { id: PrintTemplateId; desc: string; swatch: string }[]
              ).map((tpl) => {
                const isSelected = state.printTemplate === tpl.id;
                const meta = PRINT_TEMPLATE_LABELS[tpl.id];
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      const res = setPrintTemplate(tpl.id);
                      if (res.ok) {
                        setFeedback({
                          type: 'success',
                          text: `Active A5 print template switched to ${meta.name}.`,
                        });
                      }
                    }}
                    className={`text-left p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/60 ring-2 ring-emerald-600/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`w-3 h-3 rounded-sm ${tpl.swatch}`} />
                      {isSelected ? (
                        <StatusBadge variant="emerald" label="Active A5" />
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400">Select</span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-900">{meta.name}</p>
                    <p className="text-[11px] text-slate-500">{meta.subtitle}</p>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{tpl.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Change Admin Own Password */}
          <form
            onSubmit={handleChangeOwnPassword}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-slate-900">Change Admin Password</h2>
                <p className="text-xs text-slate-600">
                  Update your Admin sign-in password anytime. To change other users&apos;
                  passwords, open the Staff &amp; Passwords tab.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  required
                  type="password"
                  value={adminPwdForm.currentPassword}
                  onChange={(e) =>
                    setAdminPwdForm((p) => ({ ...p, currentPassword: e.target.value }))
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">New Password</label>
                <input
                  required
                  type="password"
                  minLength={3}
                  value={adminPwdForm.newPassword}
                  onChange={(e) =>
                    setAdminPwdForm((p) => ({ ...p, newPassword: e.target.value }))
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  required
                  type="password"
                  minLength={3}
                  value={adminPwdForm.confirmPassword}
                  onChange={(e) =>
                    setAdminPwdForm((p) => ({ ...p, confirmPassword: e.target.value }))
                  }
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              Update Admin Password
            </button>
          </form>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2 className="text-sm font-bold text-slate-900">
                  Factory Reset (Clear All System Data)
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Erase all products, retail stores, orders, GRN logs, final invoices, cashbook
                  entries, and non-admin staff accounts, returning aerofiy DMS to a clean fresh
                  install (Admin / 1234).
                </p>
              </div>
            </div>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Factory Reset System
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-rose-700">
                  Confirm full system wipe?
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetDemoData();
                    setConfirmReset(false);
                    setFeedback({
                      type: 'success',
                      text: 'System cleared to a fresh baseline (Admin / 1234).',
                    });
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 cursor-pointer"
                >
                  Yes, Clear Everything
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              Mapping &amp; Persistence Configuration
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Maps are rendered using OpenStreetMap tiles via Leaflet with zero external API keys.
              All operational ledgers persist automatically in browser storage in BDT (৳).
            </p>
          </div>
        </div>
      )}

      {/* Staff Add/Edit Modal */}
      {userModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveUser}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingUser ? 'Edit Staff Member' : 'Add Staff Member'}
              </h3>
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              {feedback?.type === 'error' && (
                <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium">
                  {feedback.text}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    required
                    type="text"
                    value={userForm.name}
                    onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Role</label>
                  <select
                    value={userForm.role}
                    onChange={(e) =>
                      setUserForm((p) => ({ ...p, role: e.target.value as UserRole }))
                    }
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Login Username</label>
                  <input
                    required
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))}
                    placeholder="e.g. sales2"
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {editingUser ? 'Password' : 'Initial Password'}
                  </label>
                  <input
                    required
                    type="text"
                    minLength={3}
                    value={userForm.password}
                    onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Min 3 chars"
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email</label>
                  <input
                    required
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    required
                    type="text"
                    value={userForm.phone}
                    onChange={(e) => setUserForm((p) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Territory</label>
                  <input
                    type="text"
                    value={userForm.territory}
                    onChange={(e) => setUserForm((p) => ({ ...p, territory: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Vehicle No. (Optional)
                  </label>
                  <input
                    type="text"
                    value={userForm.vehicleNo}
                    onChange={(e) => setUserForm((p) => ({ ...p, vehicleNo: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={userForm.active}
                  onChange={(e) => setUserForm((p) => ({ ...p, active: e.target.checked }))}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="font-medium text-slate-700">Account Active</span>
              </label>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setUserModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Change User Password Modal */}
      {passwordTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleChangeTargetPassword}
            className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Change User Password</h3>
              <button
                type="button"
                onClick={() => setPasswordTargetUser(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-0.5">
                <p className="font-bold text-slate-900">{passwordTargetUser.name}</p>
                <p className="font-mono text-slate-600">
                  @{passwordTargetUser.username} · {ROLE_LABELS[passwordTargetUser.role]}
                </p>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">New Password</label>
                <input
                  required
                  type="text"
                  minLength={3}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Enter new password (min 3 chars)"
                  className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasswordTargetUser(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Product Add/Edit Modal */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleSaveProduct}
            className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingProduct ? 'Edit Product SKU' : 'Add New Product'}
              </h3>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">SKU Code</label>
                  <input
                    required
                    type="text"
                    value={productForm.sku}
                    onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))}
                    placeholder="BEV-NEW-12"
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Category</label>
                  <select
                    required
                    value={productForm.category}
                    onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">
                      {state.productCategories.length === 0
                        ? 'Create a category below first'
                        : 'Select category...'}
                    </option>
                    {productForm.category &&
                      !state.productCategories.includes(productForm.category) && (
                        <option value={productForm.category}>{productForm.category}</option>
                      )}
                    {state.productCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <input
                  type="text"
                  value={modalCategoryInput}
                  onChange={(e) => setModalCategoryInput(e.target.value)}
                  placeholder="Quick add new category..."
                  className="flex-1 px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="button"
                  onClick={handleQuickAddModalCategory}
                  className="px-2.5 py-1.5 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 cursor-pointer whitespace-nowrap"
                >
                  + Add Category
                </button>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Product Name</label>
                <input
                  required
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Unit Cost (BDT)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.unitCost}
                    onChange={(e) => setProductForm((p) => ({ ...p, unitCost: e.target.value }))}
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    Selling Price (BDT)
                  </label>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={productForm.sellingPrice}
                    onChange={(e) =>
                      setProductForm((p) => ({ ...p, sellingPrice: e.target.value }))
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Unit Type</label>
                  <input
                    required
                    type="text"
                    value={productForm.unit}
                    onChange={(e) => setProductForm((p) => ({ ...p, unit: e.target.value }))}
                    placeholder="Case / Carton"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Sellable Stock</label>
                  <input
                    required
                    type="number"
                    min="0"
                    value={productForm.sellableStock}
                    onChange={(e) =>
                      setProductForm((p) => ({ ...p, sellableStock: e.target.value }))
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 cursor-pointer"
              >
                {editingProduct ? 'Save Product' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {deleteTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Delete Staff User</h3>
              <button
                type="button"
                onClick={() => setDeleteTargetUser(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs text-slate-600">
              <p>
                Are you sure you want to permanently delete{' '}
                <strong className="text-slate-900">{deleteTargetUser.name}</strong> (
                <span className="font-mono">@{deleteTargetUser.username}</span> ·{' '}
                {ROLE_LABELS[deleteTargetUser.role]})?
              </p>
              <p className="text-[11px] text-slate-500">
                Historical orders and invoices will keep their recorded name, and this user will no
                longer be able to sign in.
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetUser(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {deleteTargetProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Delete Product from Catalog</h3>
              <button
                type="button"
                onClick={() => setDeleteTargetProduct(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-xs text-slate-600">
              <p>
                Are you sure you want to permanently remove{' '}
                <strong className="text-slate-900">{deleteTargetProduct.name}</strong> (
                <span className="font-mono">{deleteTargetProduct.sku}</span>) from the product
                catalog?
              </p>
              <p className="text-[11px] text-slate-500">
                Current stock: {deleteTargetProduct.sellableStock} sellable ·{' '}
                {deleteTargetProduct.inTransitStock} in transit · {deleteTargetProduct.damagedStock}{' '}
                damaged.
              </p>
            </div>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTargetProduct(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkCsvModalOpen && (
        <BulkProductCsvModal
          existingProducts={state.products}
          existingCategories={state.productCategories}
          onClose={() => setBulkCsvModalOpen(false)}
          onImport={handleBulkImportProducts}
        />
      )}

      <PrintableDocumentModal
        payload={printableRTV ? { kind: 'RTV', rtv: printableRTV } : null}
        onClose={() => setPrintableRTV(null)}
      />
    </DashboardLayout>
  );
};
