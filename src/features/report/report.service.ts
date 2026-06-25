/**
 * Report Service
 *
 * @description Generates report PDFs (Movement Report, Invoices Summary).
 * Movement Report PDF is generated from the same HTML template as the preview so UI matches.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { regionRepository } from '@/composition-root';
import { db } from '@/db';
import { eq, and, gte, lt, sql, asc, desc, inArray } from 'drizzle-orm';
import { InventoryMovementsTable, InventoryMovementType } from '../inventory/inventory-movement/inventory.model';
import { InventoryBalancesTable } from '../inventory/inventory-balance/inventory.model';
import { SkuTable } from '../master-data/sku.model';
import { StockUnitTable } from '../master-data/stock-unit.model';
import { RacksTable } from '../master-data/racks.model';
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
const STOCK_BALANCE_HTML_PATH = path.join(__dirname, 'html', 'stock-balance.html');
const STOCK_TRANSFER_WORK_QUEUE_HTML_PATH = path.join(__dirname, 'html', 'stock-transfer-work-queue.html');
const GRN_REMAINING_REPORT_HTML_PATH = path.join(__dirname, 'html', 'grn-remaining-report.html');

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

const DUPLICATE_OUTLET_SUFFIX = ' *';

/**
 * When more than one row shares the same invoice date and outlet, append an
 * asterisk after the outlet name (e.g. for Excel / PDF Proforma Invoice Summary).
 */
export function markDuplicateInvoiceDateOutletRows(
  rows: InvoiceSummaryRow[]
): InvoiceSummaryRow[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.invoiceDate}\0${r.outlet}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map((r) => {
    const key = `${r.invoiceDate}\0${r.outlet}`;
    if ((counts.get(key) ?? 0) < 2) return r;
    const outlet =
      r.outlet.endsWith(DUPLICATE_OUTLET_SUFFIX) ?
        r.outlet
      : `${r.outlet}${DUPLICATE_OUTLET_SUFFIX}`;
    return { ...r, outlet };
  });
}

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

  const mapped = rows.map((r) => {
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

  return markDuplicateInvoiceDateOutletRows(mapped);
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
    <td class="px-4 py-3 col-desc">${escapeHtml(r.outlet)}</td>
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
 * Resolve Chrome/Chromium for Puppeteer PDF generation.
 * Docker sets PUPPETEER_EXECUTABLE_PATH; local dev may use bundled or system Chrome.
 */
function resolvePuppeteerExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const bundled = puppeteer.executablePath();
  if (existsSync(bundled)) {
    return bundled;
  }

  if (process.platform === 'darwin') {
    const macChrome =
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (existsSync(macChrome)) {
      return macChrome;
    }
  }

  return undefined;
}

/**
 * Render HTML to PDF using Puppeteer (same layout as preview).
 * Waits for Tailwind CDN script so styles are applied before printing.
 */
export async function htmlToPdf(
  html: string,
  options?: {
    landscape?: boolean;
    preferCSSPageSize?: boolean;
    /** Default networkidle0 for Tailwind CDN templates; use domcontentloaded when HTML is self-contained */
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0';
    timeout?: number;
  },
): Promise<Buffer> {
  const executablePath = resolvePuppeteerExecutablePath();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : {}),
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
    await page.setContent(html, {
      waitUntil: options?.waitUntil ?? 'networkidle0',
      timeout: options?.timeout ?? 20000,
    });

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

/** Upper bound on DO line rows loaded for picking list PDF (must cover all lines or SKU totals truncate). Keep in sync with `ES_DO_WORK_QUEUE_PAGE_SIZE` in `smee-frontend/.../es-do.tsx`. */
const DO_PICKING_LIST_LINE_FETCH_CAP = 100_000;

/** ISO YYYY-MM-DD → en-MY display string for picking list header (calendar date in UTC). */
function formatDoPickingListScheduleDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** Human-readable scheduled delivery filter for PDF header; null if neither bound sent. */
function formatScheduledDeliveryRangeForPdf(from?: string | null, to?: string | null): string | null {
  const f = from?.trim();
  const t = to?.trim();
  if (!f && !t) return null;
  if (f && t) {
    if (f === t) return formatDoPickingListScheduleDate(f);
    return `${formatDoPickingListScheduleDate(f)} – ${formatDoPickingListScheduleDate(t)}`;
  }
  if (f) return `From ${formatDoPickingListScheduleDate(f)}`;
  return `Until ${formatDoPickingListScheduleDate(t!)}`;
}

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
  options?: { regionLabel?: string; scheduledDeliveryRange?: string | null },
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
  const scheduledDeliveryRange =
    options?.scheduledDeliveryRange != null && String(options.scheduledDeliveryRange).trim() !== ''
      ? String(options.scheduledDeliveryRange).trim()
      : 'Not filtered';

  return template
    .replace(/\{\{logoImgHtml\}\}/g, logoImgHtml)
    .replace(/\{\{generatedAt\}\}/g, generatedAt)
    .replace(/\{\{totalDOs\}\}/g, String(doNos.size))
    .replace(/\{\{totalSKUs\}\}/g, String(skuGroups.length))
    .replace(/\{\{totalUnits\}\}/g, formatQtyNum(totalUnits))
    .replace(/\{\{regionLabel\}\}/g, escapeHtml(regionLabel))
    .replace(/\{\{scheduledDeliveryRange\}\}/g, escapeHtml(scheduledDeliveryRange))
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
    regionIds?: string[];
    search?: string;
    scheduledDeliveryDateFrom?: string;
    scheduledDeliveryDateTo?: string;
  },
): Promise<{ pdfBase64: string; filename: string }> {
  const { deliveryOrdersRepository } = await import('@/composition-root');


  const itemsResult = await deliveryOrdersRepository.getDeliveryOrderItemsWithDetails(
    {
      ...filter,
      doStatus: ACTIVE_DO_STATUSES,
    },
    { pageSize: DO_PICKING_LIST_LINE_FETCH_CAP, pageNumber: 1 },
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
  // if (filter?.regionIds && filter.regionIds.length > 0) {
  //   const rows = await Promise.all(
  //     filter.regionIds.map((id) => regionRepository.getRegionById(id)),
  //   );
  //   const parts = rows
  //     .map((r) => r?.regionName?.trim())
  //     .filter((n): n is string => Boolean(n && n.length > 0));
  //   regionLabel = parts.length > 0 ? parts.join(', ') : 'Unknown regions';
  // } else if (filter?.regionId) {
  //   const region = await regionRepository.getRegionById(filter.regionId);
  //   const name = region?.regionName?.trim();
  //   regionLabel = name && name.length > 0 ? name : 'Unknown region';
  // }

  const regions = await regionRepository.getRegionsByIds(filter?.regionIds ?? []);
  regionLabel = regions.map((r) => r.regionName).join(', ') || 'Unknown region';


  const scheduledDeliveryRange = formatScheduledDeliveryRangeForPdf(
    filter?.scheduledDeliveryDateFrom,
    filter?.scheduledDeliveryDateTo,
  );

  const html = await renderDoPickingListHtml(skuGroups, {
    regionLabel,
    scheduledDeliveryRange,
  });
  const pdfBuffer = await htmlToPdf(html);

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `DO_Picking_List_${dateStr}.pdf`;

  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}

// ── GRN Remaining Quantity Report ─────────────────────────────────────────────

export type GrnRemainingReportRow = {
  grnId: string;
  grnNo: string;
  poNo: string | null;
  receivedAt: Date | null;
  supplierName: string | null;
  endUserName: string | null;
  skuCode: string;
  skuDescription: string;
  /** Null/0 -> fully fulfilled (or no PO/ASN to compare against) -> rendered as "—". */
  remainingCtn: number | null;
  remainingLoosePcs: number | null;
};

function formatRemainingCell(ctn: number | null, pcs: number | null): string {
  if (!ctn && !pcs) return '—';
  const parts = [`${formatQtyNum(ctn ?? 0)} CTN`];
  if (pcs) parts.push(`${formatQtyNum(pcs)} pcs`);
  return parts.join(' + ');
}

export async function renderGrnRemainingReportHtml(
  rows: GrnRemainingReportRow[],
): Promise<string> {
  const template = await readFile(GRN_REMAINING_REPORT_HTML_PATH, 'utf-8');
  const generatedAt = new Date().toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });

  // GRNs are the unit of "outstanding" — group rows by grnId (already ordered by the
  // query) so every line of a qualifying GRN renders together under one header row.
  const grnOrder: string[] = [];
  const rowsByGrn = new Map<string, GrnRemainingReportRow[]>();
  for (const row of rows) {
    if (!rowsByGrn.has(row.grnId)) {
      grnOrder.push(row.grnId);
      rowsByGrn.set(row.grnId, []);
    }
    rowsByGrn.get(row.grnId)!.push(row);
  }

  const cards = grnOrder
    .map((grnId) => {
      const grnRows = rowsByGrn.get(grnId)!;
      const first = grnRows[0];
      const received = first.receivedAt
        ? new Date(first.receivedAt).toLocaleDateString('en-MY', { dateStyle: 'medium' })
        : '—';
      const itemRows = grnRows
        .map((row, idx) => {
          const rowAlt = idx % 2 !== 0 ? ' tr-alt' : '';
          return `<tr class="tr-data${rowAlt}">
            <td class="col-no">${idx + 1}</td>
            <td class="col-sku">${escapeHtml(row.skuCode)}</td>
            <td class="col-desc">${escapeHtml(row.skuDescription)}</td>
            <td class="col-qty">${formatRemainingCell(row.remainingCtn, row.remainingLoosePcs)}</td>
          </tr>`;
        })
        .join('\n');
      return `<div class="grn-card">
        <div class="grn-info">
          <div class="info-row"><span class="info-label">GRN No</span><span class="info-value">${escapeHtml(first.grnNo)}</span></div>
          <div class="info-row"><span class="info-label">PO No</span><span class="info-value">${escapeHtml(first.poNo ?? '—')}</span></div>
          <div class="info-row"><span class="info-label">Supplier</span><span class="info-value">${escapeHtml(first.supplierName ?? '—')}</span></div>
          <div class="info-row"><span class="info-label">End User</span><span class="info-value">${escapeHtml(first.endUserName ?? '—')}</span></div>
          <div class="info-row"><span class="info-label">Received</span><span class="info-value">${escapeHtml(received)}</span></div>
        </div>
        <div class="grn-items">
          <table>
            <thead>
              <tr>
                <th style="text-align:center; width:8%">#</th>
                <th style="text-align:left; width:20%">SKU Code</th>
                <th style="text-align:left; width:52%">Description</th>
                <th style="text-align:center; width:20%">Remaining</th>
              </tr>
            </thead>
            <tbody>
              ${itemRows}
            </tbody>
          </table>
        </div>
      </div>`;
    })
    .join('\n');

  return template
    .replace(/\{\{generatedAt\}\}/g, generatedAt)
    .replace(/\{\{totalLines\}\}/g, String(rows.length))
    .replace(/\{\{cards\}\}/, cards || '<div class="grn-card"><div class="grn-items" style="padding:1.5rem; text-align:center; color:var(--text-muted);">No outstanding lines</div></div>');
}

/** Printable PDF of every GRN line still owed against its PO/ASN (remainingCtn/remainingLoosePcs snapshot). */
export async function generateGrnRemainingReportPdf(
  organizationId: string,
): Promise<{ pdfBase64: string; filename: string }> {
  const { grnItemsRepository } = await import('@/composition-root');
  const rawRows = await grnItemsRepository.getRemainingItems(organizationId);

  const rows: GrnRemainingReportRow[] = rawRows.map((r) => ({
    grnId: r.grnId,
    grnNo: r.grnNo,
    poNo: r.poNo ?? null,
    receivedAt: r.receivedAt ?? null,
    supplierName: r.supplierName ?? null,
    endUserName: r.endUserName ?? null,
    skuCode: r.skuCode,
    skuDescription: r.skuDescription,
    remainingCtn: r.remainingCtn != null ? Number(r.remainingCtn) : null,
    remainingLoosePcs: r.remainingLoosePcs != null ? Number(r.remainingLoosePcs) : null,
  }));

  const html = await renderGrnRemainingReportHtml(rows);
  // Landscape — 7 columns need the extra width A4 portrait can't give after margins.
  const pdfBuffer = await htmlToPdf(html, { landscape: true });
  const dateStr = new Date().toISOString().split('T')[0];
  return { pdfBase64: pdfBuffer.toString('base64'), filename: `GRN_Unfulfillment_Report_${dateStr}.pdf` };
}

// ── Stock Balance Report ──────────────────────────────────────────────────────

export type InventoryBalanceReportType = 'WITHOUT_RACK' | 'WITH_RACK';

export interface InventoryBalanceReportRow {
  skuCode: string;
  skuDescription: string;
  unitCode: string;
  onHandQty: number;
  rackLocations: string[];
}

export async function getInventoryBalanceReportData(
  type: InventoryBalanceReportType,
  organizationId: string,
): Promise<InventoryBalanceReportRow[]> {
  const rows = await db
    .select({
      skuCode: SkuTable.skuCode,
      skuDescription: SkuTable.skuDescription,
      unitCode: StockUnitTable.unitCode,
      onHandQty: sql<number>`${InventoryBalancesTable.onHandQty}::float8`,
      skuBatches: SkuTable.skuBatches,
    })
    .from(InventoryBalancesTable)
    .innerJoin(SkuTable, eq(InventoryBalancesTable.skuId, SkuTable.skuId))
    .innerJoin(StockUnitTable, eq(SkuTable.skuUom, StockUnitTable.stockUnitId))
    .where(eq(InventoryBalancesTable.organizationId, organizationId))
    .orderBy(asc(SkuTable.skuCode));

  if (type === 'WITHOUT_RACK') {
    return rows.map(({ skuCode, skuDescription, unitCode, onHandQty }) => ({
      skuCode,
      skuDescription,
      unitCode,
      onHandQty,
      rackLocations: [],
    }));
  }

  // WITH_RACK: collect all rackIds, batch-fetch, build label map
  const allRackIds = Array.from(
    new Set(
      rows.flatMap((r) =>
        (r.skuBatches ?? []).flatMap((b) => b.rackIds ?? []),
      ),
    ),
  );

  const rackLabelMap = new Map<string, string>();
  if (allRackIds.length > 0) {
    const racks = await db
      .select({
        rackId: RacksTable.rackId,
        rackRow: RacksTable.rackRow,
        rackColumn: RacksTable.rackColumn,
        rackLevel: RacksTable.rackLevel,
      })
      .from(RacksTable)
      .where(inArray(RacksTable.rackId, allRackIds));

    for (const rack of racks) {
      rackLabelMap.set(rack.rackId, `${rack.rackRow}-${rack.rackColumn}-${rack.rackLevel}`);
    }
  }

  return rows.map(({ skuCode, skuDescription, unitCode, onHandQty, skuBatches }) => {
    const rackIds = Array.from(
      new Set((skuBatches ?? []).flatMap((b) => b.rackIds ?? [])),
    );
    const rackLocations = rackIds
      .map((id) => rackLabelMap.get(id))
      .filter((label): label is string => label !== undefined);
    return { skuCode, skuDescription, unitCode, onHandQty, rackLocations };
  });
}

export async function renderStockBalanceHtml(
  rows: InventoryBalanceReportRow[],
  type: InventoryBalanceReportType,
): Promise<string> {
  const template = await readFile(STOCK_BALANCE_HTML_PATH, 'utf-8');
  const logoImgHtml = await getSmeLogoImgHtml('SME Edaran');

  const withRack = type === 'WITH_RACK';

  const tableRows = rows
    .map((r, i) => {
      const rowAlt = i % 2 === 0 ? 'tr-alt' : '';
      const rackCell = withRack
        ? `<td class="px-4 py-3 col-rack">${escapeHtml(r.rackLocations.join(', ') || '—')}</td>`
        : '';
      return `<tr class="tr-data ${rowAlt}">
        <td class="px-4 py-3 col-num">${i + 1}</td>
        <td class="px-4 py-3 col-code">${escapeHtml(r.skuCode)}</td>
        <td class="px-4 py-3 col-desc">${escapeHtml(r.skuDescription)}</td>
        <td class="px-4 py-3 col-uom">${escapeHtml(r.unitCode)}</td>
        <td class="px-4 py-3 text-right tabular-nums col-num">${r.onHandQty.toFixed(2)}</td>
        ${rackCell}
      </tr>`;
    })
    .join('\n');

  const rackHeader = withRack ? '<th style="text-align:left">Rack Location(s)</th>' : '';
  const generatedDate = new Date().toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' });

  return template
    .replace(/\{\{logoImgHtml\}\}/, logoImgHtml)
    .replace(/\{\{reportVariant\}\}/, withRack ? 'With Rack' : 'Without Rack')
    .replace(/\{\{rackHeader\}\}/, rackHeader)
    .replace(/\{\{tableRows\}\}/, tableRows)
    .replace(/\{\{generatedDate\}\}/g, generatedDate);
}

export async function generateStockBalancePdf(
  rows: InventoryBalanceReportRow[],
  type: InventoryBalanceReportType,
): Promise<{ pdfBase64: string; filename: string }> {
  const html = await renderStockBalanceHtml(rows, type);
  const pdfBuffer = await htmlToPdf(html);
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Stock_Balance_Report_${dateStr}.pdf`;
  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}

// ── Internal Transfer Work Queue ─────────────────────────────────────────────

/** Keep in sync with work-queue pageSize in bin-transfer-work-queue.tsx */
const STOCK_TRANSFER_WORK_QUEUE_FETCH_CAP = 200;

const STOCK_TRANSFER_WORK_QUEUE_STATUSES = ['IN_TRANSIT', 'AWAITING_DISPATCH'] as const;

interface StockTransferWorkQueueRack {
  rackRow: string;
  rackColumn: string;
  rackLevel: string | number;
}

interface StockTransferWorkQueueLine {
  transferNo: string;
  typeLabel: string;
  statusLabel: string;
  sourceDest: string;
  skuLot: string;
  qty: string;
}

interface StockTransferWorkQueueGroup {
  transferNo: string;
  typeLabel: string;
  statusLabel: string;
  lineCount: number;
  lines: StockTransferWorkQueueLine[];
}

function formatStockTransferRackLocation(rack: StockTransferWorkQueueRack | null): string {
  if (!rack) return '—';
  return `${rack.rackRow}-${rack.rackLevel}-${rack.rackColumn}`;
}

function formatStockTransferTypeLabel(type: string): string {
  return type === 'BIN_TO_BIN' ? 'Bin → Bin' : 'Warehouse → Warehouse';
}

function formatStockTransferQueueStatusLabel(status: string): string {
  return status === 'AWAITING_DISPATCH' ? 'Awaiting Dispatch' : 'In Transit';
}

function formatStockTransferQtyDisplay(quantity: string, lossQuantity?: string | null): string {
  const carton = parseFloat(String(quantity ?? 0)) || 0;
  const loss = parseFloat(String(lossQuantity ?? 0)) || 0;
  const parts: string[] = [];
  if (carton > 0) parts.push(`${Number.isInteger(carton) ? carton : carton.toFixed(2)} CTN`);
  if (loss > 0) parts.push(`${Number.isInteger(loss) ? loss : loss.toFixed(2)} Loss`);
  return parts.length > 0 ? parts.join(' + ') : '0';
}

export async function renderStockTransferWorkQueueHtml(
  groups: StockTransferWorkQueueGroup[],
  options?: { searchLabel?: string },
): Promise<string> {
  const [template, logoImgHtml] = await Promise.all([
    readFile(STOCK_TRANSFER_WORK_QUEUE_HTML_PATH, 'utf-8'),
    getSmeLogoImgHtml('SME logo'),
  ]);
  const generatedAt = new Date().toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' });
  const totalLines = groups.reduce((sum, g) => sum + g.lines.length, 0);

  const tableRows = groups
    .flatMap((group) =>
      group.lines.map((line, i) => {
        const rowAlt = i % 2 !== 0 ? ' tr-alt' : '';
        return `<tr class="tr-data${rowAlt}">
          <td class="col-mono col-muted">${escapeHtml(line.transferNo)}</td>
          <td>${escapeHtml(line.sourceDest)}</td>
          <td class="col-mono">${escapeHtml(line.skuLot)}</td>
          <td class="col-center">${escapeHtml(line.qty)}</td>
        </tr>`;
      }),
    )
    .join('\n');

  const searchLabel = (options?.searchLabel ?? 'All transfers').trim() || 'All transfers';

  return template
    .replace(/\{\{logoImgHtml\}\}/g, logoImgHtml)
    .replace(/\{\{generatedAt\}\}/g, generatedAt)
    .replace(/\{\{totalTransfers\}\}/g, String(groups.length))
    .replace(/\{\{totalLines\}\}/g, String(totalLines))
    .replace(/\{\{searchLabel\}\}/g, escapeHtml(searchLabel))
    .replace(/\{\{tableRows\}\}/, tableRows);
}

/**
 * Generate Internal Transfer Work Queue PDF — approved IN_TRANSIT / AWAITING_DISPATCH transfers.
 */
export async function generateStockTransferWorkQueuePdf(
  organizationId: string,
  filter?: { search?: string },
): Promise<{ pdfBase64: string; filename: string }> {
  const {
    stockTransferRepository,
    skuRepository,
    racksRepository,
  } = await import('@/composition-root');

  const search = filter?.search?.trim() || undefined;
  const mergedTransfers: Awaited<ReturnType<typeof stockTransferRepository.listStockTransfers>>['query'] = [];
  const seen = new Set<string>();

  for (const status of STOCK_TRANSFER_WORK_QUEUE_STATUSES) {
    const result = await stockTransferRepository.listStockTransfers(
      organizationId,
      {
        status,
        search,
        sortBy: 'CREATED_AT',
        sortOrder: 'ASC',
      },
      { pageSize: STOCK_TRANSFER_WORK_QUEUE_FETCH_CAP, pageNumber: 1 },
    );
    for (const transfer of result.query) {
      if (seen.has(transfer.id)) continue;
      seen.add(transfer.id);
      mergedTransfers.push(transfer);
    }
  }

  mergedTransfers.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const allItems = (
    await Promise.all(
      mergedTransfers.map((transfer) =>
        stockTransferRepository.getStockTransferItems(transfer.id),
      ),
    )
  ).flat();

  const skuIds = [...new Set(allItems.map((item) => item.skuId))];
  const skuMap = new Map<string, { skuCode: string | null }>();
  if (skuIds.length > 0) {
    const skuResult = await skuRepository.getSku({ skuId: skuIds });
    for (const sku of skuResult.query) {
      skuMap.set(sku.skuId, { skuCode: sku.skuCode ?? null });
    }
  }

  const rackIds = [
    ...new Set(
      allItems.flatMap((item) => [item.sourceRackId, item.destinationRackId].filter(Boolean)),
    ),
  ] as string[];
  const rackMap = new Map<string, StockTransferWorkQueueRack>();
  if (rackIds.length > 0) {
    const rackResult = await racksRepository.getRack(
      { rackId: rackIds },
      { pageSize: rackIds.length, pageNumber: 1 },
      organizationId,
    );
    for (const rack of rackResult.query) {
      rackMap.set(rack.rackId, {
        rackRow: rack.rackRow,
        rackColumn: rack.rackColumn,
        rackLevel: rack.rackLevel,
      });
    }
  }

  const itemsByTransferId = new Map<string, typeof allItems>();
  for (const item of allItems) {
    const arr = itemsByTransferId.get(item.stockTransferId) ?? [];
    arr.push(item);
    itemsByTransferId.set(item.stockTransferId, arr);
  }

  const groups: StockTransferWorkQueueGroup[] = mergedTransfers.map((transfer) => {
    const typeLabel = formatStockTransferTypeLabel(transfer.type);
    const statusLabel = formatStockTransferQueueStatusLabel(transfer.status);
    const items = itemsByTransferId.get(transfer.id) ?? [];

    const lines: StockTransferWorkQueueLine[] = items.map((item) => {
      const skuCode = skuMap.get(item.skuId)?.skuCode ?? '—';
      const lot = item.lotNo?.trim() || 'No lot';
      const sourceRack = item.sourceRackId ? (rackMap.get(item.sourceRackId) ?? null) : null;
      const destRack = item.destinationRackId ? (rackMap.get(item.destinationRackId) ?? null) : null;
      return {
        transferNo: transfer.transferNo,
        typeLabel,
        statusLabel,
        sourceDest: `${formatStockTransferRackLocation(sourceRack)} → ${formatStockTransferRackLocation(destRack)}`,
        skuLot: `${skuCode} / ${lot}`,
        qty: formatStockTransferQtyDisplay(item.quantity, item.lossQuantity),
      };
    });

    return {
      transferNo: transfer.transferNo,
      typeLabel,
      statusLabel,
      lineCount: lines.length,
      lines,
    };
  });

  const html = await renderStockTransferWorkQueueHtml(groups, {
    searchLabel: search ?? 'All transfers',
  });
  const pdfBuffer = await htmlToPdf(html, {
    landscape: true,
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `Internal_Transfer_Work_Queue_${dateStr}.pdf`;
  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}
