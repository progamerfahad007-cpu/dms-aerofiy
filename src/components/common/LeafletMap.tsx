import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { ExternalLink } from 'lucide-react';
import { formatCurrency } from './StatusBadge';

export type PinState = 'ACTIVE' | 'PENDING_DELIVERY' | 'HAS_DUE' | 'SELECTED';

export interface MapStorePin {
  id: string;
  name: string;
  ownerName: string;
  address: string;
  lat: number;
  lng: number;
  creditBalance: number;
  state: PinState;
  stopNumber?: number;
  orderNumber?: string;
}

const PIN_COLORS: Record<PinState, { fill: string; stroke: string; label: string }> = {
  ACTIVE: { fill: '#10b981', stroke: '#065f46', label: 'Active' },
  PENDING_DELIVERY: { fill: '#2563eb', stroke: '#1e3a8a', label: 'Pending Delivery' },
  HAS_DUE: { fill: '#e11d48', stroke: '#881337', label: 'Has Due' },
  SELECTED: { fill: '#0f172a', stroke: '#2563eb', label: 'Selected Pin' },
};

const createPinIcon = (state: PinState, stopNumber?: number): L.DivIcon => {
  const palette = PIN_COLORS[state];
  if (stopNumber !== undefined) {
    return L.divIcon({
      className: 'custom-dms-marker',
      iconSize: [30, 36],
      iconAnchor: [15, 34],
      popupAnchor: [0, -32],
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:28px;height:28px;border-radius:9999px;background:${palette.fill};border:2px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.35);color:#ffffff;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;">
            ${stopNumber}
          </div>
          <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:7px solid ${palette.fill};margin-top:-1px;"></div>
        </div>
      `,
    });
  }

  return L.divIcon({
    className: 'custom-dms-marker',
    iconSize: [24, 32],
    iconAnchor: [12, 30],
    popupAnchor: [0, -28],
    html: `
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 1C5.92487 1 1 5.92487 1 12C1 19.75 12 31 12 31C12 31 23 19.75 23 12C23 5.92487 18.0751 1 12 1Z" fill="${palette.fill}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="12" cy="12" r="4" fill="#ffffff"/>
      </svg>
    `,
  });
};

const FitBoundsHandler: React.FC<{ points: [number, number][] }> = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: false });
      return;
    }
    const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14, animate: false });
  }, [map, points]);

  return null;
};

const ClickToPinHandler: React.FC<{
  onPick: (lat: number, lng: number) => void;
}> = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
};

interface LeafletMapProps {
  pins?: MapStorePin[];
  heightClass?: string;
  interactivePin?: { lat: number; lng: number } | null;
  onPinChange?: (lat: number, lng: number) => void;
  defaultCenter?: [number, number];
  defaultZoom?: number;
}

export const LeafletMap: React.FC<LeafletMapProps> = ({
  pins = [],
  heightClass = 'h-[400px]',
  interactivePin = null,
  onPinChange,
  defaultCenter = [23.7925, 90.4078],
  defaultZoom = 12,
}) => {
  const markerRef = useRef<L.Marker | null>(null);

  const fitPoints = useMemo<[number, number][]>(() => {
    if (interactivePin) {
      return [[interactivePin.lat, interactivePin.lng]];
    }
    return pins.map((p) => [p.lat, p.lng]);
  }, [interactivePin, pins]);

  return (
    <div className={`w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 ${heightClass}`}>
      <MapContainer
        center={
          interactivePin
            ? [interactivePin.lat, interactivePin.lng]
            : pins.length > 0
            ? [pins[0].lat, pins[0].lng]
            : defaultCenter
        }
        zoom={defaultZoom}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {fitPoints.length > 0 && !onPinChange && <FitBoundsHandler points={fitPoints} />}

        {onPinChange && <ClickToPinHandler onPick={onPinChange} />}

        {interactivePin && onPinChange && (
          <Marker
            position={[interactivePin.lat, interactivePin.lng]}
            icon={createPinIcon('SELECTED')}
            draggable={true}
            ref={markerRef}
            eventHandlers={{
              dragend: () => {
                const marker = markerRef.current;
                if (marker) {
                  const pos = marker.getLatLng();
                  onPinChange(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
                }
              },
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <p className="font-semibold text-slate-900">Selected Store Location</p>
                <p className="font-mono text-slate-600">
                  {interactivePin.lat.toFixed(5)}, {interactivePin.lng.toFixed(5)}
                </p>
                <p className="text-slate-500">Drag pin or click map to adjust</p>
              </div>
            </Popup>
          </Marker>
        )}

        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={createPinIcon(pin.state, pin.stopNumber)}
          >
            <Popup>
              <div className="min-w-[210px] space-y-1.5 text-xs text-slate-700">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900 text-sm leading-tight">
                    {pin.stopNumber ? `#${pin.stopNumber} · ` : ''}
                    {pin.name}
                  </p>
                </div>
                {pin.orderNumber && (
                  <p className="font-mono text-[11px] text-blue-700 font-medium">
                    Order: {pin.orderNumber}
                  </p>
                )}
                <p className="text-slate-600">Owner: {pin.ownerName}</p>
                <p className="text-slate-500 leading-snug">{pin.address}</p>
                <p className="font-mono text-[11px] text-slate-500">
                  GPS: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </p>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                  <span className="font-medium text-slate-700">
                    Due:{' '}
                    <span
                      className={`font-mono ${
                        pin.creditBalance > 0 ? 'text-rose-700 font-semibold' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(pin.creditBalance)}
                    </span>
                  </span>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Directions
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
