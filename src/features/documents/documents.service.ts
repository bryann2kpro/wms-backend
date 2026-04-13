/**
 * Documents Service
 *
 * @description Delivery Order PDF generation (layout without pricing), HTML rendering, and upload.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { eq } from 'drizzle-orm';
import {
  deliveryOrdersRepository,
  invoicesRepository,
  outletsRepository,
  purchaseOrdersRepository,
  regionRepository,
  s3Repository,
} from '@/composition-root';
import { db } from '@/db';
import { AddressSnapshotsTable } from '@/features/address/address-snapshots.model';
import { env } from '@/env';
import { htmlToPdf } from '@/features/report/report.service';
import { logger } from '@/util/logger';
import { getSmeLogoDataUrl } from '@/util/sme-logo';

export type DeliveryOrderPdfItemRow = {
  index: number;
  skuCode: string;
  description: string;
  qty: string;
};

export async function renderDeliveryOrderPreviewHtml(doId: string): Promise<string> {
  const logoDataUrl = await getSmeLogoDataUrl();
  const billingSnapshot = await getDeliveryOrderBillingAddressSnapshot();

  const doRow = await deliveryOrdersRepository.getDeliveryOrderById(doId);
  if (!doRow) throw new Error(`Delivery order not found: ${doId}`);

  const poRow = doRow.purchaseOrderId
    ? (await purchaseOrdersRepository.getPurchaseOrders({ id: doRow.purchaseOrderId }, { pageSize: 1, pageNumber: 1 }))
        .query[0]
    : undefined;

  const outlet = poRow?.outletId ? await outletsRepository.getOutletById(poRow.outletId) : null;
  const region = outlet?.regionId ? await regionRepository.getRegionById(outlet.regionId) : null;

  const itemsResult = await deliveryOrdersRepository.getDeliveryOrderItemsWithDetails(
    { doNo: doRow.doNo },
    { pageSize: 1000, pageNumber: 1 },
  );

  const itemRows: DeliveryOrderPdfItemRow[] = itemsResult.query.map((it, idx) => ({
    index: idx + 1,
    skuCode: it.skuCode ?? it.skuId ?? '—',
    description: it.skuDescription ?? '—',
    qty: String(it.qtyRequired ?? '0'),
  }));

  return await buildDeliveryOrderHtml({
    doNo: doRow.doNo ?? '—',
    poNo: doRow.poNo ?? poRow?.purchaseOrderNo ?? '—',
    docDate: formatDateDMY(doRow.createdAt ?? new Date()),
    regionName: region?.regionName ?? '—',
    billingCompanyName: billingSnapshot?.companyName ?? '—',
    billingAddressText: billingSnapshot?.addressText ?? null,
    billingAttnName: billingSnapshot?.attnName ?? null,
    billingTel: billingSnapshot?.tel ?? null,
    billingFax: billingSnapshot?.fax ?? null,

    deliveryCompanyName: outlet?.outletName ?? '—',
    deliveryAddressText: outlet?.address ?? null,
    deliveryAttnName: billingSnapshot?.attnName ?? null,
    logoDataUrl,
    rows: itemRows,
  });
}

/**
 * Generate Delivery Order PDF and return the raw buffer + filename (no S3 upload).
 * Used by the bulk zip export job.
 */
export async function generateDeliveryOrderPdfData(doId: string): Promise<{ pdfBase64: string; filename: string }> {
  const html = await renderDeliveryOrderPreviewHtml(doId);
  const pdfBuffer = await htmlToPdf(html);
  const doRow = await deliveryOrdersRepository.getDeliveryOrderById(doId);
  if (!doRow) throw new Error(`Delivery order not found: ${doId}`);
  const dateStr = new Date().toISOString().split('T')[0];
  const safeDoNo = String(doRow.doNo ?? 'DO').replace(/[^a-zA-Z0-9-_]/g, '_');
  const filename = `Delivery_Order_${safeDoNo}_${dateStr}.pdf`;
  return { pdfBase64: pdfBuffer.toString('base64'), filename };
}

/**
 * Generate Delivery Order PDF (invoice-like layout) without pricing fields.
 * @returns Public S3 URL of the uploaded PDF.
 */
export async function generateDeliveryOrderPdf(doId: string): Promise<string> {
  try {
    logger.info('ℹ️ [documents.service.generateDeliveryOrderPdf] Generating delivery order PDF...');

    const html = await renderDeliveryOrderPreviewHtml(doId);

    const pdfBuffer = await htmlToPdf(html);

    const doRow = await deliveryOrdersRepository.getDeliveryOrderById(doId);
    if (!doRow) throw new Error(`Delivery order not found: ${doId}`);

    const dateStr = new Date().toISOString().split('T')[0];
    const safeDoNo = String(doRow.doNo ?? 'DO').replace(/[^a-zA-Z0-9-_]/g, '_');
    const filename = `Delivery_Order_${safeDoNo}_${dateStr}.pdf`;

    const s3Url = await s3Repository.uploadReportPdf(pdfBuffer, filename, 'delivery-orders');
    if (!s3Url) throw new Error('Failed to upload delivery order PDF to S3');

    logger.info('✅ [documents.service.generateDeliveryOrderPdf] Delivery order PDF generated: %s', s3Url);
    return s3Url;
  } catch (error) {
    logger.error('🚨 [documents.service.generateDeliveryOrderPdf]', error);
    throw error;
  }
}

// ─── Proforma invoice (single invoice / single PO PDF) ─────────────────────

function parseSnapshotNumber(snapshot: unknown, key: string): number | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const value = (snapshot as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseSnapshotSstRate(snapshot: unknown): number | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const v = (snapshot as Record<string, unknown>).sstRate;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const p = Number(v);
    return Number.isFinite(p) ? p : null;
  }
  return null;
}

function formatRmAmount(value: number): string {
  return value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

type InvoiceRowForPdf = NonNullable<Awaited<ReturnType<typeof invoicesRepository.getInvoiceById>>>;

async function loadInvoiceForPdfOrThrow(invoiceId: string, organizationId: string): Promise<InvoiceRowForPdf> {
  const row = await invoicesRepository.getInvoiceById(invoiceId);
  if (!row) throw new Error(`Invoice not found: ${invoiceId}`);
  if (row.organizationId !== organizationId) {
    throw new Error('Invoice not found or access denied');
  }
  return row;
}

let cachedProformaInvoiceTemplatePromise: Promise<string> | null = null;
async function getProformaInvoiceTemplate(): Promise<string> {
  if (!cachedProformaInvoiceTemplatePromise) {
    cachedProformaInvoiceTemplatePromise = (async () => {
      const templatePath = path.join(__dirname, 'html', 'proforma-invoice.html');
      return readFile(templatePath, 'utf8');
    })();
  }
  return cachedProformaInvoiceTemplatePromise;
}

async function buildProformaInvoiceHtml(invoiceRow: InvoiceRowForPdf): Promise<string> {
  const items = await invoicesRepository.getInvoiceItemsByInvoiceId(invoiceRow.id);
  const billingSnapshot = await getDeliveryOrderBillingAddressSnapshot();
  const logoDataUrl = await getSmeLogoDataUrl();

  const poRow = invoiceRow.poId
    ? (await purchaseOrdersRepository.getPurchaseOrders({ id: invoiceRow.poId }, { pageSize: 1, pageNumber: 1 }))
        .query[0]
    : undefined;

  const outlet = poRow?.outletId ? await outletsRepository.getOutletById(poRow.outletId) : null;
  const region = outlet?.regionId ? await regionRepository.getRegionById(outlet.regionId) : null;

  const snapshot = invoiceRow.poAmountCalcSnapshot;
  const regionRate = parseSnapshotNumber(snapshot, 'rate');
  const minQty = parseSnapshotNumber(snapshot, 'minQty');
  const snapSst = parseSnapshotSstRate(snapshot);
  const taxRateFromInvoice = parseFloat(String(invoiceRow.taxRate ?? '0')) || 0;
  const effectiveSstRate = taxRateFromInvoice > 0 ? taxRateFromInvoice : (snapSst ?? 0);
  const taxRatePct = Math.round(effectiveSstRate * 100);
  const taxRateLabel = taxRatePct > 0 ? `${taxRatePct}%` : '—';

  type ComputedLine = {
    qty: number;
    unitPrice: number;
    subTotal: number;
    skuCode: string;
    description: string | null;
  };

  const computedLines: ComputedLine[] = items.map((it) => {
    const qty = parseFloat(String(it.qty)) || 0;
    let unitPrice = parseFloat(String(it.unitPrice)) || 0;
    let subTotal = parseFloat(String(it.subTotal)) || 0;
    const hasStored = unitPrice > 0 || subTotal > 0;
    const canFallback = (regionRate ?? 0) > 0 && (minQty ?? 0) > 0;
    if (!hasStored && canFallback) {
      unitPrice = regionRate!;
      const effQty = Math.max(qty, minQty!);
      subTotal = effQty * unitPrice;
    }
    if (subTotal === 0 && qty > 0 && unitPrice > 0) subTotal = qty * unitPrice;
    return {
      qty,
      unitPrice,
      subTotal,
      skuCode: it.skuCode ?? it.skuId,
      description: it.description,
    };
  });

  const tableRows =
    computedLines.length > 0
      ? computedLines
          .map((r, idx) => {
            const lineExcl = r.subTotal;
            const lineTax = lineExcl * effectiveSstRate;
            const lineIncl = lineExcl + lineTax;
            return `<tr>
    <td class="col-no">${idx + 1}</td>
    <td class="col-sku">${escapeHtml(r.skuCode)}</td>
    <td class="col-desc">${escapeHtml(r.description ?? '—')}</td>
    <td class="col-qty">${escapeHtml(String(r.qty))}</td>
    <td class="col-num">${formatRmAmount(r.unitPrice)}</td>
    <td class="col-disc">—</td>
    <td class="col-num">${formatRmAmount(lineExcl)}</td>
    <td class="col-num">${formatRmAmount(lineExcl)}</td>
    <td class="col-num">${formatRmAmount(lineTax)}</td>
    <td class="col-num">${formatRmAmount(lineIncl)}</td>
    <td class="col-rate">${escapeHtml(taxRateLabel)}</td>
  </tr>`;
          })
          .join('\n')
      : `<tr><td class="empty" colspan="10">No items</td></tr>`;

  const lineSubtotalSum = computedLines.reduce((s, l) => s + l.subTotal, 0);

  let totalQty = computedLines.reduce((s, l) => s + l.qty, 0);
  let subtotal = parseFloat(String(invoiceRow.totalExclTax ?? '0')) || 0;
  let taxAmt = parseFloat(String(invoiceRow.taxAmount ?? '0')) || 0;
  let totalIncl = parseFloat(String(invoiceRow.totalInclTax ?? '0')) || 0;

  const hasDbTotals = subtotal > 0 || taxAmt > 0 || totalIncl > 0;

  if (!hasDbTotals && computedLines.length > 0) {
    const sumLines = computedLines.reduce((s, l) => s + l.subTotal, 0);
    subtotal = sumLines;
    taxAmt = sumLines * effectiveSstRate;
    totalIncl = subtotal + taxAmt;
    totalQty = computedLines.reduce((s, l) => s + l.qty, 0);
  }

  if (totalIncl === 0 && subtotal === 0 && taxAmt === 0) {
    const poAmt = parseFloat(String(poRow?.amount ?? invoiceRow.poAmount ?? '0')) || 0;
    if (poAmt > 0) totalIncl = poAmt;
  }

  const docDateSrc = invoiceRow.dateIssued ?? invoiceRow.createdAt;
  const docDate = formatDateDMY(
    docDateSrc instanceof Date ? docDateSrc : new Date(docDateSrc as string | number),
  );

  const poNoRaw = invoiceRow.poNo ?? poRow?.purchaseOrderNo ?? '';
  const poNoDisplay =
    !poNoRaw || poNoRaw === '—' ? '—' : poNoRaw.startsWith('#') ? poNoRaw : `#${poNoRaw}`;

  const logoImgHtml = logoDataUrl ? `<img class="logo" alt="SME logo" src="${logoDataUrl}" />` : '';
  const billingContact = formatAddressContactLines(
    billingSnapshot?.attnName,
    billingSnapshot?.tel,
    billingSnapshot?.fax,
  );
  const deliveryContact = formatAddressContactLines(billingSnapshot?.attnName, undefined, undefined);

  const template = await getProformaInvoiceTemplate();

  const pageNo = invoiceRow.pageNo ?? '1 of 1';

  return renderHtmlTemplate(template, {
    invoiceNoEscaped: escapeHtml(invoiceRow.invoiceNo),
    poNoEscaped: escapeHtml(poNoDisplay),
    doNoEscaped: escapeHtml(invoiceRow.doNo ?? '—'),
    docDateEscaped: escapeHtml(docDate),
    regionNameEscaped: escapeHtml(region?.regionName ?? '—'),

    billingCompanyNameEscaped: escapeHtml(billingSnapshot?.companyName ?? '—'),
    billingAddressHtml: formatBillingAddressHtml(billingSnapshot?.addressText ?? null),
    billingContactHtml: billingContact,

    deliveryCompanyNameEscaped: escapeHtml(outlet?.outletName ?? '—'),
    deliveryAddressHtml: normalizeMultilineAddress(outlet?.address ?? null),
    deliveryContactHtml: deliveryContact,

    customerAccountEscaped: escapeHtml(invoiceRow.customerAccount ?? '—'),
    salesExecutiveEscaped: escapeHtml(invoiceRow.salesExecutive ?? '—'),
    preparedByEscaped: '—',
    pageLabel: escapeHtml(pageNo),

    logoImgHtml,
    tableRowsHtml: tableRows,

    lineSubtotalFmt: formatRmAmount(lineSubtotalSum),
    totalExclTaxFmt: formatRmAmount(subtotal),
    taxAmountFmt: formatRmAmount(taxAmt),
    totalInclTaxFmt: formatRmAmount(totalIncl),
    taxRateLabel: escapeHtml(taxRateLabel),

    descriptionEscaped: escapeHtml(outlet?.outletName ? `${outlet.outletName} DELIVERY ${docDate}` : '—'),
    amountInWordsEscaped: escapeHtml(ringgitToWords(totalIncl)),
    paymentTermsEscaped: '14 DAYS',
    totalQty: String(totalQty),
  });
}

/**
 * Render proforma invoice HTML for a single invoice (one PO / one DO).
 */
export async function renderProformaInvoiceHtml(invoiceId: string, organizationId: string): Promise<string> {
  const row = await loadInvoiceForPdfOrThrow(invoiceId, organizationId);
  return buildProformaInvoiceHtml(row);
}

/**
 * HTML preview for local/dev (GET /document/preview/proforma-invoice). No org check — same pattern as delivery-order preview.
 * @returns `null` if the invoice id does not exist.
 */
export async function renderProformaInvoicePreviewHtml(invoiceId: string): Promise<string | null> {
  const row = await invoicesRepository.getInvoiceById(invoiceId);
  if (!row) return null;
  return buildProformaInvoiceHtml(row);
}

/**
 * Generate an A4 portrait PDF for one proforma invoice. Scoped by organization.
 */
export async function generateProformaInvoicePdf(
  invoiceId: string,
  organizationId: string,
): Promise<{ pdfBase64: string; filename: string }> {
  try {
  logger.info('ℹ️ [documents.service.generateProformaInvoicePdf] Generating proforma PDF for invoice %s', invoiceId);
    const row = await loadInvoiceForPdfOrThrow(invoiceId, organizationId);
    const html = await buildProformaInvoiceHtml(row);
    const pdfBuffer = await htmlToPdf(html, { preferCSSPageSize: true });
    const safeNo = String(row.invoiceNo ?? 'invoice').replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Proforma_${safeNo}_${dateStr}.pdf`;
    return { pdfBase64: pdfBuffer.toString('base64'), filename };
  } catch (error) {
    logger.error('🚨 [documents.service.generateProformaInvoicePdf]', error);
    throw error;
  }
}

/**
 * Convert a RM amount (e.g. 691.65) to the Malaysian cheque wording:
 * "SIX HUNDRED NINETY ONE AND CENTS SIXTY FIVE ONLY"
 */
function ringgitToWords(amount: number): string {
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
    'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

  function below1000(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n]!;
    if (n < 100) return (tens[Math.floor(n / 10)]! + (n % 10 !== 0 ? ' ' + ones[n % 10]! : '')).trim();
    return (ones[Math.floor(n / 100)]! + ' HUNDRED' + (n % 100 !== 0 ? ' ' + below1000(n % 100) : '')).trim();
  }

  function toWords(n: number): string {
    if (n === 0) return 'ZERO';
    let result = '';
    if (n >= 1_000_000) { result += below1000(Math.floor(n / 1_000_000)) + ' MILLION '; n %= 1_000_000; }
    if (n >= 1_000)     { result += below1000(Math.floor(n / 1_000)) + ' THOUSAND '; n %= 1_000; }
    if (n > 0)          { result += below1000(n); }
    return result.trim();
  }

  const rounded = Math.round(amount * 100);
  const ringgit = Math.floor(rounded / 100);
  const cents = rounded % 100;

  const ringgitPart = ringgit > 0 ? toWords(ringgit) : 'ZERO';
  const centsPart = cents > 0 ? ` AND CENTS ${toWords(cents)}` : '';
  return `${ringgitPart}${centsPart} ONLY`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateDMY(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = String(d.getUTCFullYear());
  return `${day}/${month}/${year}`;
}

function normalizeMultilineAddress(address: string | null): string {
  if (!address) return '—';
  const normalized = address.replace(/\\n|\/n/g, '\n');
  return normalized
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br/>');
}

function formatBillingAddressHtml(addressText: string | null): string {
  if (!addressText) return '—';

  const normalized = addressText.replace(/\\n|\/n/g, '\n');

  if (/\r?\n/.test(normalized)) {
    return normalized
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/\s+/g, ' '))
      .map((l) => l.replace(/^,/, '').trim())
      .map((l) => l.replace(/,+$/, '').trim())
      .filter(Boolean)
      .map(escapeHtml)
      .join('<br/>');
  }

  const s = normalized.replace(/\s+/g, ' ').trim().replace(/\s*,\s*/g, ', ');

  const withBreaks = s
    .replace(/\bBLOCK\s*B\b\s*,?/i, (m) => m.replace(/\s*,?$/, '') + '\n')
    .replace(/\bJLN\s+KENARI\s*5\b\s*,?/i, (m) => m.replace(/\s*,?$/, '') + '\n');

  return withBreaks
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br/>');
}

function formatAddressContactLines(
  attn: string | null | undefined,
  tel: string | null | undefined,
  fax: string | null | undefined,
): string {
  const parts: string[] = [];
  parts.push(`<div><b>Attn</b>: ${attn ? escapeHtml(attn) : ''}</div>`);
  parts.push(`<div><b>Tel</b>: ${tel ? escapeHtml(tel) : ''}</div>`);
  parts.push(`<div><b>Fax</b>: ${fax ? escapeHtml(fax) : ''}</div>`);
  return `<div class="box-contact-lines">${parts.join('')}</div>`;
}

async function buildDeliveryOrderHtml(input: {
  doNo: string;
  poNo: string;
  docDate: string;
  regionName: string;
  billingCompanyName: string;
  billingAddressText: string | null;
  billingAttnName: string | null;
  billingTel: string | null;
  billingFax: string | null;

  deliveryCompanyName: string;
  deliveryAddressText: string | null;
  deliveryAttnName?: string | null;
  deliveryTel?: string | null;
  deliveryFax?: string | null;
  logoDataUrl: string | null;
  rows: DeliveryOrderPdfItemRow[];
}): Promise<string> {
  const billingContact = formatAddressContactLines(input.billingAttnName, input.billingTel, input.billingFax);
  const deliveryContact = formatAddressContactLines(
    input.deliveryAttnName ?? input.billingAttnName,
    input.deliveryTel,
    input.deliveryFax,
  );

  const tableRows =
    input.rows.length > 0
      ? input.rows
          .map(
            (r) => `<tr>
    <td class="col-no">${r.index}</td>
    <td class="col-sku">${escapeHtml(r.skuCode)}</td>
    <td class="col-desc">${escapeHtml(r.description)}</td>
    <td class="col-qty">${escapeHtml(r.qty)}</td>
  </tr>`,
          )
          .join('\n')
      : `<tr><td class="empty" colspan="4">No items</td></tr>`;

  const totalQty = input.rows.reduce((sum, r) => sum + (parseInt(r.qty, 10) || 0), 0);

  const template = await getDeliveryOrderTemplate();

  const logoImgHtml = input.logoDataUrl ? `<img class="logo" alt="SME logo" src="${input.logoDataUrl}" />` : '';

  return renderHtmlTemplate(template, {
    doNoEscaped: escapeHtml(input.doNo),
    poNoEscaped: escapeHtml(input.poNo),
    docDateEscaped: escapeHtml(input.docDate),
    regionNameEscaped: escapeHtml(input.regionName),

    billingCompanyNameEscaped: escapeHtml(input.billingCompanyName),
    billingAddressHtml: formatBillingAddressHtml(input.billingAddressText),
    billingContactHtml: billingContact,

    deliveryCompanyNameEscaped: escapeHtml(input.deliveryCompanyName),
    deliveryAddressHtml: normalizeMultilineAddress(input.deliveryAddressText),
    deliveryContactHtml: deliveryContact,

    logoImgHtml,
    tableRowsHtml: tableRows,
    totalQtyEscaped: totalQty.toFixed(2),
  });
}

let cachedBillingSnapshotPromise: Promise<(typeof AddressSnapshotsTable.$inferSelect) | null> | null = null;
async function getDeliveryOrderBillingAddressSnapshot(): Promise<(typeof AddressSnapshotsTable.$inferSelect) | null> {
  if (!cachedBillingSnapshotPromise) {
    cachedBillingSnapshotPromise = (async () => {
      const snapshotId = env.INVOICE_ADDRESS_SNAPSHOT_ID;
      if (!snapshotId) return null;

      const [row] = await db.select().from(AddressSnapshotsTable).where(eq(AddressSnapshotsTable.id, snapshotId)).limit(1);

      return row ?? null;
    })();
  }
  return cachedBillingSnapshotPromise;
}

let cachedDeliveryOrderTemplatePromise: Promise<string> | null = null;
async function getDeliveryOrderTemplate(): Promise<string> {
  if (!cachedDeliveryOrderTemplatePromise) {
    cachedDeliveryOrderTemplatePromise = (async () => {
      const templatePath = path.join(__dirname, 'html', 'delivery-order.html');
      return readFile(templatePath, 'utf8');
    })();
  }
  return cachedDeliveryOrderTemplatePromise;
}

function renderHtmlTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g'), value);
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
