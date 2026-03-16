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
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { InventoryMovementsTable, InventoryMovementType } from '../inventory/inventory-movement/inventory.model';
import { SkuTable } from '../master-data/sku.model';
import { InvoicesTable, InvoiceItemsTable } from '../invoicing/invoices.model';
import { PurchaseOrdersTable } from '../outbound/purchase-orders.model';
import { OutletsTable } from '../master-data/outlets.model';
import { RegionTable } from '../master-data/region.model';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOVEMENT_REPORT_HTML_PATH = path.join(__dirname, 'html', 'movement-report.html');
const PROFORMA_INVOICES_HTML_PATH = path.join(__dirname, 'html', 'proforma-invoices.html');

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
  poNumber: string;
  outlet: string;
  expectedArrivalDate: string;
  region: string;
  ctn: number;
  amount: number;
}

const INVOICE_SUMMARY_MOCK_ROWS: InvoiceSummaryRow[] = [
  { proformaId: 'ES-20260213-0001', poNumber: '#PO260170528', outlet: 'Aeon Midtown Falim', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 10, amount: 1250.00 },
  { proformaId: 'ES-20260213-0002', poNumber: '#PO260173297', outlet: 'Lotuss Taiping', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 8, amount: 980.00 },
  { proformaId: 'ES-20260213-0003', poNumber: '#PO260173298', outlet: 'Gurney Paragon', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 5, amount: 620.50 },
  { proformaId: 'ES-20260213-0004', poNumber: '#PO260173299', outlet: 'Amanjaya', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 24, amount: 3120.00 },
  { proformaId: 'ES-20260213-0005', poNumber: '#PO260173300', outlet: 'AEON Bukit Mertajam', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 18, amount: 2340.00 },
  { proformaId: 'ES-2026213-0006', poNumber: '#PO260173301', outlet: 'Aman Central LG', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 15, amount: 1950.00 },
  { proformaId: 'ES-2026213-0007', poNumber: '#PO260173302', outlet: 'Lotuss Teluk Intan', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 9, amount: 1107.00 },
  { proformaId: 'ES-2026213-0008', poNumber: '#PO260173303', outlet: 'Pearl City', region: "North" ,expectedArrivalDate: '22/1/2026', ctn: 13, amount: 1690.00 },
  { proformaId: 'ES-2026213-0009', poNumber: '#PO260173304', outlet: 'Nibong Tebal', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 6, amount: 744.00 },
  { proformaId: 'ES-2026213-0010', poNumber: '#PO260173305', outlet: 'Lotuss Ipoh Bercham', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 24, amount: 2976.00 },
  { proformaId: 'ES-2026213-0011', poNumber: '#PO260173306', outlet: 'Sunway Carnival', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 5, amount: 620.00 },
  { proformaId: 'ES-2026213-0012', poNumber: '#PO260173307', outlet: 'Sentra Mall', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 8, amount: 992.00 },
  { proformaId: 'ES-2026213-0013', poNumber: '#PO260173308', outlet: 'AEON Seri Manjung', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 6, amount: 744.00 },
  { proformaId: 'ES-2026213-0014', poNumber: '#PO260173309', outlet: 'AEON Taiping', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 6, amount: 744.00 },
  { proformaId: 'ES-2026213-0015', poNumber: '#PO260173310', outlet: 'AEON Ipoh S18', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 13, amount: 1612.00 },
  { proformaId: 'ES-2026213-0016', poNumber: '#PO260173311', outlet: '1st Avenue', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 17, amount: 2108.00 },
  { proformaId: 'ES-2026213-0017', poNumber: '#PO260173312', outlet: 'Queensbay Mall', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 10, amount: 1240.00 },
  { proformaId: 'ES-2026213-0018', poNumber: '#PO260173313', outlet: 'Mydin Bukit Mertajam', region: "North" ,expectedArrivalDate: '22/1/2026', ctn: 12, amount: 1488.00 },
  { proformaId: 'ES-2026213-0019', poNumber: '#PO260173314', outlet: 'Gurney Plaza', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 13, amount: 1612.00 },
  { proformaId: 'ES-2026213-0020', poNumber: '#PO260173315', outlet: 'Serai Wangi', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 10, amount: 1240.00 },
  { proformaId: 'ES-2026213-0021', poNumber: '#PO260173316', outlet: 'AEON Kinta City', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 12, amount: 1488.00 },
]; 

/**
 * Fetch movement report data. Replace with DB query when ready.
 */
export async function getMovementReportData(
  _dateFrom: string,
  _dateTo: string,
  _regionId: string
): Promise<MovementReportRow[]> {
  const dateFrom = new Date(_dateFrom);
  const dateToExclusive = new Date(_dateTo);
  dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1);

  const whereConditions = [
    eq(InventoryMovementsTable.regionId, _regionId),
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

  return template
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
  regionId?: string
): Promise<InvoiceSummaryRow[]> {
  const dateFrom = _dateFrom ? new Date(_dateFrom) : undefined;
  const dateToExclusive = _dateTo ? new Date(_dateTo) : undefined;
  if (dateToExclusive) dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1);

  const whereConditions = [
    dateFrom ? gte(InvoicesTable.dateIssued, dateFrom) : undefined,
    dateToExclusive ? lt(InvoicesTable.dateIssued, dateToExclusive) : undefined,
    regionId ? eq(OutletsTable.regionId, regionId) : undefined,
  ].filter(Boolean) as unknown as Parameters<typeof and>;

  const rows = await db
    .select({
      proformaId: InvoicesTable.invoiceNo,
      poNumber: PurchaseOrdersTable.purchaseOrderNo,
      outlet: OutletsTable.outletName,
      expectedArrivalDate: PurchaseOrdersTable.scheduledDeliveryDate,
      region: sql<string>`coalesce(${RegionTable.regionName}, '—')`,
      ctn: sql<number>`coalesce(sum(${InvoiceItemsTable.qty}), 0)::float8`,
      amount: sql<number>`coalesce(${InvoicesTable.totalInclTax}, 0)::float8`,
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
      InvoicesTable.totalInclTax,
      PurchaseOrdersTable.purchaseOrderNo,
      PurchaseOrdersTable.scheduledDeliveryDate,
      OutletsTable.outletName,
      RegionTable.regionName
    )
    .orderBy(InvoicesTable.dateIssued);

  return rows.map((r) => ({
    proformaId: r.proformaId,
    poNumber: r.poNumber.startsWith('#') ? r.poNumber : `#${r.poNumber}`,
    outlet: r.outlet,
    expectedArrivalDate: r.expectedArrivalDate
      ? `${r.expectedArrivalDate.getUTCDate()}/${r.expectedArrivalDate.getUTCMonth() + 1}/${r.expectedArrivalDate.getUTCFullYear()}`
      : '—',
    region: r.region,
    ctn: Math.round(Number(r.ctn)),
    amount: Number(r.amount),
  }));
}

// Number of columns that precede the two numeric summary columns (Ctn, Amount).
// Used for colspan on subtotal / grand-total label cells.
const INVOICE_LEADING_COLS = 5;

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
    <td class="px-4 py-3 whitespace-nowrap col-code">${escapeHtml(r.poNumber)}</td>
    <td class="px-4 py-3 whitespace-nowrap col-desc">${escapeHtml(r.outlet)}</td>
    <td class="px-4 py-3 whitespace-nowrap col-meta">${escapeHtml(r.expectedArrivalDate)}</td>
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
  const [template, regionName] = await Promise.all([
    readFile(PROFORMA_INVOICES_HTML_PATH, 'utf-8'),
    resolveRegionName(regionId),
  ]);

  return template
    .replace(/\{\{dateFrom\}\}/g, dateFrom ?? '—')
    .replace(/\{\{dateTo\}\}/g, dateTo ?? '—')
    .replace(/\{\{regionName\}\}/g, escapeHtml(regionName))
    .replace(/\{\{tableRows\}\}/, buildInvoiceTableHtml(rows));
}

async function resolveRegionName(regionId?: string): Promise<string> {
  if (!regionId) return 'All Regions';
  const region = await regionRepository.getRegionById(regionId);
  return region?.regionName ?? '—';
}

function formatAmount(value: number): string {
  return `RM ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Render HTML to PDF using Puppeteer (same layout as preview).
 * Waits for Tailwind CDN script so styles are applied before printing.
 */
async function htmlToPdf(html: string, options?: { landscape?: boolean }): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    const pdfBuffer = await page.pdf({
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
