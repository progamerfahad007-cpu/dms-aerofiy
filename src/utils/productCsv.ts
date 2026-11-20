import { Product } from '../types/dms';

export interface ParsedCsvProductRow {
  rowNumber: number;
  sku: string;
  name: string;
  category: string;
  unit: string;
  unitCost: number;
  sellingPrice: number;
  sellableStock: number;
  isDuplicateInCatalog: boolean;
  error?: string;
}

export interface CsvParseSummary {
  rows: ParsedCsvProductRow[];
  validRows: ParsedCsvProductRow[];
  invalidRows: ParsedCsvProductRow[];
  newCategories: string[];
  fatalError?: string;
}

/** RFC-4180 compliant CSV parser handling BOM, quoted commas, escaped quotes, and CRLF. */
export function parseCsvMatrix(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseMoneyOrNumber(val: string | undefined, fallback?: number): number {
  if (val === undefined || val.trim() === '') {
    return fallback !== undefined ? fallback : Number.NaN;
  }
  const cleaned = val.trim().replace(/[৳$€£,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : Number.NaN;
}

const HEADER_ALIASES: Record<
  'sku' | 'name' | 'category' | 'unit' | 'unitCost' | 'sellingPrice' | 'sellableStock',
  string[]
> = {
  sku: ['sku', 'skucode', 'productcode', 'code', 'itemcode'],
  name: ['name', 'productname', 'title', 'itemname', 'product', 'description'],
  category: ['category', 'productcategory', 'cat', 'group', 'department'],
  unit: ['unit', 'uom', 'pack', 'packsize', 'unittype'],
  unitCost: [
    'unitcost',
    'cost',
    'costprice',
    'purchaseprice',
    'buyprice',
    'unitcostbdt',
    'costbdt',
  ],
  sellingPrice: [
    'sellingprice',
    'price',
    'saleprice',
    'mrp',
    'tradeprice',
    'sellingpricebdt',
    'pricebdt',
    'unitprice',
  ],
  sellableStock: [
    'sellablestock',
    'stock',
    'openingstock',
    'qty',
    'quantity',
    'initialstock',
    'sellable',
    'available',
  ],
};

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headers.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

export function parseProductCsv(
  rawText: string,
  existingProducts: Product[],
  existingCategories: string[]
): CsvParseSummary {
  const matrix = parseCsvMatrix(rawText);
  if (matrix.length === 0) {
    return {
      rows: [],
      validRows: [],
      invalidRows: [],
      newCategories: [],
      fatalError: 'The uploaded CSV file is empty.',
    };
  }

  const normalizedHeaders = matrix[0].map(normalizeHeader);
  const idxSku = findColumnIndex(normalizedHeaders, HEADER_ALIASES.sku);
  const idxName = findColumnIndex(normalizedHeaders, HEADER_ALIASES.name);
  const idxCategory = findColumnIndex(normalizedHeaders, HEADER_ALIASES.category);
  const idxUnit = findColumnIndex(normalizedHeaders, HEADER_ALIASES.unit);
  const idxCost = findColumnIndex(normalizedHeaders, HEADER_ALIASES.unitCost);
  const idxPrice = findColumnIndex(normalizedHeaders, HEADER_ALIASES.sellingPrice);
  const idxStock = findColumnIndex(normalizedHeaders, HEADER_ALIASES.sellableStock);

  if (idxSku === -1 || idxName === -1 || idxCost === -1 || idxPrice === -1) {
    return {
      rows: [],
      validRows: [],
      invalidRows: [],
      newCategories: [],
      fatalError:
        'Missing required CSV columns. Include headers: sku, name, unitCost, sellingPrice (optional: category, unit, sellableStock).',
    };
  }

  if (matrix.length === 1) {
    return {
      rows: [],
      validRows: [],
      invalidRows: [],
      newCategories: [],
      fatalError: 'The CSV file has headers but no product rows.',
    };
  }

  const existingSkuSet = new Set(existingProducts.map((p) => p.sku.trim().toUpperCase()));
  const existingCatLower = new Set(existingCategories.map((c) => c.trim().toLowerCase()));
  const seenSkuInFile = new Set<string>();
  const discoveredCategories = new Map<string, string>();

  const rows: ParsedCsvProductRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i];
    const rowNumber = i + 1;

    const rawSku = (cols[idxSku] ?? '').trim().toUpperCase();
    const rawName = (cols[idxName] ?? '').trim();
    const rawCategory = idxCategory !== -1 ? (cols[idxCategory] ?? '').trim() : '';
    const rawUnit = idxUnit !== -1 ? (cols[idxUnit] ?? '').trim() : '';
    const unitCost = parseMoneyOrNumber(cols[idxCost]);
    const sellingPrice = parseMoneyOrNumber(cols[idxPrice]);
    const sellableStock =
      idxStock !== -1 ? parseMoneyOrNumber(cols[idxStock], 0) : 0;

    const errors: string[] = [];
    if (!rawSku) errors.push('Missing SKU');
    if (rawSku.length > 64) errors.push('SKU exceeds 64 characters');
    if (!rawName) errors.push('Missing product name');
    if (Number.isNaN(unitCost) || unitCost < 0) errors.push('Invalid Unit Cost');
    if (Number.isNaN(sellingPrice) || sellingPrice < 0) errors.push('Invalid Selling Price');
    if (Number.isNaN(sellableStock) || sellableStock < 0) errors.push('Invalid Sellable Stock');
    if (rawSku && seenSkuInFile.has(rawSku)) {
      errors.push(`Duplicate SKU "${rawSku}" inside CSV file`);
    }

    if (rawSku) seenSkuInFile.add(rawSku);

    const cleanCategory = rawCategory.slice(0, 80);
    if (
      errors.length === 0 &&
      cleanCategory &&
      !existingCatLower.has(cleanCategory.toLowerCase()) &&
      !discoveredCategories.has(cleanCategory.toLowerCase())
    ) {
      discoveredCategories.set(cleanCategory.toLowerCase(), cleanCategory);
    }

    rows.push({
      rowNumber,
      sku: rawSku.slice(0, 64),
      name: rawName.slice(0, 160),
      category: cleanCategory,
      unit: (rawUnit || 'Unit').slice(0, 40),
      unitCost: Number.isFinite(unitCost) ? Number(Math.max(0, unitCost).toFixed(2)) : 0,
      sellingPrice: Number.isFinite(sellingPrice)
        ? Number(Math.max(0, sellingPrice).toFixed(2))
        : 0,
      sellableStock: Number.isFinite(sellableStock) ? Math.max(0, Math.floor(sellableStock)) : 0,
      isDuplicateInCatalog: rawSku ? existingSkuSet.has(rawSku) : false,
      error: errors.length > 0 ? errors.join('; ') : undefined,
    });
  }

  return {
    rows,
    validRows: rows.filter((r) => !r.error),
    invalidRows: rows.filter((r) => !!r.error),
    newCategories: Array.from(discoveredCategories.values()),
  };
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadProductCsvTemplate(sampleCategory = 'Beverages'): void {
  const headers = [
    'sku',
    'name',
    'category',
    'unit',
    'unitCost',
    'sellingPrice',
    'sellableStock',
  ];
  const sampleRows = [
    ['BEV-500ML-24', 'Sparkling Cola 500ml (24 Pack)', sampleCategory, 'Case', 420, 480, 100],
    ['SNK-CHIPS-12', 'Classic Salted Chips 50g', 'Snacks', 'Carton', 210, 250, 50],
  ];
  const lines = [
    headers.join(','),
    ...sampleRows.map((r) => r.map(escapeCsvCell).join(',')),
  ];
  triggerCsvDownload('aerofiy-products-template.csv', lines.join('\r\n'));
}

export function exportCatalogToCsv(products: Product[]): void {
  const headers = [
    'sku',
    'name',
    'category',
    'unit',
    'unitCost',
    'sellingPrice',
    'sellableStock',
  ];
  const lines = [
    headers.join(','),
    ...products.map((p) =>
      [
        p.sku,
        p.name,
        p.category,
        p.unit,
        p.unitCost,
        p.sellingPrice,
        p.sellableStock,
      ]
        .map(escapeCsvCell)
        .join(',')
    ),
  ];
  const datePart = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`aerofiy-product-catalog-${datePart}.csv`, lines.join('\r\n'));
}

function triggerCsvDownload(filename: string, content: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
