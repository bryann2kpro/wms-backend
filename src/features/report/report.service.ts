/**
 * Report Service
 *
 * @description Generates report PDFs (Movement Report, Invoices Summary).
 * Uses mock data by default; replace with DB queries when ready.
 */

import { jsPDF } from 'jspdf';
import { autoTable, CellHookData } from 'jspdf-autotable';

// Movement Report row shape
export interface MovementReportRow {
  companyCode: string;
  itemCode: string;
  description: string;
  countAdjustmentQty: number;
}

// Invoices Summary row shape
export interface InvoiceSummaryRow {
  poNumber: string;
  outlet: string;
  expectedArrivalDate: string;
  region: string;
  ctn: number;
}

const MOVEMENT_MOCK_ROWS: MovementReportRow[] = [
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0012', description: 'EMPIRE SUSHI BOX (LARGE) 200PCS/CTN (LOCAL)', countAdjustmentQty: -66 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0011', description: 'EMPIRE SUSHI BOX (MEDIUM) 300PCS/CTN (LOCAL)', countAdjustmentQty: -80 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0013', description: 'EMPIRE SUSHI BOX (SMALL) 300PCS/CTN (LOCAL)', countAdjustmentQty: -90 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-P0017', description: 'PLASTIC BAG BIODEGRADABLE 3000PC/CTN (LOCAL)', countAdjustmentQty: -5 },
  { companyCode: 'EMPIRE SUSHI', itemCode: 'RAW-E0010', description: 'EMPIRE COMBO BOX (60PCS/PKT) (LOCAL)', countAdjustmentQty: -1 },
];

const INVOICE_SUMMARY_MOCK_ROWS: InvoiceSummaryRow[] = [
  { poNumber: '#PO260170528', outlet: 'Aeon Midtown Falim', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 10 },
  { poNumber: '#PO260173297', outlet: 'Lotuss Taiping', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 8 },
  { poNumber: '#PO260173298', outlet: 'Gurney Paragon', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 5 },
  { poNumber: '#PO260173299', outlet: 'Amanjaya', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 24 },
  { poNumber: '#PO260173300', outlet: 'AEON Bukit Mertajam', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 18 },
  { poNumber: '#PO260173301', outlet: 'Aman Central LG', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 15 },
  { poNumber: '#PO260173302', outlet: 'Lotuss Teluk Intan', region: "Klang Valley" ,expectedArrivalDate: '22/1/2026', ctn: 9 },
  { poNumber: '#PO260173303', outlet: 'Pearl City', region: "North" ,expectedArrivalDate: '22/1/2026', ctn: 13 },
  { poNumber: '#PO260173304', outlet: 'Nibong Tebal', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 6 },
  { poNumber: '#PO260173305', outlet: 'Lotuss Ipoh Bercham', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 24 },
  { poNumber: '#PO260173306', outlet: 'Sunway Carnival', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 5 },
  { poNumber: '#PO260173307', outlet: 'Sentra Mall', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 8 },
  { poNumber: '#PO260173308', outlet: 'AEON Seri Manjung', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 6 },
  { poNumber: '#PO260173309', outlet: 'AEON Taiping', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 6 },
  { poNumber: '#PO260173310', outlet: 'AEON Ipoh S18', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 13 },
  { poNumber: '#PO260173311', outlet: '1st Avenue', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 17 },
  { poNumber: '#PO260173312', outlet: 'Queensbay Mall', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 10 },
  { poNumber: '#PO260173313', outlet: 'Mydin Bukit Mertajam', region: "North" ,expectedArrivalDate: '22/1/2026', ctn: 12 },
  { poNumber: '#PO260173314', outlet: 'Gurney Plaza', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 13 },
  { poNumber: '#PO260173315', outlet: 'Serai Wangi', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 10 },
  { poNumber: '#PO260173316', outlet: 'AEON Kinta City', region: "South" ,expectedArrivalDate: '22/1/2026', ctn: 12 },
];

/**
 * Fetch movement report data. Replace with DB query when ready.
 */
export function getMovementReportData(_dateFrom?: string, _dateTo?: string): MovementReportRow[] {
  // TODO: filter by dateFrom/dateTo when querying DB
  return MOVEMENT_MOCK_ROWS;
}

/**
 * Fetch invoice summary data. Replace with DB query when ready.
 */
export function getInvoiceSummaryData(_dateFrom?: string, _dateTo?: string): InvoiceSummaryRow[] {
  // TODO: filter by dateFrom/dateTo when querying DB
  return INVOICE_SUMMARY_MOCK_ROWS;
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
 */
export function generateInvoiceSummaryPdf(
  rows: InvoiceSummaryRow[]
): { pdfBase64: string; filename: string } {
  const totalCtn = rows.reduce((sum, r) => sum + r.ctn, 0);
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('Invoices Summary', 14, 16);

  const body = rows.map((r) => [
    'Purchase Order',
    r.poNumber,
    r.outlet,
    r.region,
    r.expectedArrivalDate,
    String(r.ctn),
  ]);
  body.push(['', '', '', '', 'Total', String(totalCtn)]);

  autoTable(doc, {
    head: [['PONumber', 'PO Number', 'Outlet', 'Region', 'Expected Arrival Date', 'Ctn']],
    body,
    startY: 22,
    theme: 'grid',
    headStyles: { fontStyle: 'bold', fillColor: "black" },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      5: { halign: 'right' },
    },
    didParseCell: (data: CellHookData) => {
      const raw = data.row.raw as (string | number)[];
      if (data.section === 'body' && data.row.index === body.length - 1) {
        (data.cell.styles as { fontStyle?: string }).fontStyle = 'bold';
      }
    },
  });

  const filename = `Invoices_Summary_${new Date().toISOString().split('T')[0]}.pdf`;
  const pdfBase64 = doc.output('datauristring').split(',')[1] ?? '';
  return { pdfBase64, filename };
}
