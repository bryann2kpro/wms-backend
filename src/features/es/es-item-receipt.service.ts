import { logger } from '@/util/logger.js';
import { EsAdvanceNoticeRepositoryClass } from './es-advance-notice.repository.js';
import { NetSuiteService } from './netsuite.service.js';
import { GrnItemsRepositoryClass } from '@/features/inbound/grns-items.repository.js';
import { SkuRepositoryClass } from '@/features/master-data/sku.repository.js';
import { SuppliersRepositoryClass } from '@/features/master-data/suppliers.repository.js';
import { SupplierDeliveriesRepositoryClass } from '@/features/inbound/supplier-deliveries/supplier-deliveries.repository.js';
import { GrnType } from '@/features/inbound/grns.model.js';

export class EsItemReceiptServiceClass {
  constructor(
    private esAdvanceNoticeRepository: EsAdvanceNoticeRepositoryClass,
    private grnItemsRepository: GrnItemsRepositoryClass,
    private skuRepository: SkuRepositoryClass,
    private suppliersRepository: SuppliersRepositoryClass,
    private supplierDeliveriesRepository: SupplierDeliveriesRepositoryClass,
    private netSuiteService: NetSuiteService,
  ) {}

  /**
   * Build and send an Item Receipt to NetSuite for an approved GRN.
   * Returns success flag and the raw NS response.
   */
  async sendItemReceipt(grn: GrnType, organizationId: string): Promise<{ success: boolean; nsResponse: unknown }> {
    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Starting — grnNo: ${grn.grnNo}, poNo: ${grn.poNo}`);

    // 1. Fetch GRN items
    const grnItems = await this.grnItemsRepository.getGrnItems({ grnId: grn.id });
    if (!grnItems || grnItems === false || grnItems.length === 0) {
      logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] No GRN items found for grnId: ${grn.id}`);
      return { success: false, nsResponse: { error: 'No GRN items found' } };
    }
    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Found ${grnItems.length} GRN items`);

    // 2. Fetch SKUs for all items
    const skuIds = [...new Set(grnItems.map((i) => i.skuId))];
    const skuResult = await this.skuRepository.getSku({ skuId: skuIds }, undefined, undefined, organizationId);
    const skuMap = new Map(skuResult.query.map((s: { skuId: string; skuCode: string }) => [s.skuId, s]));
    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Fetched ${skuResult.query.length} SKUs`);

    // 3. Fetch advance notice and build lineuniquekey map
    let entity: string | undefined;
    const linekeyByItemId = new Map<string, number>();

    if (grn.poNo) {
      const advanceNotice = await this.esAdvanceNoticeRepository.findByTranid(grn.poNo);
      if (advanceNotice) {
        const noticePayload = advanceNotice.payload as { entity?: string; lines?: Array<{ itemid: string; lineuniquekey: number }> };
        entity = noticePayload.entity;
        const lines = noticePayload.lines ?? [];
        for (const line of lines) {
          linekeyByItemId.set(line.itemid, line.lineuniquekey);
        }
        logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Advance notice found — entity: ${entity}, ${lines.length} lines`);
      } else {
        logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] No advance notice found for poNo: ${grn.poNo}`);
      }
    } else {
      logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] GRN has no poNo — cannot look up advance notice`);
    }

    // Fallback entity: supplier name
    if (!entity && grn.supplierId) {
      const supplierResult = await this.suppliersRepository.getSuppliers({ supplierId: grn.supplierId }, undefined, organizationId);
      const supplier = supplierResult && 'query' in supplierResult ? supplierResult.query?.[0] : null;
      if (supplier?.supplierName) {
        entity = supplier.supplierName;
        logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Using supplier name as entity fallback: ${entity}`);
      }
    }

    // 4. Fetch supplier delivery number (for abj_es_supplier_do)
    let supplierDeliveryNo: string | undefined;
    if (grn.supplierDeliveryId) {
      const deliveryResult = await this.supplierDeliveriesRepository.getSupplierDeliveries(
        { id: grn.supplierDeliveryId },
        undefined,
        organizationId,
      );
      if (deliveryResult && 'query' in deliveryResult && deliveryResult.query?.[0]) {
        supplierDeliveryNo = deliveryResult.query[0].supplierDeliveryNo;
        logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Supplier delivery no: ${supplierDeliveryNo}`);
      }
    }

    // 5. Build Item Receipt lines
    const lines: Array<Record<string, unknown>> = [];
    let lineIndex = 1;
    let unmatchedCount = 0;

    for (const item of grnItems) {
      const sku = skuMap.get(item.skuId) as { skuCode: string } | undefined;
      if (!sku) {
        logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] SKU not found for skuId: ${item.skuId} — skipping line`);
        lineIndex++;
        continue;
      }

      const lineUniqueKey = linekeyByItemId.get(sku.skuCode);
      if (lineUniqueKey === undefined) {
        logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] No lineuniquekey match for skuCode: ${sku.skuCode}`);
        unmatchedCount++;
      }

      const line: Record<string, unknown> = {
        itemid: sku.skuCode,
        location: 'Distribution Center (DC)',
        quantity: Number(item.qty),
        custcol_abj_grn_linenum: lineIndex,
      };

      if (lineUniqueKey !== undefined) {
        line.lineuniquekey = lineUniqueKey;
      }
      if (item.expiryDate) {
        // Format as YYYY-MM-DD
        line.expirationdate = new Date(item.expiryDate).toISOString().split('T')[0];
      }
      if (supplierDeliveryNo) {
        line.abj_es_supplier_do = supplierDeliveryNo;
      }

      lines.push(line);
      lineIndex++;
    }

    if (unmatchedCount > 0) {
      logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] ${unmatchedCount} line(s) missing lineuniquekey — NetSuite may reject`);
    }

    // 6. Build Item Receipt payload
    const trandate = grn.receivedAt
      ? new Date(grn.receivedAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const payload = {
      recordType: 'itemreceipt',
      timeStamp: new Date().toISOString(),
      externalid: grn.grnNo,
      trandate,
      createdfrom: grn.poNo ?? '',
      entity: entity ?? '',
      lines,
    };

    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Payload built — ${lines.length} lines, calling NetSuite`);

    // 7. POST to NetSuite
    try {
      const nsResult = await this.netSuiteService.postItemReceipt(payload);
      const success = nsResult.status >= 200 && nsResult.status < 300;

      if (success) {
        logger.info(`✅ [EsItemReceiptService.sendItemReceipt] NetSuite accepted — status: ${nsResult.status}`);
      } else {
        logger.error(`❌ [EsItemReceiptService.sendItemReceipt] NetSuite rejected — status: ${nsResult.status}`, nsResult.body);
      }

      return { success, nsResponse: nsResult.body };
    } catch (error) {
      logger.error('❌ [EsItemReceiptService.sendItemReceipt] HTTP error calling NetSuite:', error);
      return {
        success: false,
        nsResponse: { error: error instanceof Error ? error.message : String(error) },
      };
    }
  }
}
