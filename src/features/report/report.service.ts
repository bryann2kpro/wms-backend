/**
 * Report Service
 *
 * @description Generates report PDFs (Movement Report, Invoices Summary).
 * Uses mock data by default; replace with DB queries when ready.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
export function getMovementReportData(_dateFrom?: string, _dateTo?: string): MovementReportRow[] {
  // TODO: filter by dateFrom/dateTo when querying DB
  return MOVEMENT_MOCK_ROWS;
}

/**
 * Load the movement report HTML template and inject data.
 * Use this to "pump" resolver data into movement-report.html.
 */
export async function renderMovementReportHtml(
  rows: MovementReportRow[],
  dateFrom?: string,
  dateTo?: string
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

  // For mock get the first data from region

  const region = await regionRepository.getRegion({}, { pageSize: 1, pageNumber: 1 });

  const regionName = region.query[0].regionName;

  const tableRegionHeader = `<tr class="border-b border-gray-400 bg-gray-100">
    <td class="px-4 py-3 font-semibold text-gray-900" colspan="3">${regionName}</td>
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
 * Fetch invoice summary data. Replace with DB query when ready.
 */
export function getInvoiceSummaryData(_dateFrom?: string, _dateTo?: string): InvoiceSummaryRow[] {
  // TODO: filter by dateFrom/dateTo when querying DB
  return INVOICE_SUMMARY_MOCK_ROWS;
}

/**
 * Load the proforma invoices HTML template and inject data.
 * Use this to render invoice summary in HTML format (proforma-invoices.html).
 * Rows are grouped by region with a per-region summary row (total amount and ctn).
 */
export async function renderProformaInvoicesHtml(
  rows: InvoiceSummaryRow[],
  dateFrom?: string,
  dateTo?: string
): Promise<string> {
  const template = await readFile(PROFORMA_INVOICES_HTML_PATH, 'utf-8');

  // Group by region (preserve order of first occurrence)
  const regionOrder: string[] = [];
  const byRegion = new Map<string, InvoiceSummaryRow[]>();
  for (const r of INVOICE_SUMMARY_MOCK_ROWS) {
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
    .replace(/\{\{tableRows\}\}/, rowHtml.join('\n') + '\n' + grandTotalRow);
}

function formatAmount(value: number): string {
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Generate Movement Report PDF and return base64 + filename.
 */
export function generateMovementReportPdf(
  rows: MovementReportRow[]
): { pdfBase64: string; filename: string } {
  const grandTotal = rows.reduce((sum, r) => sum + r.countAdjustmentQty, 0);
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(16);
  doc.text('Movement Report', 14, 16);

  const body: (string | number)[][] = [];
  for (const r of rows) {
    body.push([r.companyCode, r.itemCode, r.description, String(r.countAdjustmentQty)]);
    body.push(['', '', 'TOTAL OUT', String(r.countAdjustmentQty)]);
  }
  body.push(['', '', 'TOTAL OUT', String(grandTotal)]);

  autoTable(doc, {
    head: [['Company Code', 'Item Code', 'Description', 'Count Adjustment Unit Qty']],
    body,
    startY: 22,
    theme: 'grid',
    headStyles: { fontStyle: 'bold', fillColor: "black" },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      3: { halign: 'right' },
    },
    didParseCell: (data: CellHookData) => {
      const raw = data.row.raw as (string | number)[];
      if (data.section === 'body' && data.column.index === 3 && data.row.index < body.length - 1) {
        const isSubtotal = raw[2] === 'TOTAL OUT';
        if (isSubtotal) (data.cell.styles as { fontStyle?: string }).fontStyle = 'bold';
      }
      if (data.row.index === body.length - 1) {
        (data.cell.styles as { fontStyle?: string }).fontStyle = 'bold';
      }
    },
  });

  const filename = `Movement_Report_${new Date().toISOString().split('T')[0]}.pdf`;
  const pdfBase64 = doc.output('datauristring').split(',')[1] ?? '';
  return { pdfBase64, filename };
}

/**
 * Generate Invoices Summary PDF and return base64 + filename.
 * Groups by region with per-region total amount summary, then grand total.
 */
export function generateInvoiceSummaryPdf(
  rows: InvoiceSummaryRow[]
): { pdfBase64: string; filename: string } {
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
    startY: 22,
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
