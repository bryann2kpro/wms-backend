/**
 * Report Service
 *
 * @description Generates report PDFs (Movement Report, Invoices Summary).
 * Movement Report PDF is generated from the same HTML template as the preview so UI matches.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { regionRepository } from '@/composition-root';
import { db } from '@/db';
import { eq, and, gte, lt, sql, asc, desc } from 'drizzle-orm';
import { InventoryMovementsTable, InventoryMovementType } from '../inventory/inventory-movement/inventory.model';
import { SkuTable } from '../master-data/sku.model';
import { InvoicesTable, InvoiceItemsTable } from '../invoicing/invoices.model';
import { PurchaseOrdersTable } from '../outbound/purchase-orders.model';
import { OutletsTable } from '../master-data/outlets.model';
import { RegionTable } from '../master-data/region.model';
import { DeliveryOrdersTable } from '../outbound/delivery-orders.model';
import { getSmeLogoImgHtml } from '@/util/sme-logo';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOVEMENT_REPORT_HTML_PATH = path.join(__dirname, 'html', 'movement-report.html');
const PROFORMA_INVOICES_HTML_PATH = path.join(__dirname, 'html', 'proforma-invoices.html');
const STOCK_COUNT_CHECKLIST_HTML_PATH = path.join(__dirname, 'html', 'stock-count-checklist.html');
const DO_PICKING_LIST_HTML_PATH = path.join(__dirname, 'html', 'do-picking-list.html');

// Movement Report row shape
export interface MovementReportRow {
  // companyCode: string;
  itemCode: string;
  description: string;
  countAdjustmentQty: string;
}

// Invoices Summary row shape
export interface InvoiceSummaryRow {
  proformaId: string;
  invoiceDate: string;
  deliveryDate: string;
  poNumber: string;
  doNumber: string;
  outlet: string;
  region: string;
  ctn: number;
  beforeTaxAmount: number;
  afterTaxAmount: number;
  amount: number;
}

export type DeliveryDateSortOrder = 'ASC' | 'DESC';

/**
 * Fetch movement report data. Replace with DB query when ready.
 */
export async function getMovementReportData(
  _dateFrom: string,
  _dateTo: string,
  _regionId?: string
): Promise<MovementReportRow[]> {
  const dateFrom = new Date(_dateFrom);
  const dateToExclusive = new Date(_dateTo);
  dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1);

  const whereConditions = [
    ...(_regionId ? [eq(InventoryMovementsTable.regionId, _regionId)] : []),
    gte(InventoryMovementsTable.createdAt, dateFrom),
    lt(InventoryMovementsTable.createdAt, dateToExclusive),
    eq(InventoryMovementsTable.movementType, InventoryMovementType.SHIPMENT),
  ];

  // TODO: apply regionId filter when a valid relation is available for this query
  const reportData = await db
    .select({
      itemCode: SkuTable.skuCode,
      description: SkuTable.skuDescription,
      countAdjustmentQty: sql<string>`coalesce(sum(${InventoryMovementsTable.quantity}), 0)::text`,
    })
    .from(InventoryMovementsTable)
    .innerJoin(SkuTable, eq(InventoryMovementsTable.skuId, SkuTable.skuId))
    .where(and(...whereConditions))
    .groupBy(SkuTable.skuCode, SkuTable.skuDescription);


  return reportData;
  // return MOVEMENT_MOCK_ROWS;
}

/**
 * Load the movement report HTML template and inject data.
 * Use this to "pump" resolver data into movement-report.html.
 * When regionId is provided, the region header row shows that region's name; otherwise the first region is used.
 */
export async function renderMovementReportHtml(
  rows: MovementReportRow[],
  dateFrom?: string,
  dateTo?: string,
  regionId?: string
): Promise<string> {
  const template = await readFile(MOVEMENT_REPORT_HTML_PATH, 'utf-8');

  const tableRows = rows
    .map(
      (r, i) => {
        const rowAlt = i % 2 === 0 ? 'tr-alt' : '';
        return `<tr class="tr-data ${rowAlt}">
          <td class="px-4 py-3 whitespace-nowrap col-code">${escapeHtml(r.itemCode)}</td>
          <td class="px-4 py-3 whitespace-nowrap col-desc">${escapeHtml(r.description)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-right tabular-nums col-num">-${r.countAdjustmentQty}</td>
        </tr>`;
      }
    )
    .join('\n');
  const grandTotal = rows.reduce((sum, r) => sum + Number(r.countAdjustmentQty), 0).toFixed(2);
  const totalRow = `<tr class="tr-grand-total">
    <td class="px-4 py-3.5" colspan="2">TOTAL OUT</td>
    <td class="px-4 py-3.5 text-right tabular-nums">-${grandTotal}</td>
  </tr>`;

  let regionName: string;
  if (regionId) {
    const region = await regionRepository.getRegionById(regionId);
    regionName = region?.regionName ?? '—';
  } else {
    const region = await regionRepository.getRegion({}, { pageSize: 1, pageNumber: 1 });
    regionName = region.query[0]?.regionName ?? '—';
  }

  const tableRegionHeader = `<tr class="tr-region">
    <td class="px-4 py-3" colspan="3">${escapeHtml(regionName)}</td>
  </tr>`;

  const logoImgHtml = await getSmeLogoImgHtml('SME Edaran');

  return template
    .replace(/\{\{logoImgHtml\}\}/, logoImgHtml)
    .replace(/\{\{tableRegionHeader\}\}/, tableRegionHeader)
    .replace(/\{\{dateFrom\}\}/g, dateFrom ?? '—')
    .replace(/\{\{dateTo\}\}/g, dateTo ?? '—')
    .replace(/\{\{tableRows\}\}/, tableRows + '\n' + totalRow);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fetch invoice summary (proforma) data. When regionId is provided, filters by that region's name.
 * Replace with DB query when ready (filter by dateFrom, dateTo, regionId).
 */
export async function getInvoiceSummaryData(
  _dateFrom?: string,
  _dateTo?: string,
  regionId?: string,
  deliveryDateSortOrder: DeliveryDateSortOrder = 'ASC'
): Promise<InvoiceSummaryRow[]> {
  const dateFrom = _dateFrom ? new Date(_dateFrom) : undefined;
  const dateToExclusive = _dateTo ? new Date(_dateTo) : undefined;
  if (dateToExclusive) dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1);

  const whereConditions = [
    dateFrom ? gte(PurchaseOrdersTable.scheduledDeliveryDate, dateFrom) : undefined,
    dateToExclusive ? lt(PurchaseOrdersTable.scheduledDeliveryDate, dateToExclusive) : undefined,
    regionId ? eq(OutletsTable.regionId, regionId) : undefined,
  ].filter(Boolean) as unknown as Parameters<typeof and>;

  const rows = await db
    .select({
      proformaId: InvoicesTable.invoiceNo,
      dateIssued: InvoicesTable.dateIssued,
      scheduledDeliveryDate: PurchaseOrdersTable.scheduledDeliveryDate,
      poNumber: PurchaseOrdersTable.purchaseOrderNo,
      doNumber: InvoicesTable.doNo,
      outlet: OutletsTable.outletName,
      region: sql<string>`coalesce(${RegionTable.regionName}, '—')`,
      ctn: sql<number>`coalesce(sum(${InvoiceItemsTable.qty}), 0)::float8`,
      beforeTaxAmount: sql<number>`coalesce(${InvoicesTable.totalExclTax}::float8, 0)`,
      afterTaxAmount: sql<number>`coalesce(${InvoicesTable.totalInclTax}::float8, ${PurchaseOrdersTable.amount}::float8, 0)`,
      // Kept for existing PDF template compatibility.
      amount: sql<number>`coalesce(${PurchaseOrdersTable.amount}::float8, 0)`,
    })
    .from(InvoicesTable)
    .innerJoin(PurchaseOrdersTable, eq(InvoicesTable.poId, PurchaseOrdersTable.id))
    .innerJoin(OutletsTable, eq(PurchaseOrdersTable.outletId, OutletsTable.outletId))
    .leftJoin(RegionTable, eq(OutletsTable.regionId, RegionTable.regionId))
    .leftJoin(InvoiceItemsTable, eq(InvoiceItemsTable.invoiceId, InvoicesTable.id))
    .where(whereConditions.length > 0 ? and(...(whereConditions as any)) : undefined)
    .groupBy(
      InvoicesTable.id,
      InvoicesTable.invoiceNo,
      InvoicesTable.dateIssued,
      InvoicesTable.doNo,
      PurchaseOrdersTable.purchaseOrderNo,
      PurchaseOrdersTable.scheduledDeliveryDate,
      PurchaseOrdersTable.amount,
      OutletsTable.outletName,
      RegionTable.regionName
    )
    .orderBy(
      // Keep rows with missing delivery date at the end regardless of selected direction.
      sql<number>`case when ${PurchaseOrdersTable.scheduledDeliveryDate} is null then 1 else 0 end`,
      deliveryDateSortOrder === 'DESC'
        ? desc(PurchaseOrdersTable.scheduledDeliveryDate)
        : asc(PurchaseOrdersTable.scheduledDeliveryDate),
      asc(InvoicesTable.dateIssued),
      asc(InvoicesTable.invoiceNo)
    );

  return rows.map((r) => {
    const issued = r.dateIssued instanceof Date ? r.dateIssued : r.dateIssued ? new Date(r.dateIssued as unknown as string) : undefined;
    const invoiceDate =
      issued && !Number.isNaN(issued.getTime())
        ? `${issued.getUTCDate()}/${issued.getUTCMonth() + 1}/${issued.getUTCFullYear()}`
        : '—';

    const sdd = r.scheduledDeliveryDate instanceof Date ? r.scheduledDeliveryDate : r.scheduledDeliveryDate ? new Date(r.scheduledDeliveryDate as unknown as string) : undefined;
    const deliveryDate =
      sdd && !Number.isNaN(sdd.getTime())
        ? `${sdd.getUTCDate()}/${sdd.getUTCMonth() + 1}/${sdd.getUTCFullYear()}`
        : '—';

    return {
      proformaId: r.proformaId ?? '',
      invoiceDate,
      deliveryDate,
      poNumber: (r.poNumber ?? '').startsWith('#') ? r.poNumber ?? '' : `#${r.poNumber ?? ''}`,
      doNumber: r.doNumber ?? '', // TODO: join DeliveryOrdersTable when DO linkage is finalized
      outlet: r.outlet ?? '',
      region: r.region ?? '—',
      ctn: Math.round(Number(r.ctn ?? 0)),
      beforeTaxAmount: Number(r.beforeTaxAmount ?? 0),
      afterTaxAmount: Number(r.afterTaxAmount ?? 0),
      amount: Number(r.amount ?? 0),
    };
  });
}

// Number of columns that precede the two numeric summary columns (Ctn, Amount).
// Used for colspan on subtotal / grand-total label cells.
// Columns: Proforma Invoice No | Invoice Date | PO No | DO No | Outlet | Region
const INVOICE_LEADING_COLS = 6;

/**
 * Group an array of InvoiceSummaryRows by region, preserving insertion order.
 * Shared by renderProformaInvoicesHtml and generateInvoiceSummaryPdf.
 */
function groupRowsByRegion(rows: InvoiceSummaryRow[]): {
  regionOrder: string[];
  byRegion: Map<string, InvoiceSummaryRow[]>;
} {
  const regionOrder: string[] = [];
  const byRegion = new Map<string, InvoiceSummaryRow[]>();
  for (const r of rows) {
    if (!byRegion.has(r.region)) {
      regionOrder.push(r.region);
      byRegion.set(r.region, []);
    }
    byRegion.get(r.region)!.push(r);
  }
  return { regionOrder, byRegion };
}

function buildInvoiceDataRow(r: InvoiceSummaryRow, isAlt: boolean): string {
  return `<tr class="tr-data${isAlt ? ' tr-alt' : ''}">
    <td class="px-4 py-3 whitespace-nowrap col-code">${escapeHtml(r.proformaId)}</td>
    <td class="px-4 py-3 whitespace-nowrap col-meta">${escapeHtml(r.invoiceDate)}</td>
    <td class="px-4 py-3 whitespace-nowrap col-code">${escapeHtml(r.poNumber)}</td>
    <td class="px-4 py-3 whitespace-nowrap col-code">${escapeHtml(r.doNumber)}</td>
    <td class="px-4 py-3 whitespace-nowrap col-desc">${escapeHtml(r.outlet)}</td>
    <td class="px-4 py-3 whitespace-nowrap col-meta">${escapeHtml(r.region)}</td>
    <td class="px-4 py-3 whitespace-nowrap text-right tabular-nums col-num">${r.ctn}</td>
    <td class="px-4 py-3 whitespace-nowrap text-right tabular-nums col-num">${formatAmount(r.amount)}</td>
  </tr>`;
}

function buildInvoiceSubtotalRow(region: string, totalCtn: number, totalAmount: number): string {
  return `<tr class="tr-subtotal">
    <td class="px-4 py-3" colspan="${INVOICE_LEADING_COLS}">Total (${escapeHtml(region)})</td>
    <td class="px-4 py-3 text-right tabular-nums">${totalCtn}</td>
    <td class="px-4 py-3 text-right tabular-nums">${formatAmount(totalAmount)}</td>
  </tr>`;
}

function buildInvoiceGrandTotalRow(totalCtn: number, totalAmount: number): string {
  return `<tr class="tr-grand-total">
    <td class="px-4 py-3.5" colspan="${INVOICE_LEADING_COLS}">TOTAL</td>
    <td class="px-4 py-3.5 text-right tabular-nums">${totalCtn}</td>
    <td class="px-4 py-3.5 text-right tabular-nums">${formatAmount(totalAmount)}</td>
  </tr>`;
}

function buildInvoiceTableHtml(rows: InvoiceSummaryRow[]): string {
  const { regionOrder, byRegion } = groupRowsByRegion(rows);
  const html: string[] = [];
  let rowIndex = 0;

  for (const region of regionOrder) {
    const regionRows = byRegion.get(region)!;
    for (const r of regionRows) {
      html.push(buildInvoiceDataRow(r, rowIndex++ % 2 === 0));
    }
    const regionCtn = regionRows.reduce((sum, r) => sum + r.ctn, 0);
    const regionAmount = regionRows.reduce((sum, r) => sum + r.amount, 0);
    html.push(buildInvoiceSubtotalRow(region, regionCtn, regionAmount));
  }

  const grandCtn = rows.reduce((sum, r) => sum + r.ctn, 0);
  const grandAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  html.push(buildInvoiceGrandTotalRow(grandCtn, grandAmount));

  return html.join('\n');
}

/**
 * Load the proforma invoices HTML template and inject data.
 * Rows are grouped by region with a per-region subtotal row, then a grand total.
 * When regionId is provided, the region name is resolved and shown in the header.
 */
export async function renderProformaInvoicesHtml(
  rows: InvoiceSummaryRow[],
  dateFrom?: string,
  dateTo?: string,
  regionId?: string
): Promise<string> {
  const [template, regionName, logoImgHtml] = await Promise.all([
    readFile(PROFORMA_INVOICES_HTML_PATH, 'utf-8'),
    resolveRegionName(regionId),
    getSmeLogoImgHtml('SME Edaran'),
  ]);

  return template
    .replace(/\{\{logoImgHtml\}\}/g, logoImgHtml)
    .replace(/\{\{dateFrom\}\}/g, escapeHtml(dateFrom ?? '—'))
    .replace(/\{\{dateTo\}\}/g, escapeHtml(dateTo ?? '—'))
    .replace(/\{\{regionName\}\}/g, escapeHtml(regionName ?? '—'))
    .replace(/\{\{tableRows\}\}/, buildInvoiceTableHtml(rows));
}

async function resolveRegionName(regionId?: string): Promise<string> {
  if (!regionId) return 'All Regions';
  const region = await regionRepository.getRegionById(regionId);
  return region?.regionName ?? '—';
}

function formatAmount(value: number): string {
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Render HTML to PDF using Puppeteer (same layout as preview).
 * Waits for Tailwind CDN script so styles are applied before printing.
 */
export async function htmlToPdf(
  html: string,
  options?: { landscape?: boolean; preferCSSPageSize?: boolean },
): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    // Default viewport is ~800px; wide layouts need a larger logical width for PDF.
    if (options?.preferCSSPageSize) {
      // Match A4 portrait at 96dpi (210mm × 297mm) — proforma invoice PDF
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    } else if (options?.landscape) {
      await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
    }
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });

    const pdfBuffer = options?.preferCSSPageSize
      ? await page.pdf({
          printBackground: true,
          preferCSSPageSize: true,
        })
      : await page.pdf({
          format: 'A4',
          landscape: options?.landscape ?? false,
          printBackground: true,
          margin: { top: '16px', right: '16px', bottom: '16px', left: '16px' },
        });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Generate Movement Report PDF from the same HTML template as the preview.
 * PDF layout and styling match /api/v1/report/preview/movement.
 */
export async function generateMovementReportPdf(
  rows: MovementReportRow[],
  dateFrom?: string,
  dateTo?: string,
  regionId?: string
): Promise<{ pdfBase64: string; filename: string }> {
  const html = await renderMovementReportHtml(rows, dateFrom, dateTo, regionId);
  const pdfBuffer = await htmlToPdf(html);
  const filename = `Movement_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}

/**
 * Generate Invoices Summary (Proforma) PDF from the same HTML template as the preview.
 * PDF layout and styling match /api/v1/report/preview/proforma.
 */
export async function generateInvoiceSummaryPdf(
  rows: InvoiceSummaryRow[],
  dateFrom?: string,
  dateTo?: string,
  regionId?: string
): Promise<{ pdfBase64: string; filename: string }> {
  const html = await renderProformaInvoicesHtml(rows, dateFrom, dateTo, regionId);
  const pdfBuffer = await htmlToPdf(html, { landscape: true });
  const filename = `Proforma_Invoices_${new Date().toISOString().split('T')[0]}.pdf`;
  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}

// ─── Stock Count Checklist ──────────────────────────────────────────────────

export interface StockCountChecklistRow {
  index: number;
  skuCode: string;
  description: string;
}

/**
 * Load the stock count checklist HTML template and inject session + item data.
 * Quantity columns are intentionally left blank for the storekeeper to fill in.
 */
export async function renderStockCountChecklistHtml(
  session: { name: string; countDate: string },
  rows: StockCountChecklistRow[],
  unitName: string,
): Promise<string> {
  const template = await readFile(STOCK_COUNT_CHECKLIST_HTML_PATH, 'utf-8');

  const countDateStr = new Date(session.countDate).toLocaleDateString('en-MY');
  const generatedAt = new Date().toLocaleDateString('en-MY');

  const tableRows = rows
    .map((r) => {
      const rowAlt = r.index % 2 === 0 ? ' tr-alt' : '';
      return `<tr class="tr-data${rowAlt}">
        <td class="col-no">${r.index}</td>
        <td class="col-code">${escapeHtml(r.skuCode)}</td>
        <td class="col-desc">${escapeHtml(r.description)}</td>
        <td class="col-writein"></td>
        <td class="col-writein"></td>
        <td class="col-writein"></td>
      </tr>`;
    })
    .join('\n');

  return template
    .replace(/\{\{sessionName\}\}/g, escapeHtml(session.name))
    .replace(/\{\{countDate\}\}/g, countDateStr)
    .replace(/\{\{generatedAt\}\}/g, generatedAt)
    .replace(/\{\{unitName\}\}/g, escapeHtml(unitName))
    .replace(/\{\{tableRows\}\}/, tableRows)
    .replace(/\{\{totalItems\}\}/g, String(rows.length));
}

/**
 * Generate a Stock Count Checklist PDF for the given session.
 * Fetches all items (up to 9999) and renders them as a blank write-in sheet.
 */
export async function generateStockCountChecklistPdf(
  sessionId: string,
  orgId: string,
): Promise<{ pdfBase64: string; filename: string }> {
  const { stockCountSessionService } = await import('@/composition-root');

  const session = await stockCountSessionService.getSession(orgId, sessionId);
  if (!session) throw new Error(`Stock count session not found: ${sessionId}`);

  const itemsResult = await stockCountSessionService.getSessionItems(
    orgId,
    sessionId,
    undefined,
    { pageSize: 9999, pageNumber: 1 },
  );

  const rows: StockCountChecklistRow[] = itemsResult.query.map((item, idx) => ({
    index: idx + 1,
    skuCode: item.skuCode,
    description: item.skuDescription,
  }));

  const html = await renderStockCountChecklistHtml(session, rows, 'Doz');
  const pdfBuffer = await htmlToPdf(html);

  const safeName = session.name.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Stock_Count_Checklist_${safeName}_${dateStr}.pdf`;

  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}

// ---------------------------------------------------------------------------
// DO Picking List
// ---------------------------------------------------------------------------

const ACTIVE_DO_STATUSES = ['CREATED', 'NEW', 'PICKING', 'PACKING'];

interface DoPickingListSkuGroup {
  skuCode: string;
  skuDescription: string;
  totalQtyRequired: number;
  totalQtyPicked: number;
  doBreakdown: { doNo: string; qtyRequired: number }[];
  allocations: { rackName: string | null; grnNo: string | null; lotNo: string | null; expiryDate: Date | null; qtyAllocated: string; priorityFlag: boolean }[];
}

/**
 * Load the DO picking list HTML template and inject SKU-grouped picking data.
 */
export async function renderDoPickingListHtml(
  skuGroups: DoPickingListSkuGroup[],
  options?: { regionLabel?: string },
): Promise<string> {
  const template = await readFile(DO_PICKING_LIST_HTML_PATH, 'utf-8');
  const logoImgHtml = await getSmeLogoImgHtml();

  const generatedAt = new Date().toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });

  const doNos = new Set<string>();
  for (const g of skuGroups) for (const d of g.doBreakdown) doNos.add(d.doNo);
  const totalUnits = skuGroups.reduce((sum, g) => sum + g.totalQtyRequired, 0);

  const flattenedRows: {
    skuCode: string;
    skuDescription: string;
    qtyRequired: number;
    rackLabel: string;
    completedPicking: boolean;
  }[] = [];

  for (const g of skuGroups) {
    const completedPicking = g.totalQtyPicked >= g.totalQtyRequired;

    const rackQtyMap = new Map<string, number>();
    for (const a of g.allocations) {
      const rackLabel = a.rackName?.trim() ? `Rack ${a.rackName.trim()}` : 'Rack —';
      const qtyAllocated = parseFloat(String(a.qtyAllocated ?? 0)) || 0;
      rackQtyMap.set(rackLabel, (rackQtyMap.get(rackLabel) ?? 0) + qtyAllocated);
    }

    if (rackQtyMap.size === 0) {
      flattenedRows.push({
        skuCode: g.skuCode,
        skuDescription: g.skuDescription,
        qtyRequired: g.totalQtyRequired,
        rackLabel: 'Rack —',
        completedPicking,
      });
      continue;
    }

    const rackRows = Array.from(rackQtyMap.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    for (const [rackLabel, qtyRequired] of rackRows) {
      flattenedRows.push({
        skuCode: g.skuCode,
        skuDescription: g.skuDescription,
        qtyRequired,
        rackLabel,
        completedPicking,
      });
    }
  }

  const tableRows = flattenedRows
    .map((row, i) => {
      const rowAlt = i % 2 !== 0 ? ' tr-alt' : '';
      const markHtml = row.completedPicking ? '&#10003;' : '';
      const markClass = row.completedPicking ? ' col-mark-done' : '';
      return `<tr class="tr-data${rowAlt}">
        <td class="col-no">${i + 1}</td>
        <td class="col-sku">${escapeHtml(row.skuCode)}</td>
        <td class="col-desc">${escapeHtml(row.skuDescription)}</td>
        <td class="col-qty col-qty-total">${formatQtyNum(row.qtyRequired)}</td>
        <td class="col-rack">${escapeHtml(row.rackLabel)}</td>
        <td class="col-mark${markClass}">${markHtml}</td>
      </tr>`;
    })
    .join('\n');

  const regionLabel = (options?.regionLabel ?? 'All regions').trim() || 'All regions';

  return template
    .replace(/\{\{logoImgHtml\}\}/g, logoImgHtml)
    .replace(/\{\{generatedAt\}\}/g, generatedAt)
    .replace(/\{\{totalDOs\}\}/g, String(doNos.size))
    .replace(/\{\{totalSKUs\}\}/g, String(skuGroups.length))
    .replace(/\{\{totalUnits\}\}/g, formatQtyNum(totalUnits))
    .replace(/\{\{regionLabel\}\}/g, escapeHtml(regionLabel))
    .replace(/\{\{tableRows\}\}/, tableRows);
}

function formatQtyNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * Generate a DO Picking List PDF — SKU-grouped summary of all active DOs.
 * Optionally filter by region and/or expected delivery date range.
 */
export async function generateDoPickingListPdf(
  _orgId: string,
  filter?: {
    regionId?: string;
    search?: string;
    scheduledDeliveryDateFrom?: string;
    scheduledDeliveryDateTo?: string;
  },
): Promise<{ pdfBase64: string; filename: string }> {
  const { deliveryOrdersRepository } = await import('@/composition-root');

  const itemsResult = await deliveryOrdersRepository.getDeliveryOrderItemsWithDetails(
    {
      doStatus: ACTIVE_DO_STATUSES,
      search: filter?.search,
      regionId: filter?.regionId,
      scheduledDeliveryDateFrom: filter?.scheduledDeliveryDateFrom,
      scheduledDeliveryDateTo: filter?.scheduledDeliveryDateTo,
    },
    { pageSize: 200, pageNumber: 1 },
  );

  // Fetch allocations for all items
  const doItemIds = itemsResult.query.map((i) => i.id);
  const allAllocations = doItemIds.length > 0
    ? await deliveryOrdersRepository.getDoItemAllocationsWithDetails(doItemIds)
    : [];
  const allocByItemId = new Map<string, typeof allAllocations>();
  for (const a of allAllocations) {
    const arr = allocByItemId.get(a.doItemId) ?? [];
    arr.push(a);
    allocByItemId.set(a.doItemId, arr);
  }

  // Group by SKU
  const grouped = new Map<string, DoPickingListSkuGroup>();
  for (const item of itemsResult.query) {
    const key = item.skuCode ?? 'no-sku';
    if (!grouped.has(key)) {
      grouped.set(key, {
        skuCode: item.skuCode ?? '—',
        skuDescription: item.skuDescription ?? '—',
        totalQtyRequired: 0,
        totalQtyPicked: 0,
        doBreakdown: [],
        allocations: [],
      });
    }
    const g = grouped.get(key)!;
    const req = parseFloat(String(item.qtyRequired ?? 0)) || 0;
    const picked = parseFloat(String(item.qtyPicked ?? 0)) || 0;
    g.totalQtyRequired += req;
    g.totalQtyPicked += picked;
    if (item.doNo) {
      g.doBreakdown.push({ doNo: item.doNo, qtyRequired: req });
    }
    for (const alloc of allocByItemId.get(item.id) ?? []) {
      if (!g.allocations.some((a) => a.grnNo === alloc.grnNo && a.rackName === alloc.rackName)) {
        g.allocations.push({
          rackName: alloc.rackName,
          grnNo: alloc.grnNo,
          lotNo: alloc.lotNo,
          expiryDate: alloc.expiryDate,
          qtyAllocated: alloc.qtyAllocated,
          priorityFlag: alloc.priorityFlag,
        });
      }
    }
  }

  const skuGroups = Array.from(grouped.values()).sort((a, b) =>
    a.skuCode.localeCompare(b.skuCode),
  );

  let regionLabel = 'All regions';
  if (filter?.regionId) {
    const region = await regionRepository.getRegionById(filter.regionId);
    const name = region?.regionName?.trim();
    regionLabel = name && name.length > 0 ? name : 'Unknown region';
  }

  const html = await renderDoPickingListHtml(skuGroups, { regionLabel });
  const pdfBuffer = await htmlToPdf(html);

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `DO_Picking_List_${dateStr}.pdf`;

  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}
