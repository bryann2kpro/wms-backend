/**
 * Documents Service
 *
 * @description Delivery Order PDF generation (layout without pricing), HTML rendering, and upload.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { deliveryOrdersRepository, outletsRepository, purchaseOrdersRepository, regionRepository, s3Repository } from '@/composition-root';
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
  return address
    .split(/\r?\n|,/)
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
      const templatePath = path.resolve(process.cwd(), 'src', 'features', 'documents', 'html', 'delivery-order.html');
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
