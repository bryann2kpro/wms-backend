import { logger } from '@/util/logger.js';
import { EsRepositoryClass } from './es.repository.js';
import { NetSuiteService } from './netsuite.service.js';
import { GrnItemsRepositoryClass } from '@/features/inbound/grns-items.repository.js';
import { GrnsRepositoryClass } from '@/features/inbound/grns.repository.js';
import { SkuRepositoryClass } from '@/features/master-data/sku.repository.js';
import { SuppliersRepositoryClass } from '@/features/master-data/suppliers.repository.js';
import { SupplierDeliveriesRepositoryClass } from '@/features/inbound/supplier-deliveries/supplier-deliveries.repository.js';
import { GrnType } from '@/features/inbound/grns.model.js';
import { StockUnitRepositoryClass } from '@/features/master-data/stock-unit.repository.js';
import { z } from 'zod';

const ItemReceiptLineSchema = z.object({
  lineuniquekey: z.number().optional(),
  itemid: z.string().min(1),
  quantity: z.number().positive(),
  units: z.string(),
  location: z.string(),
  custcol_abj_grn_linenum: z.number().int().positive(),
  abj_es_supplier_do: z.string().optional(),
  // Lot data is flattened on the line (reverted contract, no nested lots array)
  serialnumbers: z.string().min(1).optional(),
  expirationdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').optional(),
});

const ItemReceiptPayloadSchema = z.object({
  recordType: z.literal('itemreceipt'),
  timeStamp: z.string(),
  externalid: z.string().min(1),
  trandate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  createdfrom: z.string(),
  entity: z.string(),
  lines: z.array(ItemReceiptLineSchema).min(1),
});

export class EsItemReceiptServiceClass {
  constructor(
    private esRepository: EsRepositoryClass,
    private grnItemsRepository: GrnItemsRepositoryClass,
    private grnsRepository: GrnsRepositoryClass,
    private skuRepository: SkuRepositoryClass,
    private suppliersRepository: SuppliersRepositoryClass,
    private supplierDeliveriesRepository: SupplierDeliveriesRepositoryClass,
    private netSuiteService: NetSuiteService,
    private stockUnitRepository: StockUnitRepositoryClass,
  ) {}

  /**
   * Build and send an Item Receipt to NetSuite for an approved GRN.
   * Returns success flag and the raw NS response.
   */
  async sendItemReceipt(grn: GrnType, organizationId: string): Promise<{ success: boolean; nsResponse: unknown }> {
    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Starting — grnNo: ${grn.grnNo}, poNo: ${grn.poNo}`);

    // 1. Fetch GRN items
    const grnItems = await this.grnItemsRepository.getGrnItems({ grnId: grn.id });
    if (!grnItems || grnItems.length === 0) {
      logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] No GRN items found for grnId: ${grn.id}`);
      if (grn.poNo) {
        try {
          await this.esRepository.saveItemReceipt(grn.poNo, grn.advanceNoticeId ?? '', {}, { success: false, error: 'No GRN items found' });
        } catch (saveErr) {
          logger.error('❌ [EsItemReceiptService.sendItemReceipt] Failed to save failure log:', saveErr);
        }
      }
      return { success: false, nsResponse: { error: 'No GRN items found' } };
    }
    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Found ${grnItems.length} GRN items`);

    // 2. Item receipt represents the WHOLE PO (sent only once fully fulfilled) — aggregate
    // quantities across ALL GRNs raised against this PO, and track which supplier-delivery
    // (DO) number each GRN's items came from so each merged line gets only ITS contributing DO(s).
    let aggregatedItems = grnItems;
    const doNoByGrnId = new Map<string, string>();
    if (grn.poNo) {
      const grnsForPoResult = await this.grnsRepository.getGrns({ poNo: grn.poNo }, { pageSize: 100, pageNumber: 1 }, organizationId);
      const grnsForPo = grnsForPoResult && 'query' in grnsForPoResult ? grnsForPoResult.query : [grn];

      const allItems: typeof grnItems = [];
      for (const g of grnsForPo) {
        const items = g.id === grn.id ? grnItems : await this.grnItemsRepository.getGrnItems({ grnId: g.id });
        allItems.push(...(items || []));
      }
      aggregatedItems = allItems;

      const doNoByDeliveryId = new Map<string, string>();
      for (const g of grnsForPo) {
        if (!g.supplierDeliveryId) continue;
        if (!doNoByDeliveryId.has(g.supplierDeliveryId)) {
          const deliveryResult = await this.supplierDeliveriesRepository.getSupplierDeliveries({ id: g.supplierDeliveryId }, undefined, organizationId);
          const deliveryNo = deliveryResult && 'query' in deliveryResult ? deliveryResult.query?.[0]?.supplierDeliveryNo : undefined;
          if (deliveryNo) doNoByDeliveryId.set(g.supplierDeliveryId, deliveryNo);
        }
        const deliveryNo = doNoByDeliveryId.get(g.supplierDeliveryId);
        if (deliveryNo) doNoByGrnId.set(g.id, deliveryNo);
      }
      logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Aggregated ${grnsForPo.length} GRN(s), ${allItems.length} item(s), DO map: ${[...doNoByGrnId.values()].join(',') || 'none'}`);
    }

    // 3. Fetch SKUs for all items
    const skuIds = [...new Set(aggregatedItems.map((i) => i.skuId))];
    const skuResult = await this.skuRepository.getSku({ skuId: skuIds }, undefined, undefined, organizationId);
    const skuMap = new Map(skuResult.query.map((s: { skuId: string; skuCode: string }) => [s.skuId, s]));
    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Fetched ${skuResult.query.length} SKUs`);

    // 3b. Fetch advance notice and build lineuniquekey / lot-tracking maps
    let entity: string | undefined;
    const linekeyByItemId = new Map<string, number>();
    const isLotItemByItemId = new Map<string, boolean>();

    if (grn.poNo) {
      const advanceNotice = await this.esRepository.findByTranid(grn.poNo);
      if (advanceNotice) {
        const noticePayload = advanceNotice.payload as {
          entity?: string;
          lines?: Array<{ itemid: string; lineuniquekey: number; islotitem?: string }>;
        };
        entity = noticePayload.entity;
        const lines = noticePayload.lines ?? [];
        for (const line of lines) {
          linekeyByItemId.set(line.itemid, line.lineuniquekey);
          isLotItemByItemId.set(line.itemid, (line.islotitem ?? '').toUpperCase() === 'T');
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
      const supplierResult = await this.suppliersRepository.getSupplier({ supplierId: grn.supplierId }, {}, organizationId);
      const supplier = supplierResult && 'query' in supplierResult ? supplierResult.query?.[0] : null;
      if (supplier?.supplierName) {
        entity = supplier.supplierName;
        logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Using supplier name as entity fallback: ${entity}`);
      }
    }

    // 4. Fetch UOM unit codes for all SKUs
    const uomIds = [...new Set(skuResult.query.map((s: { skuUom: string }) => s.skuUom).filter(Boolean))];
    const uomMap = new Map<string, string>();
    if (uomIds.length > 0) {
      const uomResult = await this.stockUnitRepository.getStockUnit({ stockUnitId: uomIds }, { pageSize: uomIds.length, pageNumber: 1 }, organizationId);
      for (const unit of uomResult.query) {
        uomMap.set(unit.stockUnitId, unit.unitCode);
      }
      logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Fetched ${uomResult.query.length} UOMs`);
    }

    // 5. Group GRN items by SKU and build Item Receipt lines
    const lines: Array<Record<string, unknown>> = [];
    let lineIndex = 1;
    let unmatchedCount = 0;

    // Group GRN items by skuId
    const itemsBySkuId = new Map<string, typeof grnItems>();
    for (const item of aggregatedItems) {
      const existing = itemsBySkuId.get(item.skuId) ?? [];
      existing.push(item);
      itemsBySkuId.set(item.skuId, existing);
    }

    for (const [skuId, items] of itemsBySkuId) {
      const sku = skuMap.get(skuId) as { skuCode: string; skuUom: string } | undefined;
      if (!sku) {
        logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] SKU not found for skuId: ${skuId} — skipping line`);
        lineIndex++;
        continue;
      }

      const lineUniqueKey = linekeyByItemId.get(sku.skuCode);
      const isLotTracked = isLotItemByItemId.get(sku.skuCode) === true;
      if (lineUniqueKey === undefined) {
        logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] No lineuniquekey match for skuCode: ${sku.skuCode}`);
        unmatchedCount++;
      }
      logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Building line — skuCode: ${sku.skuCode}, lotTracked: ${isLotTracked}`);

      // Reverted contract: lot fields are flattened at line-level.
      let totalQuantity = 0;
      const distinctLots = new Set<string>();
      const lineDoNumbers = new Set<string>();
      let serialnumbers: string | undefined;
      let expirationdate: string | undefined;

      for (const item of items) {
        totalQuantity += Number(item.qty);

        const doNo = doNoByGrnId.get(item.grnId);
        if (doNo) lineDoNumbers.add(doNo);

        if (item.lotNo) {
          distinctLots.add(item.lotNo);

          // Temporary assumption from partner testing: single lot per grouped SKU line.
          if (!serialnumbers) {
            serialnumbers = item.lotNo;
          }

          if (!expirationdate && item.expiryDate) {
            expirationdate = new Date(item.expiryDate).toISOString().split('T')[0];
          }
        }
      }

      const line: Record<string, unknown> = {
        itemid: sku.skuCode,
        quantity: totalQuantity,
        units: uomMap.get(sku.skuUom) ?? '',
        location: 'Distribution Center (DC)',
        custcol_abj_grn_linenum: lineIndex,
      };

      if (isLotTracked && !serialnumbers) {
        const errorMessage = `Lot-tracked ASN line is missing GRN lot_no for skuCode ${sku.skuCode} (GRN ${grn.grnNo}, PO ${grn.poNo ?? 'N/A'})`;
        logger.error(`❌ [EsItemReceiptService.sendItemReceipt] ${errorMessage}`);
        if (grn.poNo) {
          try {
            await this.esRepository.saveItemReceipt(grn.poNo, grn.advanceNoticeId ?? '', {}, { success: false, error: errorMessage });
          } catch (saveErr) {
            logger.error('❌ [EsItemReceiptService.sendItemReceipt] Failed to save failure log:', saveErr);
          }
        }
        return { success: false, nsResponse: { error: errorMessage } };
      }

      if (distinctLots.size > 1) {
        const errorMessage = `Multi-lot payload is temporarily unsupported for skuCode ${sku.skuCode} under reverted IR contract (GRN ${grn.grnNo}, PO ${grn.poNo ?? 'N/A'})`;
        logger.error(`❌ [EsItemReceiptService.sendItemReceipt] ${errorMessage}`);
        if (grn.poNo) {
          try {
            await this.esRepository.saveItemReceipt(grn.poNo, grn.advanceNoticeId ?? '', {}, { success: false, error: errorMessage });
          } catch (saveErr) {
            logger.error('❌ [EsItemReceiptService.sendItemReceipt] Failed to save failure log:', saveErr);
          }
        }
        return { success: false, nsResponse: { error: errorMessage } };
      }

      if (serialnumbers) {
        line.serialnumbers = serialnumbers;
      }
      if (expirationdate) {
        line.expirationdate = expirationdate;
      }

      if (lineUniqueKey !== undefined) {
        line.lineuniquekey = lineUniqueKey;
      }
      if (lineDoNumbers.size > 0) {
        line.abj_es_supplier_do = [...lineDoNumbers].join(',');
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

    logger.info(`ℹ️ [EsItemReceiptService.sendItemReceipt] Payload built — ${lines.length} lines, validating schema`);

    // 7. Validate payload against schema
    const parsed = ItemReceiptPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.error(`❌ [EsItemReceiptService.sendItemReceipt] Payload validation failed — ${errors}`);
      if (grn.poNo) {
        try {
          await this.esRepository.saveItemReceipt(grn.poNo, grn.advanceNoticeId ?? '', payload, { success: false, error: `Payload validation failed: ${errors}` });
        } catch (saveErr) {
          logger.error('❌ [EsItemReceiptService.sendItemReceipt] Failed to save failure log:', saveErr);
        }
      }
      return { success: false, nsResponse: { error: `Payload validation failed: ${errors}` } };
    }

    // 8. POST to NetSuite
    try {
      logger.debug("ℹ️ [EsItemReceiptServiceClass.sendItemReceipt] payload:", );
      console.log("payload: ", payload);
      const nsResult = await this.netSuiteService.postItemReceipt(payload);
      const success = nsResult.status >= 200 && nsResult.status < 300;

      if (success) {
        logger.info(`✅ [EsItemReceiptService.sendItemReceipt] NetSuite accepted — status: ${nsResult.status}`);
      } else {
        logger.error(`❌ [EsItemReceiptService.sendItemReceipt] NetSuite rejected — status: ${nsResult.status}`, nsResult.body);
      }

      if (!grn.poNo) {
        logger.warn(`⚠️ [EsItemReceiptService.sendItemReceipt] GRN has no poNo — cannot save item receipt`);
        return { success: false, nsResponse: { error: 'GRN has no poNo' } };
      }

      await this.esRepository.saveItemReceipt(grn.poNo, grn.advanceNoticeId ?? '', payload, nsResult.body);

      return { success, nsResponse: nsResult.body };
    } catch (error) {
      logger.error('❌ [EsItemReceiptService.sendItemReceipt] HTTP error calling NetSuite:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (grn.poNo) {
        try {
          await this.esRepository.saveItemReceipt(grn.poNo, grn.advanceNoticeId ?? '', payload, { success: false, error: errorMessage });
        } catch (saveErr) {
          logger.error('❌ [EsItemReceiptService.sendItemReceipt] Failed to save failure log:', saveErr);
        }
      }
      return {
        success: false,
        nsResponse: { error: errorMessage },
      };
    }
  }
}
