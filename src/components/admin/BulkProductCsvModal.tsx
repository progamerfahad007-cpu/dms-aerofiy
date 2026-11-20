import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from 'lucide-react';
import { Product } from '../../types/dms';
import {
  CsvParseSummary,
  downloadProductCsvTemplate,
  parseProductCsv,
} from '../../utils/productCsv';
import { formatCurrency } from '../common/StatusBadge';

interface BulkProductCsvModalProps {
  existingProducts: Product[];
  existingCategories: string[];
  onClose: () => void;
  onImport: (
    rows: Omit<Product, 'id' | 'inTransitStock' | 'damagedStock'>[],
    duplicateMode: 'UPDATE' | 'SKIP'
  ) => {
    ok: boolean;
    error?: string;
    data?: { added: number; updated: number; skipped: number; categoriesAdded: number };
  };
}

export const BulkProductCsvModal: React.FC<BulkProductCsvModalProps> = ({
  existingProducts,
  existingCategories,
  onClose,
  onImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [rawCsv, setRawCsv] = useState<string>('');
  const [duplicateMode, setDuplicateMode] = useState<'UPDATE' | 'SKIP'>('UPDATE');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const summary: CsvParseSummary | null = useMemo(() => {
    if (!rawCsv) return null;
    return parseProductCsv(rawCsv, existingProducts, existingCategories);
  }, [rawCsv, existingProducts, existingCategories]);

  const counts = useMemo(() => {
    if (!summary) return { toAdd: 0, toUpdate: 0, toSkip: 0, actionable: 0 };
    const toAdd = summary.validRows.filter((r) => !r.isDuplicateInCatalog).length;
    const duplicates = summary.validRows.filter((r) => r.isDuplicateInCatalog).length;
    const toUpdate = duplicateMode === 'UPDATE' ? duplicates : 0;
    const toSkip = duplicateMode === 'SKIP' ? duplicates : 0;
    return {
      toAdd,
      toUpdate,
      toSkip,
      actionable: toAdd + toUpdate,
    };
  }, [summary, duplicateMode]);

  const loadFile = (file: File) => {
    setSubmitError(null);
    if (!file.name.toLowerCase().endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('text')) {
      setSubmitError('Please select a valid .csv file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setFileName(file.name);
      setRawCsv(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      setSubmitError('Could not read the selected CSV file.');
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const handleConfirmImport = () => {
    if (!summary || summary.fatalError || counts.actionable === 0) return;
    setSubmitError(null);
    const payload = summary.validRows.map((r) => ({
      sku: r.sku,
      name: r.name,
      category: r.category,
      unit: r.unit,
      unitCost: r.unitCost,
      sellingPrice: r.sellingPrice,
      sellableStock: r.sellableStock,
    }));
    const res = onImport(payload, duplicateMode);
    if (!res.ok) {
      setSubmitError(res.error ?? 'Bulk import failed.');
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Bulk Upload Products &amp; Pricing (.csv)
              </h3>
              <p className="text-xs text-slate-500">
                Import new SKUs or update prices in bulk — syncs live across all portals
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close bulk CSV upload"
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
          {/* Template & Format Info Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-800">CSV Columns Supported</p>
              <p className="text-slate-600 font-mono text-[11px]">
                sku, name, category, unit, unitCost, sellingPrice, sellableStock
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadProductCsvTemplate(existingCategories[0] || 'Beverages')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Download CSV Template
            </button>
          </div>

          {/* File Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragActive
                ? 'border-emerald-500 bg-emerald-50/70'
                : 'border-slate-300 bg-slate-50/50 hover:border-emerald-400 hover:bg-emerald-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
            <p className="font-semibold text-slate-900">
              {fileName ? `Selected file: ${fileName}` : 'Click to choose a .csv file or drag & drop here'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Export directly from Excel or Google Sheets as CSV (UTF-8). Required columns: SKU,
              Name, Unit Cost, Selling Price.
            </p>
          </div>

          {submitError && (
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {summary?.fatalError && (
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{summary.fatalError}</span>
            </div>
          )}

          {/* Duplicate SKU Mode & Preview */}
          {summary && !summary.fatalError && (
            <div className="space-y-4">
              {/* Duplicate SKU Selector */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-800">If an uploaded SKU already exists:</p>
                  <p className="text-[11px] text-slate-500">
                    Updating preserves active In-Transit and Damaged stock quantities safely.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDuplicateMode('UPDATE')}
                    className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer transition-colors ${
                      duplicateMode === 'UPDATE'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Update Existing SKUs
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateMode('SKIP')}
                    className={`px-3 py-1.5 rounded-lg font-semibold border cursor-pointer transition-colors ${
                      duplicateMode === 'SKIP'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Skip Duplicates
                  </button>
                </div>
              </div>

              {/* Validation KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-[11px] font-medium text-emerald-800">New Products</p>
                  <p className="font-mono text-lg font-bold text-emerald-900 mt-0.5">
                    {counts.toAdd}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <p className="text-[11px] font-medium text-blue-800">
                    {duplicateMode === 'UPDATE' ? 'SKUs to Update' : 'Duplicates Skipped'}
                  </p>
                  <p className="font-mono text-lg font-bold text-blue-900 mt-0.5">
                    {duplicateMode === 'UPDATE' ? counts.toUpdate : counts.toSkip}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                  <p className="text-[11px] font-medium text-rose-800">Invalid Rows</p>
                  <p className="font-mono text-lg font-bold text-rose-900 mt-0.5">
                    {summary.invalidRows.length}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[11px] font-medium text-slate-600">New Categories</p>
                  <p className="font-mono text-lg font-bold text-slate-900 mt-0.5">
                    {summary.newCategories.length}
                  </p>
                </div>
              </div>

              {summary.newCategories.length > 0 && (
                <div className="px-3.5 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <strong>Auto-creating categories:</strong>{' '}
                  {summary.newCategories.join(', ')}
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Row</th>
                        <th className="py-2 px-3 font-semibold">Status</th>
                        <th className="py-2 px-3 font-semibold">SKU</th>
                        <th className="py-2 px-3 font-semibold">Product Name</th>
                        <th className="py-2 px-3 font-semibold">Category</th>
                        <th className="py-2 px-3 font-semibold">Unit</th>
                        <th className="py-2 px-3 font-semibold text-right">Unit Cost</th>
                        <th className="py-2 px-3 font-semibold text-right">Selling Price</th>
                        <th className="py-2 px-3 font-semibold text-right">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {summary.rows.slice(0, 150).map((row) => {
                        const statusLabel = row.error
                          ? 'Error'
                          : row.isDuplicateInCatalog
                            ? duplicateMode === 'UPDATE'
                              ? 'Update'
                              : 'Skip'
                            : 'New';
                        const statusClass = row.error
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : row.isDuplicateInCatalog
                            ? duplicateMode === 'UPDATE'
                              ? 'text-blue-700 bg-blue-50 border-blue-200'
                              : 'text-slate-600 bg-slate-100 border-slate-200'
                            : 'text-emerald-700 bg-emerald-50 border-emerald-200';

                        return (
                          <tr
                            key={`${row.rowNumber}-${row.sku}`}
                            className={row.error ? 'bg-rose-50/40' : 'hover:bg-slate-50'}
                          >
                            <td className="py-2 px-3 font-mono text-slate-500">{row.rowNumber}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 text-[11px] font-semibold rounded border ${statusClass}`}
                              >
                                {statusLabel}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono font-medium text-slate-800">
                              {row.sku || '—'}
                            </td>
                            <td className="py-2 px-3">
                              <p className="font-medium text-slate-900">{row.name || '—'}</p>
                              {row.error && (
                                <p className="text-[11px] text-rose-700 mt-0.5">{row.error}</p>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{row.category || '—'}</td>
                            <td className="py-2 px-3 text-slate-600">{row.unit}</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              {formatCurrency(row.unitCost)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                              {formatCurrency(row.sellingPrice)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700">
                              {row.sellableStock}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {summary.rows.length > 150 && (
                  <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                    Showing first 150 of {summary.rows.length} rows — all valid rows will be
                    imported.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500">
            {summary && !summary.fatalError ? (
              <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Ready to process {counts.actionable} product{counts.actionable === 1 ? '' : 's'}
                {summary.invalidRows.length > 0
                  ? ` (${summary.invalidRows.length} invalid skipped)`
                  : ''}
              </span>
            ) : (
              <span>Upload a CSV file to preview products before importing.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!summary || !!summary.fatalError || counts.actionable === 0}
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Import {counts.actionable > 0 ? `${counts.actionable} ` : ''}Products
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
