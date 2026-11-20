import React, { useMemo, useState } from 'react';
import {
  ClipboardList,
  Crosshair,
  ExternalLink,
  History,
  MapPin,
  Pencil,
  Plus,
  Printer,
  Store,
  X,
} from 'lucide-react';
import { useDMS } from '../../context/DMSContext';
import { Order, OrderStatus, RetailStore } from '../../types/dms';
import { LeafletMap } from '../common/LeafletMap';
import { FieldAndroidAppBanner } from '../common/FieldAndroidAppBanner';
import { PrintableDocumentModal } from '../common/PrintableDocumentModal';
import {
  formatCurrency,
  formatDateTime,
  OrderStatusBadge,
  StatusBadge,
} from '../common/StatusBadge';
import { DashboardLayout, NavItem } from '../layout/DashboardLayout';

type SalesTab = 'create-order' | 'stores' | 'history';

export const SalesPortal: React.FC = () => {
  const { state, currentUser, getWorkDayStatus, addStore, updateStore, createOrder } = useDMS();
  const dayLocked = getWorkDayStatus(currentUser).isLocked;
  const [activeTab, setActiveTab] = useState<SalesTab>('create-order');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [printableOrder, setPrintableOrder] = useState<Order | null>(null);

  // Order creation state
  const [selectedStoreId, setSelectedStoreId] = useState<string>(state.stores[0]?.id ?? '');
  const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({});
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Store directory & geo-tagging form state
  const [showStoreForm, setShowStoreForm] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [storeForm, setStoreForm] = useState({
    name: '',
    ownerName: '',
    phone: '',
    address: '',
    zone: '',
  });
  const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lng: number }>({
    lat: 23.7925,
    lng: 90.4078,
  });
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  // Order history filter state
  const [statusFilter, setStatusFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedStore = useMemo(
    () => state.stores.find((s) => s.id === selectedStoreId),
    [state.stores, selectedStoreId]
  );

  const orderTotal = useMemo(() => {
    return state.products.reduce((sum, p) => {
      const qty = orderQuantities[p.id] ?? 0;
      return sum + qty * p.sellingPrice;
    }, 0);
  }, [state.products, orderQuantities]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.status !== statusFilter) return false;
      if (
        q &&
        !o.orderNumber.toLowerCase().includes(q) &&
        !o.storeName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [state.orders, statusFilter, searchQuery]);

  const navItems: NavItem[] = [
    { id: 'create-order', label: 'Create Order', icon: ClipboardList },
    { id: 'stores', label: 'Store Directory & GPS', icon: Store, badge: state.stores.length },
    { id: 'history', label: 'Order History', icon: History, badge: state.orders.length },
  ];

  const handleCaptureBrowserGPS = () => {
    if (!navigator.geolocation) {
      setGpsStatus('Geolocation is not supported by this browser. Adjust the pin manually.');
      return;
    }
    setGpsStatus('Acquiring GPS fix...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setPinnedCoords({ lat, lng });
        setGpsStatus(`GPS captured (${lat.toFixed(5)}, ${lng.toFixed(5)}).`);
      },
      () => {
        setGpsStatus(
          'Location permission unavailable. Click or drag the map marker to set coordinates.'
        );
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  const openNewStoreForm = () => {
    setEditingStoreId(null);
    setStoreForm({ name: '', ownerName: '', phone: '', address: '', zone: '' });
    setPinnedCoords({ lat: 23.7925, lng: 90.4078 });
    setGpsStatus(null);
    setShowStoreForm(true);
  };

  const openEditStoreForm = (store: RetailStore) => {
    setEditingStoreId(store.id);
    setStoreForm({
      name: store.name,
      ownerName: store.ownerName,
      phone: store.phone,
      address: store.address,
      zone: store.zone,
    });
    setPinnedCoords({
      lat: store.lat ?? 23.7925,
      lng: store.lng ?? 90.4078,
    });
    setGpsStatus(null);
    setActiveTab('stores');
    setShowStoreForm(true);
  };

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeForm.name.trim() || !storeForm.ownerName.trim()) return;
    const payload = {
      name: storeForm.name.trim(),
      ownerName: storeForm.ownerName.trim(),
      phone: storeForm.phone.trim() || '+880 17XX-XXXXXX',
      address: storeForm.address.trim() || 'Dhaka Metro Area',
      zone: storeForm.zone.trim(),
      lat: pinnedCoords.lat,
      lng: pinnedCoords.lng,
    };

    if (editingStoreId) {
      const res = updateStore(editingStoreId, payload);
      if (res.ok && res.data) {
        setFeedback({
          type: 'success',
          text: `Updated store details for "${res.data.name}" (${pinnedCoords.lat.toFixed(5)}, ${pinnedCoords.lng.toFixed(5)}).`,
        });
        setEditingStoreId(null);
        setStoreForm({ name: '', ownerName: '', phone: '', address: '', zone: '' });
        setShowStoreForm(false);
      } else {
        setFeedback({ type: 'error', text: res.error ?? 'Could not update store.' });
      }
      return;
    }

    const res = addStore(payload);
    if (res.ok && res.data) {
      setSelectedStoreId(res.data.id);
      setFeedback({
        type: 'success',
        text: `Registered store "${res.data.name}" with GPS (${pinnedCoords.lat.toFixed(5)}, ${pinnedCoords.lng.toFixed(5)}).`,
      });
      setStoreForm({ name: '', ownerName: '', phone: '', address: '', zone: '' });
      setShowStoreForm(false);
    } else {
      setFeedback({ type: 'error', text: res.error ?? 'Could not register store.' });
    }
  };

  const captureSilentGPS = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 4000 }
      );
    });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(orderQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({ productId, qty }));

    if (items.length === 0) {
      setFeedback({ type: 'error', text: 'Enter quantity for at least one product.' });
      return;
    }

    setSubmittingOrder(true);
    let capturedCoords: { lat: number; lng: number } | null = null;
    const storeNeedsGps =
      selectedStore && (selectedStore.lat === null || selectedStore.lng === null);

    if (storeNeedsGps) {
      capturedCoords = await captureSilentGPS();
    }

    const res = createOrder(selectedStoreId, items, capturedCoords);
    setSubmittingOrder(false);

    if (!res.ok || !res.data) {
      setFeedback({ type: 'error', text: res.error ?? 'Could not submit order.' });
      return;
    }

    setOrderQuantities({});
    const gpsNote =
      storeNeedsGps && capturedCoords
        ? ` Auto-captured GPS (${capturedCoords.lat.toFixed(5)}, ${capturedCoords.lng.toFixed(5)}) for ${selectedStore?.name}.`
        : '';
    setFeedback({
      type: 'success',
      text: `Order ${res.data.orderNumber} submitted for Warehouse Dispatch (${formatCurrency(res.data.totalOrderedAmount)}).${gpsNote}`,
    });
  };

  return (
    <DashboardLayout
      navItems={navItems}
      activeTab={activeTab}
      onTabChange={(id) => {
        setActiveTab(id as SalesTab);
        setFeedback(null);
      }}
      pageTitle="Sales Representative Portal"
      pageSubtitle={`Territory: ${currentUser?.territory || 'Field Sales'} · Live stock ordering & store geo-tagging`}
    >
      <FieldAndroidAppBanner roleLabel="Salesman" />

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

      {activeTab === 'create-order' && (
        <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Select Products & Quantities</h2>
                <p className="text-xs text-slate-500">
                  Real-time warehouse sellable stock is displayed per SKU
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">SKU & Product</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Unit Price</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Sellable Stock</th>
                    <th className="py-2.5 px-4 font-semibold text-right w-32">Order Qty</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.products.map((p) => {
                    const qty = orderQuantities[p.id] ?? 0;
                    const lineTotal = qty * p.sellingPrice;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{p.name}</p>
                          <p className="font-mono text-[11px] text-slate-500">
                            {p.sku} · {p.unit}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono text-right text-slate-700">
                          {formatCurrency(p.sellingPrice)}
                        </td>
                        <td className="py-3 px-4 font-mono text-right">
                          <span
                            className={`font-semibold ${
                              p.sellableStock > 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {p.sellableStock}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min="0"
                            max={p.sellableStock}
                            disabled={dayLocked}
                            value={qty === 0 ? '' : qty}
                            onChange={(e) => {
                              const next = Math.max(
                                0,
                                Math.min(p.sellableStock, Number(e.target.value) || 0)
                              );
                              setOrderQuantities((prev) => ({ ...prev, [p.id]: next }));
                            }}
                            placeholder="0"
                            className="w-24 px-2.5 py-1.5 text-right font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono text-right font-semibold text-slate-900">
                          {formatCurrency(lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Order Summary</h2>
              <p className="text-xs text-slate-500">Assign retail outlet and submit to dispatch</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <label className="block font-medium text-slate-700">Retail Store</label>
                <button
                  type="button"
                  disabled={dayLocked}
                  onClick={() => {
                    setActiveTab('stores');
                    openNewStoreForm();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Add New Store
                </button>
              </div>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {state.stores.length === 0 && (
                  <option value="">No stores added yet — click Add New Store</option>
                )}
                {state.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.zone})
                  </option>
                ))}
              </select>

              {selectedStore && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{selectedStore.ownerName}</p>
                    <button
                      type="button"
                      disabled={dayLocked}
                      onClick={() => openEditStoreForm(selectedStore)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-40 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit Store
                    </button>
                  </div>
                  <p className="text-slate-600">{selectedStore.address}</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-slate-500">Credit Balance</span>
                    <span
                      className={`font-mono font-semibold ${
                        selectedStore.creditBalance > 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(selectedStore.creditBalance)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">GPS Tag</span>
                    {selectedStore.lat !== null && selectedStore.lng !== null ? (
                      <span className="font-mono text-[11px] text-emerald-700">
                        {selectedStore.lat.toFixed(4)}, {selectedStore.lng.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-amber-700">
                        Will auto-capture on submit
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-600">Total Order Value</span>
              <span className="text-lg font-bold font-mono text-slate-900">
                {formatCurrency(orderTotal)}
              </span>
            </div>

            <button
              type="submit"
              disabled={dayLocked || submittingOrder || orderTotal <= 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {dayLocked
                ? 'Day Finished & Locked'
                : submittingOrder
                ? 'Capturing GPS & Submitting...'
                : 'Submit Order (Pending Dispatch)'}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'stores' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Retail Store Directory</h2>
              <p className="text-xs text-slate-500">
                Register or edit retail stores with browser GPS or interactive OpenStreetMap pin
                placement
              </p>
            </div>
            <button
              type="button"
              disabled={dayLocked}
              onClick={() => {
                if (showStoreForm) {
                  setShowStoreForm(false);
                  setEditingStoreId(null);
                } else {
                  openNewStoreForm();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {showStoreForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {showStoreForm ? 'Close Form' : 'Register New Store'}
            </button>
          </div>

          {showStoreForm && (
            <form
              onSubmit={handleSaveStore}
              className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              <div className="lg:col-span-5 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingStoreId ? 'Edit Store Details & GPS' : 'Store Profile & Coordinates'}
                  </h3>
                  {editingStoreId && <StatusBadge variant="blue" label="Editing" />}
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Store Name</label>
                  <input
                    required
                    type="text"
                    value={storeForm.name}
                    onChange={(e) => setStoreForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Enter retail store name"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Owner Name</label>
                    <input
                      required
                      type="text"
                      value={storeForm.ownerName}
                      onChange={(e) => setStoreForm((p) => ({ ...p, ownerName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      required
                      type="text"
                      value={storeForm.phone}
                      onChange={(e) => setStoreForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+880 17XX-XXXXXX"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Zone</label>
                    <input
                      required
                      type="text"
                      value={storeForm.zone}
                      onChange={(e) => setStoreForm((p) => ({ ...p, zone: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700 mb-1">Street Address</label>
                    <input
                      required
                      type="text"
                      value={storeForm.address}
                      onChange={(e) => setStoreForm((p) => ({ ...p, address: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">GPS Coordinates</span>
                    <button
                      type="button"
                      onClick={handleCaptureBrowserGPS}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 cursor-pointer"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      Capture Current GPS Location
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Latitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={pinnedCoords.lat}
                        onChange={(e) =>
                          setPinnedCoords((p) => ({ ...p, lat: Number(e.target.value) || 0 }))
                        }
                        className="w-full px-2.5 py-1.5 font-mono border border-slate-200 rounded-md"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Longitude</label>
                      <input
                        type="number"
                        step="0.000001"
                        value={pinnedCoords.lng}
                        onChange={(e) =>
                          setPinnedCoords((p) => ({ ...p, lng: Number(e.target.value) || 0 }))
                        }
                        className="w-full px-2.5 py-1.5 font-mono border border-slate-200 rounded-md"
                      />
                    </div>
                  </div>
                  {gpsStatus && <p className="text-[11px] text-slate-600">{gpsStatus}</p>}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={dayLocked}
                    className="flex-1 px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {editingStoreId ? 'Update Store Details' : 'Save Geo-Tagged Store'}
                  </button>
                  {editingStoreId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStoreId(null);
                        setShowStoreForm(false);
                      }}
                      className="px-3.5 py-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <div className="lg:col-span-7 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    Interactive Click-to-Pin Map
                  </span>
                  <span className="text-slate-500">Click anywhere or drag marker to fine-tune</span>
                </div>
                <LeafletMap
                  interactivePin={pinnedCoords}
                  onPinChange={(lat, lng) => setPinnedCoords({ lat, lng })}
                  heightClass="h-[340px]"
                />
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Store Name</th>
                    <th className="py-2.5 px-4 font-semibold">Owner & Phone</th>
                    <th className="py-2.5 px-4 font-semibold">Zone & Address</th>
                    <th className="py-2.5 px-4 font-semibold">GPS Coordinates</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Due Balance</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {state.stores.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 px-4 text-center text-slate-500">
                        No retail stores registered yet. Click <strong>Register New Store</strong> to
                        add your first outlet.
                      </td>
                    </tr>
                  ) : (
                    state.stores.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-semibold text-slate-900">{s.name}</td>
                        <td className="py-3 px-4">
                          <p className="text-slate-800">{s.ownerName}</p>
                          <p className="font-mono text-[11px] text-slate-500">{s.phone}</p>
                        </td>
                        <td className="py-3 px-4">
                          <p className="text-slate-800">{s.zone}</p>
                          <p className="text-[11px] text-slate-500">{s.address}</p>
                        </td>
                        <td className="py-3 px-4">
                          {s.lat !== null && s.lng !== null ? (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-700 hover:underline"
                            >
                              {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <StatusBadge variant="amber" label="Awaiting GPS" />
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-right font-semibold">
                          <span className={s.creditBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                            {formatCurrency(s.creditBalance)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={dayLocked}
                            onClick={() => openEditStoreForm(s)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'All Orders' },
                  { id: 'PENDING_DISPATCH', label: 'Pending' },
                  { id: 'IN_TRANSIT', label: 'In Transit' },
                  { id: 'DELIVERED', label: 'Delivered' },
                  { id: 'PARTIAL_DELIVERY', label: 'Partial' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search order # or store..."
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 w-full sm:w-64"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Order #</th>
                  <th className="py-2.5 px-4 font-semibold">Store</th>
                  <th className="py-2.5 px-4 font-semibold">Created</th>
                  <th className="py-2.5 px-4 font-semibold">Deliveryman</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Ordered</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Net Payable</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No matching orders found.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                        {ord.orderNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">{ord.storeName}</td>
                      <td className="py-3 px-4 text-slate-500">{formatDateTime(ord.createdAt)}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {ord.deliverymanName || 'Unassigned'}
                      </td>
                      <td className="py-3 px-4 font-mono text-right text-slate-600">
                        {formatCurrency(ord.totalOrderedAmount)}
                      </td>
                      <td className="py-3 px-4 font-mono text-right font-semibold text-slate-900">
                        {formatCurrency(ord.netPayableAmount)}
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
                          View
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
