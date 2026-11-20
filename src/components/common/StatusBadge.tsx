import React from 'react';
import { OrderStatus } from '../../types/dms';

export type BadgeVariant = 'amber' | 'blue' | 'emerald' | 'rose' | 'slate';

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  blue: 'bg-blue-50 text-blue-800 border-blue-200',
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rose: 'bg-rose-50 text-rose-800 border-rose-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const StatusBadge: React.FC<{
  variant: BadgeVariant;
  label: string;
  className?: string;
}> = ({ variant, label, className = '' }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded whitespace-nowrap shrink-0 ${VARIANT_CLASSES[variant]} ${className}`}
  >
    {label}
  </span>
);

export const OrderStatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  switch (status) {
    case 'PENDING_DISPATCH':
      return <StatusBadge variant="amber" label="Pending Dispatch" />;
    case 'IN_TRANSIT':
      return <StatusBadge variant="blue" label="In Transit" />;
    case 'DELIVERED':
      return <StatusBadge variant="emerald" label="Delivered" />;
    case 'PARTIAL_DELIVERY':
      return <StatusBadge variant="amber" label="Partial Delivery" />;
  }
};

export const formatCurrency = (val: number): string =>
  `৳${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val)}`;

export const formatDateTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
