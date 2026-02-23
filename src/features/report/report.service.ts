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
import { jsPDF } from 'jspdf';
import { autoTable, CellHookData } from 'jspdf-autotable';
import { regionRepository } from '@/composition-root';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOVEMENT_REPORT_HTML_PATH = path.join(__dirname, 'html', 'movement-report.html');
const PROFORMA_INVOICES_HTML_PATH = path.join(__dirname, 'html', 'proforma-invoices.html');

// Movement Report row shape
export interface MovementReportRow {
  companyCode: string;
  itemCode: string;
  description: string;
  countAdjustmentQty: number;
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

const MOVEMENT_MOCK_ROWS: MovementReportRow[] = [
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0012', description: 'EMPIRE SUSHI BOX (LARGE) 200PCS/CTN (LOCAL)', countAdjustmentQty: -66 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0011', description: 'EMPIRE SUSHI BOX (MEDIUM) 300PCS/CTN (LOCAL)', countAdjustmentQty: -80 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0013', description: 'EMPIRE SUSHI BOX (SMALL) 300PCS/CTN (LOCAL)', countAdjustmentQty: -90 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-P0017', description: 'PLASTIC BAG BIODEGRADABLE 3000PC/CTN (LOCAL)', countAdjustmentQty: -5 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0010', description: 'EMPIRE COMBO BOX (60PCS/PKT) (LOCAL)', countAdjustmentQty: -1 },
];

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
export function getMovementReportData(
  _dateFrom?: string,
  _dateTo?: string,
  _regionId?: string
): MovementReportRow[] {
  // TODO: filter by dateFrom, dateTo, regionId when querying DB
  return MOVEMENT_MOCK_ROWS;
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
        const rowOdd = i % 2 === 0 ? 'bg-gray-50' : '';
        return `<tr class="border-b border-gray-300 hover:bg-gray-100 ${rowOdd}">
          <td class="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">${escapeHtml(r.itemCode)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-gray-800">${escapeHtml(r.description)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">${r.countAdjustmentQty}</td>
        </tr>`;
      }
    )
    .join('\n');
  const grandTotal = rows.reduce((sum, r) => sum + r.countAdjustmentQty, 0);
  const totalRow = `<tr class="border-t-2 border-gray-500 bg-gray-200 font-bold text-gray-900">
    <td class="px-4 py-3.5" colspan="2">TOTAL OUT</td>
    <td class="px-4 py-3.5 text-right tabular-nums">${grandTotal}</td>
  </tr>`;

  let regionName: string;
  if (regionId) {
    const region = await regionRepository.getRegionById(regionId);
    regionName = region?.regionName ?? '—';
  } else {
    const region = await regionRepository.getRegion({}, { pageSize: 1, pageNumber: 1 });
    regionName = region.query[0]?.regionName ?? '—';
  }

  const tableRegionHeader = `<tr class="border-b border-gray-400 bg-gray-100">
    <td class="px-4 py-3 font-semibold text-gray-900" colspan="3">${escapeHtml(regionName)}</td>
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
  // TODO: filter by dateFrom, dateTo, regionId when querying DB
  if (!regionId) return INVOICE_SUMMARY_MOCK_ROWS;
  const region = await regionRepository.getRegionById(regionId);
  if (!region) return INVOICE_SUMMARY_MOCK_ROWS;
  return INVOICE_SUMMARY_MOCK_ROWS.filter((r) => r.region === region.regionName);
}

/**
 * Load the proforma invoices HTML template and inject data.
 * Use this to render invoice summary in HTML format (proforma-invoices.html).
 * Rows are grouped by region with a per-region summary row (total amount and ctn).
 * When regionId is provided, regionName is shown in the header (from getRegionById).
 */
export async function renderProformaInvoicesHtml(
  rows: InvoiceSummaryRow[],
  dateFrom?: string,
  dateTo?: string,
  regionId?: string
): Promise<string> {
  const template = await readFile(PROFORMA_INVOICES_HTML_PATH, 'utf-8');

  let regionName = '—';
  if (regionId) {
    const region = await regionRepository.getRegionById(regionId);
    regionName = region ? escapeHtml(region.regionName) : '—';
  }

  // Group by region (preserve order of first occurrence) using passed-in rows
  const regionOrder: string[] = [];
  const byRegion = new Map<string, InvoiceSummaryRow[]>();
  for (const r of rows) {
    if (!byRegion.has(r.region)) {
      regionOrder.push(r.region);
      byRegion.set(r.region, []);
    }
    byRegion.get(r.region)!.push(r);
  }

  const rowHtml: string[] = [];
  let dataRowIndex = 0;
  for (const region of regionOrder) {
    let columnCount = Object.keys(byRegion.get(region)![0]).length;
    const regionRows = byRegion.get(region)!;
    for (const r of regionRows) {
      const rowOdd = dataRowIndex % 2 === 0 ? 'bg-gray-50' : '';
      dataRowIndex += 1;
      rowHtml.push(
        `<tr class="border-b border-gray-300 hover:bg-gray-100 ${rowOdd}">
          <td class="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">${escapeHtml(r.proformaId)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-gray-900 font-medium">${escapeHtml(r.poNumber)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-gray-800">${escapeHtml(r.outlet)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-gray-700">${escapeHtml(r.expectedArrivalDate)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-gray-700">${escapeHtml(r.region)}</td>
          <td class="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">${r.ctn}</td>
          <td class="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-gray-900">${formatAmount(r.amount)}</td>
        </tr>`
      );
    }
    const regionTotalCtn = regionRows.reduce((sum, r) => sum + r.ctn, 0);
    const regionTotalAmount = regionRows.reduce((sum, r) => sum + r.amount, 0);
    rowHtml.push(
      `<tr class="border-b border-gray-400 bg-gray-100 font-bold text-gray-900">
        <td class="px-4 py-3" colspan="${columnCount - 2}">Total (${escapeHtml(region)})</td>
        <td class="px-4 py-3 text-right tabular-nums">${regionTotalCtn}</td>
        <td class="px-4 py-3 text-right tabular-nums">${formatAmount(regionTotalAmount)}</td>
      </tr>`
    );
  }

  const totalCtn = rows.reduce((sum, r) => sum + r.ctn, 0);
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  const grandTotalRow = `<tr class="border-t-2 border-gray-500 bg-gray-200 font-bold text-gray-900">
    <td class="px-4 py-3.5" colspan="5">TOTAL</td>
    <td class="px-4 py-3.5 text-right tabular-nums">${totalCtn}</td>
    <td class="px-4 py-3.5 text-right tabular-nums">${formatAmount(totalAmount)}</td>
  </tr>`;

  return template
    .replace(/\{\{dateFrom\}\}/g, dateFrom ?? '—')
    .replace(/\{\{dateTo\}\}/g, dateTo ?? '—')
    .replace(/\{\{regionName\}\}/g, regionName)
    .replace(/\{\{tableRows\}\}/, rowHtml.join('\n') + '\n' + grandTotalRow);
}

function formatAmount(value: number): string {
  return `RM ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Render HTML to PDF using Puppeteer (same layout as preview).
 * Waits for Tailwind CDN script so styles are applied before printing.
 */
async function htmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 20000,
    });
    const pdfBuffer = await page.pdf({
      format: 'A4',
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
 * regionId is used for the region header row in the report.
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
  const pdfBase64 = pdfBuffer.toString('base64');
  return { pdfBase64, filename };
}

/**
 * Generate Invoices Summary (Proforma) PDF and return base64 + filename.
 * Groups by region with per-region total amount summary, then grand total.
 * When regionId is provided, adds "Region: <name>" subtitle (name from getRegionById).
 */
export async function generateInvoiceSummaryPdf(
  rows: InvoiceSummaryRow[],
  regionId?: string
): Promise<{ pdfBase64: string; filename: string }> {
  const regionOrder: string[] = [];
  const byRegion = new Map<string, InvoiceSummaryRow[]>();
  for (const r of rows) {
    if (!byRegion.has(r.region)) {
      regionOrder.push(r.region);
      byRegion.set(r.region, []);
    }
    byRegion.get(r.region)!.push(r);
  }

  const body: string[][] = [];
  for (const region of regionOrder) {
    const regionRows = byRegion.get(region)!;
    for (const r of regionRows) {
      body.push([r.poNumber, r.outlet, r.expectedArrivalDate, r.region, String(r.ctn), formatAmount(r.amount)]);
    }
    const regionTotalCtn = regionRows.reduce((sum, r) => sum + r.ctn, 0);
    const regionTotalAmount = regionRows.reduce((sum, r) => sum + r.amount, 0);
    body.push(['', '', '', `Total (${region})`, String(regionTotalCtn), formatAmount(regionTotalAmount)]);
  }
  const totalCtn = rows.reduce((sum, r) => sum + r.ctn, 0);
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  body.push(['', '', '', 'TOTAL', String(totalCtn), formatAmount(totalAmount)]);

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Proforma Invoices', 14, 16);
  let startY = 22;
  if (regionId) {
    const region = await regionRepository.getRegionById(regionId);
    if (region) {
      doc.setFontSize(10);
      doc.text(`Region: ${region.regionName}`, 14, 20);
      startY = 26;
    }
  }

  const subtotalRowIndices = new Set<number>();
  let idx = 0;
  for (const region of regionOrder) {
    idx += byRegion.get(region)!.length;
    subtotalRowIndices.add(idx);
    idx += 1;
  }
  subtotalRowIndices.add(body.length - 1);

  autoTable(doc, {
    head: [['Proforma Invoice No', 'Outlet', 'Expected Arrival Date', 'Region', 'Ctn', 'Amount']],
    body,
    startY,
    theme: 'grid',
    headStyles: { fontStyle: 'bold', fillColor: "black" },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      4: { halign: 'right' },
      5: { halign: 'right' },
    },
    didParseCell: (data: CellHookData) => {
      if (data.section === 'body' && subtotalRowIndices.has(data.row.index)) {
        (data.cell.styles as { fontStyle?: string }).fontStyle = 'bold';
      }
    },
  });

  const filename = `Proforma_Invoices_${new Date().toISOString().split('T')[0]}.pdf`;
  const pdfBase64 = doc.output('datauristring').split(',')[1] ?? '';
  return { pdfBase64, filename };
}
