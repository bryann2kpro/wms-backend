import { GrnItemsRepositoryClass } from "./grns-items.repository";
import { GrnsRepositoryClass } from "./grns.repository";
import { SupplierDeliveryItemsRepositoryClass } from "./supplier-deliveries/supplier-delivery-item.repository";
import { SupplierDeliveriesRepositoryClass } from "./supplier-deliveries/supplier-deliveries.repository";
import { logger } from "@/util/logger";
import { db } from "@/db";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import type { DbTransaction } from "@/types/db-transaction";
import { InventoryMovementType } from "../inventory/inventory-movement/inventory.model";
import { InventoryMovementRepositoryClass } from "../inventory/inventory-movement/inventory.repository";
import { GrnItemRacksTable, GrnItemLossRacksTable } from "./grns.model";
import {
  buildGrnItemRackRows,
  buildGrnItemLossRackRows,
  primaryRackIdFromAllocations,
  resolveGrnItemRackAllocations,
  resolveGrnItemLossRackAllocations,
} from "./grn-rack-allocation.util";
import { OrganizationRepositoryClass } from "../master-data/organization.repository";
import { EsAdvanceNoticeRepositoryClass } from "../es/es.repository";
import { SuppliersRepositoryClass } from "../master-data/suppliers.repository";
import { StockUnitRepositoryClass } from "../master-data/stock-unit.repository";

/**
 * Item input for creating a GRN (same shape as CreateGrnItemInput).
 * Provide skuId to use an existing SKU; or skuCode, skuDescription, skuUom to create a new SKU.
 */
export type CreateInboundItemInput = {
    skuId?: string | null;
    qty: string;
    lossQty?: string | null;
    lossRackId?: string | null;
    remarks?: string | null;
    rackId?: string | null;
    rackIds?: string[] | null;
    rackAllocations?: Array<{ rackId: string; quantity: string | number }> | null;
    lossRackAllocations?: Array<{ rackId: string; quantity: string | number }> | null;
    expiryDate?: string | null;
    lotNo?: string | null;
    orderedQty?: string | null;
    skuCode?: string | null;
    skuDescription?: string | null;
    skuUom?: string | null;
};

/**
 * Input for creating an inbound (GRN) – same type and process as createGrn.
 */
export type CreateInboundInput = {
    userId: string;
    organizationId: string;
    grnNo: string;
    supplierId?: string | null;
    supplierDeliveryId?: string | null;
    supplierDeliveryNo?: string | null;
    poNo?: string | null;
    receivedAt?: string | null;
    notes?: string | null;
    proofUrl?: string | null;
    warehouseId?: string | null;
    status?: string | null;
    items?: CreateInboundItemInput[] | null;
    /** ID of the advance notice this GRN was created from. Optional — omit for manual GRNs. */
    advanceNoticeId?: string | null;
    poFulfilled?: boolean | null;
    endUserId?: string | null;
};

export class InboundServices {
    constructor(
        private readonly grnsRepository: GrnsRepositoryClass,
        private readonly skuRepository: SkuRepositoryClass,
        private readonly supplierDeliveriesRepository: SupplierDeliveriesRepositoryClass,
        private readonly supplierDeliveryItemsRepository: SupplierDeliveryItemsRepositoryClass,
        private readonly grnItemsRepository: GrnItemsRepositoryClass,
        private readonly inventoryMovementRepository: InventoryMovementRepositoryClass,
        private readonly suppliersRepository: SuppliersRepositoryClass,
        private readonly stockUnitRepository: StockUnitRepositoryClass,
        private readonly esAdvanceNoticeRepository: EsAdvanceNoticeRepositoryClass,
    ) {}

    /**
     * Create inbound (GRN + items). Same types and process as createGrn:
     * 1. Check duplicate grnNo
     * 2. If supplierDeliveryNo: check duplicate, create supplier delivery, create supplier delivery items from items
     * 3. Create GRN
     * 4. Create GRN items (resolve/create SKU per item, then batch insert)
     */
    async createInbound(data: CreateInboundInput): Promise<boolean> {
        logger.info('ℹ️ [InboundServices.createInbound] Creating inbound...');

        const createdBy = data.userId;
        if (!createdBy) {
            logger.error('❌ [InboundServices.createInbound] User ID is required');
            return false;
        }

        const result = await db.transaction(async (tx: DbTransaction) => {
            try {
                logger.info('ℹ️ [InboundServices.createInbound] Starting Inbound Flow...');

                // Over-receipt enforcement: when this GRN is tied to a PO that has an ASN,
                // reject any line that would push cumulative received qty past the ASN-expected
                // qty. Runs inside the tx so a violation rolls back everything (no GRN, no DO).
                // No ASN for the PO -> skipped entirely (preserves manual-GRN behavior).
                await this.enforceAsnExpectedQuantities(data, tx);

                const resolvedSupplierId = await this.resolveSupplierId(data, tx);

                const updatedBy = createdBy;
                const receivedAt = data.receivedAt != null ? new Date(data.receivedAt) : null;
                const deliveryDate = receivedAt ?? new Date();
                let supplierDeliveryId: string | undefined = data.supplierDeliveryId ?? undefined;
                let advanceNoticeId: string | undefined = data.advanceNoticeId ?? undefined;

                const organizationId = data.organizationId;

                // 2. If supplierDeliveryNo: create supplier delivery + supplier delivery items
                if (data.supplierDeliveryNo) {
                    const existingDo = await this.supplierDeliveriesRepository.getSupplierDeliveries(
                        { supplierDeliveryNo: data.supplierDeliveryNo },
                        { pageSize: 1, pageNumber: 1 }
                    );
                    if (existingDo && existingDo.query?.length > 0) {
                        throw new Error('Repeated supplier delivery number found');
                    }

                    const supplierDelivery = await this.supplierDeliveriesRepository.createSupplierDelivery({
                        organizationId: organizationId,
                        supplierId: resolvedSupplierId,
                        supplierDeliveryNo: data.supplierDeliveryNo,
                        deliveryDate,
                        status: 'RECEIVED_DRAFT',
                        createdBy,
                        updatedBy,
                    }, tx);
                    supplierDeliveryId = supplierDelivery.id;

                    if (data.items?.length) {
                        for (const item of data.items) {
                            const skuIdToUse = await this.resolveOrCreateSkuForItem(item, createdBy, updatedBy, tx);
                            if (!skuIdToUse) continue;
                            await this.supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                supplierDeliveryId: supplierDeliveryId!,
                                skuId: skuIdToUse,
                                qtyDelivered: item.qty,
                                lossQty: item.lossQty ?? '0',
                                createdBy,
                                updatedBy,
                            }, tx);
                        }
                    }
                }

                // generate grn no
                const grnNo = await this.grnsRepository.generateGrnNo(tx);

                if (data.poFulfilled === false && !advanceNoticeId) {
                    advanceNoticeId = await this.resolveManualAdvanceNoticeId(data, tx);
                }

                // 3. Create GRN (same payload as createGrn)
                const grn = await this.grnsRepository.createGrn({
                    grnNo: grnNo,
                    organizationId: organizationId,
                    supplierId: resolvedSupplierId,
                    supplierDeliveryId,
                    poNo: data.poNo ?? undefined,
                    notes: data.notes ?? undefined,
                    proofUrl: data.proofUrl ?? undefined,
                    warehouseId: data.warehouseId ?? undefined,
                    createdBy,
                    updatedBy,
                    status: data.status ?? 'Draft',
                    receivedAt: receivedAt ?? undefined,
                    advanceNoticeId,
                    endUserId: data.endUserId ?? undefined,
                }, tx);

                // 4. Create GRN items (same as createGrn)
                const remainingBySkuCode = data.status === 'Submitted'
                    ? await this.computeRemainingForItems(
                        { poNo: data.poNo, organizationId, items: data.items ?? [] },
                        tx,
                    )
                    : new Map<string, { remainingCtn: number | null; remainingLoosePcs: number | null }>();

                const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; lossRackId?: string | null; remarks?: string; rackId?: string | null; expiryDate?: Date | null; lotNo?: string | null; remainingCtn?: string | null; remainingLoosePcs?: string | null; createdBy: string; updatedBy?: string }> = [];
                if (data.items?.length) {
                    for (const item of data.items) {
                        const skuIdToUse = await this.resolveOrCreateSkuForItem(item, createdBy, updatedBy, tx);
                        if (!skuIdToUse) continue;
                        const allocations = resolveGrnItemRackAllocations(item);
                        const lossAllocations = resolveGrnItemLossRackAllocations(item);
                        const remaining = item.skuCode ? remainingBySkuCode.get(item.skuCode) : undefined;
                        grnItemRows.push({
                            grnId: grn.id,
                            skuId: skuIdToUse,
                            qty: item.qty,
                            lossQty: item.lossQty ?? '0',
                            lossRackId: primaryRackIdFromAllocations(lossAllocations) ?? item.lossRackId ?? null,
                            remarks: item.remarks ?? undefined,
                            rackId: primaryRackIdFromAllocations(allocations) ?? undefined,
                            expiryDate: item.expiryDate != null ? new Date(item.expiryDate) : null,
                            lotNo: item.lotNo ?? null,
                            remainingCtn: remaining?.remainingCtn != null ? String(remaining.remainingCtn) : null,
                            remainingLoosePcs: remaining?.remainingLoosePcs != null ? String(remaining.remainingLoosePcs) : null,
                            createdBy,
                            updatedBy,
                        });
                    }
                    if (grnItemRows.length > 0) {
                        const createdItems = await this.grnItemsRepository.createGrnItems(grnItemRows, tx);
                        if (createdItems.length && data.items) {
                            const rackRows = createdItems.flatMap((createdItem, index) => {
                                const source = data.items![index];
                                if (!source) return [];
                                return buildGrnItemRackRows(createdItem.id, source);
                            });
                            if (rackRows.length > 0) {
                                await tx.insert(GrnItemRacksTable).values(rackRows);
                            }
                            const lossRackRows = createdItems.flatMap((createdItem, index) => {
                                const source = data.items![index];
                                if (!source) return [];
                                return buildGrnItemLossRackRows(createdItem.id, source);
                            });
                            if (lossRackRows.length > 0) {
                                await tx.insert(GrnItemLossRacksTable).values(lossRackRows);
                            }
                        }
                    }
                }

                // Mark the advance notice as linked so it no longer appears in the dropdown
                if (advanceNoticeId) {
                    await this.esAdvanceNoticeRepository.markLinked(advanceNoticeId, grn.id, tx);
                }

                logger.info('✅ [InboundServices.createInbound] Inbound Flow completed successfully');
                return true;
            } catch (error) {
                logger.error('❌ [InboundServices.createInbound] Error:', error);
                throw error;
            }
        });

        if (!result) {
            logger.error('❌ [InboundServices.createInbound] Failed to create inbound');
        } else {
            logger.info('✅ [InboundServices.createInbound] Inbound created successfully');
        }
        return result;
    }

    private async resolveAsnLineUnits(skuUom: string | null | undefined): Promise<string> {
        const raw = skuUom?.trim() ?? '';
        if (!raw) return 'CTN';
        if (InboundServices.UUID_RE.test(raw)) {
            const unit = await this.stockUnitRepository.getStockUnitById(raw);
            return unit?.unitCode?.trim() || 'CTN';
        }
        const byCode = await this.stockUnitRepository.getStockUnitByCode(raw);
        if (byCode?.unitCode) return byCode.unitCode.trim();
        const byCodeUpper = await this.stockUnitRepository.getStockUnitByCode(raw.toUpperCase());
        return byCodeUpper?.unitCode?.trim() || raw;
    }

    private async resolveManualAdvanceNoticeId(data: CreateInboundInput, tx: DbTransaction): Promise<string> {
        const poNo = data.poNo?.trim();
        if (!poNo) {
            throw new Error('PO reference is required for partial delivery.');
        }

        const existing = await this.esAdvanceNoticeRepository.findByTranid(poNo);
        if (existing) return existing.id;

        const items = data.items ?? [];
        const lines = await Promise.all(
            items.map(async (item, index) => {
                const skuCode = item.skuCode?.trim() ?? '';
                const orderedNumber = Number(item.orderedQty);
                return {
                    lineuniquekey: index + 1,
                    itemid: skuCode,
                    quantity: Number.isFinite(orderedNumber) ? orderedNumber : 0,
                    units: await this.resolveAsnLineUnits(item.skuUom),
                };
            }),
        );

        const created = await this.esAdvanceNoticeRepository.createSyntheticAdvanceNotice({
            tranid: poNo,
            payload: {
                tranid: poNo,
                lines,
            },
        }, tx);
        return created.id;
    }

    /**
     * Enforce ASN expected quantities for a PO-linked GRN (over-receipt guard).
     *
     * Formula (matches the standup "remaining = expected − amount created"):
     *   remaining(skuCode) = asnExpected(skuCode) − sumOfPriorGrnReceived(skuCode)
     * and we require: incoming(skuCode) <= remaining(skuCode).
     *
     * Counting policy: ALL prior GRNs against the PO count toward "already created",
     * regardless of their status (Draft, approved, sent, etc.). The ASN payload is the
     * single source of truth for expected qty and keys lines by `itemid` (= skuCode).
     *
     * Behavior:
     *  - No poNo                        -> skip (manual GRN, nothing to validate against).
     *  - poNo set but no ASN exists     -> skip (preserve current no-regression behavior).
     *  - poNo + ASN exists              -> validate every incoming line; throw on the first
     *                                      violation with skuCode/expected/alreadyReceived/
     *                                      remaining/incoming details.
     *
     * @param excludeGrnId  When validating an UPDATE to an existing GRN, pass that GRN's id
     *                      so its current items are excluded from the prior-received sum
     *                      (the incoming quantities replace them).
     */
    private async enforceAsnExpectedQuantities(
        data: Pick<CreateInboundInput, 'poNo' | 'items' | 'organizationId'>,
        tx: DbTransaction,
        excludeGrnId?: string,
    ): Promise<void> {
        const poNo = data.poNo?.trim();
        if (!poNo) return; // manual GRN — no PO to validate against

        if (!data.items?.length) return;

        // 1. Find the ASN for this PO. ASN.tranid === PO number. No ASN -> skip enforcement.
        const asn = await this.esAdvanceNoticeRepository.findByTranid(poNo);
        if (!asn) {
            logger.info(`ℹ️ [InboundServices.enforceAsnExpectedQuantities] No ASN for poNo=${poNo} — skipping over-receipt enforcement`);
            return;
        }

        // 2. Build expected-qty map per skuCode from the ASN payload lines (itemid = skuCode).
        const payload = asn.payload as { lines?: Array<{ itemid?: string; quantity?: number | string }> } | undefined;
        const expectedBySkuCode = new Map<string, number>();
        for (const line of payload?.lines ?? []) {
            const code = line.itemid?.trim();
            if (!code) continue;
            const qty = Number(line.quantity ?? 0);
            if (!Number.isFinite(qty)) continue;
            expectedBySkuCode.set(code, (expectedBySkuCode.get(code) ?? 0) + qty);
        }
        // ASN has no usable expected lines -> nothing to enforce.
        if (expectedBySkuCode.size === 0) return;

        // 3. Sum incoming qty per skuCode from this request.
        const incomingBySkuCode = new Map<string, number>();
        for (const item of data.items) {
            const code = item.skuCode?.trim();
            if (!code) continue; // items without a skuCode cannot be matched to an ASN line
            const qty = Number(item.qty ?? 0);
            if (!Number.isFinite(qty)) continue;
            incomingBySkuCode.set(code, (incomingBySkuCode.get(code) ?? 0) + qty);
        }
        if (incomingBySkuCode.size === 0) return;

        // 4. Sum already-received qty per skuCode across ALL prior GRNs for this PO
        //    (all statuses count). Exclude the GRN currently being updated, if any.
        const alreadyReceivedBySkuCode = await this.sumPriorGrnReceivedBySkuCode(
            poNo,
            data.organizationId,
            tx,
            excludeGrnId,
        );

        // 5. Validate each incoming skuCode against remaining = expected − alreadyReceived.
        for (const [skuCode, incoming] of incomingBySkuCode) {
            const expected = expectedBySkuCode.get(skuCode);
            if (expected === undefined) continue; // not on the ASN — not governed by it
            const alreadyReceived = alreadyReceivedBySkuCode.get(skuCode) ?? 0;
            const remaining = expected - alreadyReceived;
            if (incoming > remaining) {
                throw new Error(
                    `Over-receipt blocked for SKU ${skuCode} on PO ${poNo}: ` +
                    `expected ${expected}, already received ${alreadyReceived}, ` +
                    `remaining ${remaining}, attempted to receive ${incoming}.`,
                );
            }
        }
    }

    /**
     * Sum received quantity per skuCode across all prior GRNs for a PO.
     * All GRN statuses count toward the total (over-receipt policy). When excludeGrnId is
     * provided, that GRN's items are omitted (used by the update path so the GRN being
     * edited does not double-count against itself).
     */
    private async sumPriorGrnReceivedBySkuCode(
        poNo: string,
        organizationId: string,
        tx: DbTransaction,
        excludeGrnId?: string,
    ): Promise<Map<string, number>> {
        const result = new Map<string, number>();

        // All GRNs for the PO (no status filter -> every status is included).
        const grnsResult = await this.grnsRepository.getGrns({ poNo }, undefined, organizationId);
        const grns = grnsResult && 'query' in grnsResult ? grnsResult.query : [];
        if (!grns.length) return result;

        // Collect all prior GRN items, then resolve their skuId -> skuCode in one batch.
        const totalsBySkuId = new Map<string, number>();
        for (const grn of grns) {
            if (excludeGrnId && grn.id === excludeGrnId) continue;
            const items = await this.grnItemsRepository.getGrnItems({ grnId: grn.id }, tx);
            if (!items) continue;
            for (const item of items) {
                const qty = Number(item.qty ?? 0);
                if (!Number.isFinite(qty)) continue;
                totalsBySkuId.set(item.skuId, (totalsBySkuId.get(item.skuId) ?? 0) + qty);
            }
        }
        if (totalsBySkuId.size === 0) return result;

        const skuIds = [...totalsBySkuId.keys()];
        const skuResult = await this.skuRepository.getSku({ skuId: skuIds }, undefined, tx);
        const codeBySkuId = new Map<string, string>();
        for (const sku of skuResult.query as Array<{ skuId: string; skuCode: string }>) {
            codeBySkuId.set(sku.skuId, sku.skuCode);
        }

        for (const [skuId, qty] of totalsBySkuId) {
            const code = codeBySkuId.get(skuId);
            if (!code) continue;
            result.set(code, (result.get(code) ?? 0) + qty);
        }
        return result;
    }

    /**
     * Sum received qty AND loss qty per skuCode across all prior GRNs for a PO.
     * Same counting policy as {@link sumPriorGrnReceivedBySkuCode} (all statuses count,
     * excludeGrnId omits the GRN being edited so it doesn't double-count against itself) —
     * kept separate so the over-receipt enforcement above is untouched.
     */
    private async sumPriorGrnReceivedAndLossBySkuCode(
        poNo: string,
        organizationId: string,
        tx: DbTransaction,
        excludeGrnId?: string,
    ): Promise<Map<string, { qty: number; lossQty: number }>> {
        const result = new Map<string, { qty: number; lossQty: number }>();

        const grnsResult = await this.grnsRepository.getGrns({ poNo }, undefined, organizationId);
        const grns = grnsResult && 'query' in grnsResult ? grnsResult.query : [];
        if (!grns.length) return result;

        const totalsBySkuId = new Map<string, { qty: number; lossQty: number }>();
        for (const grn of grns) {
            if (excludeGrnId && grn.id === excludeGrnId) continue;
            const items = await this.grnItemsRepository.getGrnItems({ grnId: grn.id }, tx);
            if (!items) continue;
            for (const item of items) {
                const qty = Number(item.qty ?? 0);
                const lossQty = Number(item.lossQty ?? 0);
                const prev = totalsBySkuId.get(item.skuId) ?? { qty: 0, lossQty: 0 };
                totalsBySkuId.set(item.skuId, {
                    qty: prev.qty + (Number.isFinite(qty) ? qty : 0),
                    lossQty: prev.lossQty + (Number.isFinite(lossQty) ? lossQty : 0),
                });
            }
        }
        if (totalsBySkuId.size === 0) return result;

        const skuIds = [...totalsBySkuId.keys()];
        const skuResult = await this.skuRepository.getSku({ skuId: skuIds }, undefined, tx);
        const codeBySkuId = new Map<string, string>();
        for (const sku of skuResult.query as Array<{ skuId: string; skuCode: string }>) {
            codeBySkuId.set(sku.skuId, sku.skuCode);
        }

        for (const [skuId, totals] of totalsBySkuId) {
            const code = codeBySkuId.get(skuId);
            if (!code) continue;
            const prev = result.get(code) ?? { qty: 0, lossQty: 0 };
            result.set(code, { qty: prev.qty + totals.qty, lossQty: prev.lossQty + totals.lossQty });
        }
        return result;
    }

    /**
     * Compute the "remaining qty owed" snapshot for each item being submitted on a
     * PO/ASN-linked GRN — see po-fulfillment design: remaining = (expected − cumulative
     * delivered) expressed as whole CTN + loose pieces via the SKU's loose_quantity, with
     * loss added back in (lost pieces still count as owed). Manual GRNs (no poNo) or lines
     * not on the ASN simply get { remainingCtn: null, remainingLoosePcs: null }.
     *
     * Throws when a line has cumulative loss > 0 but its SKU has no loose_quantity set —
     * the caller (grns.resolvers.ts) should let this reject the submission.
     *
     * @param excludeGrnId  Pass the GRN's own id when re-submitting an existing GRN (its
     *                      current items are excluded from the prior-received sum).
     */
    async computeRemainingForItems(
        data: {
            poNo?: string | null;
            organizationId: string;
            items: Array<{ skuCode?: string | null; qty: string | number; lossQty?: string | number | null }>;
        },
        tx: DbTransaction,
        excludeGrnId?: string,
    ): Promise<Map<string, { remainingCtn: number | null; remainingLoosePcs: number | null }>> {
        const result = new Map<string, { remainingCtn: number | null; remainingLoosePcs: number | null }>();

        const poNo = data.poNo?.trim();
        if (!poNo) return result; // manual GRN — nothing to compute against

        const asn = await this.esAdvanceNoticeRepository.findByTranid(poNo, tx);
        if (!asn) return result; // no ASN for this PO — not applicable

        const payload = asn.payload as { lines?: Array<{ itemid?: string; quantity?: number | string }> } | undefined;
        const expectedBySkuCode = new Map<string, number>();
        for (const line of payload?.lines ?? []) {
            const code = line.itemid?.trim();
            if (!code) continue;
            const qty = Number(line.quantity ?? 0);
            if (!Number.isFinite(qty)) continue;
            expectedBySkuCode.set(code, (expectedBySkuCode.get(code) ?? 0) + qty);
        }
        if (expectedBySkuCode.size === 0) return result;

        const thisSubmissionBySkuCode = new Map<string, { qty: number; lossQty: number }>();
        for (const item of data.items) {
            const code = item.skuCode?.trim();
            if (!code) continue;
            const qty = Number(item.qty ?? 0);
            const lossQty = Number(item.lossQty ?? 0);
            const prev = thisSubmissionBySkuCode.get(code) ?? { qty: 0, lossQty: 0 };
            thisSubmissionBySkuCode.set(code, {
                qty: prev.qty + (Number.isFinite(qty) ? qty : 0),
                lossQty: prev.lossQty + (Number.isFinite(lossQty) ? lossQty : 0),
            });
        }
        if (thisSubmissionBySkuCode.size === 0) return result;

        const priorBySkuCode = await this.sumPriorGrnReceivedAndLossBySkuCode(
            poNo,
            data.organizationId,
            tx,
            excludeGrnId,
        );

        const skuCodes = [...thisSubmissionBySkuCode.keys()];
        const skuResult = await this.skuRepository.getSku({ skuCode: skuCodes }, undefined, tx);
        const looseQtyBySkuCode = new Map<string, number | null>();
        for (const sku of skuResult.query as Array<{ skuCode: string; looseQuantity?: string | number | null }>) {
            const lq = sku.looseQuantity != null ? Number(sku.looseQuantity) : null;
            looseQtyBySkuCode.set(sku.skuCode, lq != null && Number.isFinite(lq) && lq > 0 ? lq : null);
        }

        for (const [skuCode, thisSubmission] of thisSubmissionBySkuCode) {
            const expectedCtn = expectedBySkuCode.get(skuCode);
            if (expectedCtn === undefined) continue; // not on the ASN — leave unset

            const prior = priorBySkuCode.get(skuCode) ?? { qty: 0, lossQty: 0 };
            const cumulativeCtn = prior.qty + thisSubmission.qty;
            const cumulativeLoss = prior.lossQty + thisSubmission.lossQty;
            const looseQuantity = looseQtyBySkuCode.get(skuCode) ?? null;

            if (cumulativeLoss > 0 && looseQuantity == null) {
                throw new Error(
                    `Cannot compute remaining qty for SKU ${skuCode}: loss qty recorded but ` +
                    `the SKU has no loose_quantity (pieces per carton) configured.`,
                );
            }

            // Mixed-radix subtraction: Ordered (whole cartons) minus Delivered (cartons +
            // loose pieces), borrowing between the two via loose_quantity — e.g. Ordered 100
            // CTN, Delivered 40 CTN + 6 loose, loose_quantity 10 -> 1000-406=594 -> 59 CTN + 4.
            const radix = looseQuantity ?? 1;
            const remainingPieces = Math.max(0, (expectedCtn - cumulativeCtn) * radix - cumulativeLoss);
            const remainingCtn = Math.floor(remainingPieces / radix);
            const remainingLoosePcs = remainingPieces % radix;
            result.set(skuCode, { remainingCtn, remainingLoosePcs });
        }

        return result;
    }

    private normalizeSupplierCode(code: string): string {
        return code.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim().toUpperCase();
    }

    private parseSupplierEntity(entityRaw: string): { codeCandidates: string[]; nameCandidate: string } {
        const entity = entityRaw.trim();
        if (!entity) {
            return { codeCandidates: [], nameCandidate: '' };
        }

        const match = entity.match(/^([A-Za-z]{2,10})\s*-\s*([A-Za-z0-9]+)\s*(.*)$/);
        if (!match) {
            return { codeCandidates: [], nameCandidate: entity };
        }

        const prefix = match[1].toUpperCase();
        const identifier = match[2].toUpperCase();
        const rest = match[3]?.trim() ?? '';
        const compact = `${prefix}-${identifier}`;
        const spaced = `${prefix} -${identifier}`;

        return {
            codeCandidates: [...new Set([compact, spaced, this.normalizeSupplierCode(spaced)])],
            nameCandidate: rest || entity,
        };
    }

    private async resolveSupplierId(data: CreateInboundInput, tx: DbTransaction): Promise<string> {
        const organizationId = data.organizationId;
        const actor = data.userId;

        if (data.supplierId) {
            const existingSupplier = await this.suppliersRepository.getSupplierById(data.supplierId, organizationId);
            if (existingSupplier) {
                logger.info(`[InboundServices.resolveSupplierId] Matched supplier by input id: ${data.supplierId}`);
                return existingSupplier.supplierId;
            }
            logger.warn(`[InboundServices.resolveSupplierId] Input supplierId not found in organization: ${data.supplierId}`);
        }

        let asnEntity: string | null = null;
        if (data.advanceNoticeId) {
            const asn = await this.esAdvanceNoticeRepository.findById(data.advanceNoticeId);
            const payload = asn?.payload as { entity?: string } | undefined;
            if (payload?.entity?.trim()) {
                asnEntity = payload.entity.trim();
            }
        }

        if (asnEntity) {
            const { codeCandidates, nameCandidate } = this.parseSupplierEntity(asnEntity);

            for (const supplierCode of codeCandidates) {
                const byCode = await this.suppliersRepository.getSupplier(
                    { supplierCode },
                    { pageSize: 1, pageNumber: 1 },
                    organizationId,
                );
                if (byCode.query?.length) {
                    logger.info(`[InboundServices.resolveSupplierId] matched_by_code supplierCode=${supplierCode}`);
                    return byCode.query[0].supplierId;
                }
            }

            if (nameCandidate) {
                const byName = await this.suppliersRepository.getSupplier(
                    { supplierName: nameCandidate },
                    { pageSize: 5, pageNumber: 1 },
                    organizationId,
                );
                const exactName = byName.query?.find(
                    (s) => s.supplierName.trim().toUpperCase() === nameCandidate.trim().toUpperCase(),
                );
                if (exactName) {
                    logger.info(`[InboundServices.resolveSupplierId] matched_by_name supplierName=${exactName.supplierName}`);
                    return exactName.supplierId;
                }
            }

            const supplierCodeForCreate =
                codeCandidates[0] ||
                `AUTO-${Date.now()}`;
            const supplierNameForCreate = nameCandidate || asnEntity;
            const created = await this.suppliersRepository.createSupplier(
                {
                    organizationId,
                    supplierCode: this.normalizeSupplierCode(supplierCodeForCreate),
                    supplierName: supplierNameForCreate,
                    createdBy: actor,
                    updatedBy: actor,
                },
                tx,
            );
            logger.info(`[InboundServices.resolveSupplierId] created_from_asn_entity supplierId=${created.supplierId}`);
            return created.supplierId;
        }

        if (process.env.DEFAULT_SUPPLIER_ID) {
            logger.info(`[InboundServices.resolveSupplierId] fallback_env supplierId=${process.env.DEFAULT_SUPPLIER_ID}`);
            return process.env.DEFAULT_SUPPLIER_ID;
        }

        throw new Error('Unable to resolve supplierId. Provide supplierId or select an ASN with a valid entity.');
    }

    /**
     * Resolve SKU by skuId, then by skuCode lookup, then auto-create if enough data is present.
     * UOM text labels (e.g. "Ea", "Ctn") are resolved to stock_unit UUIDs automatically.
     */
    private async resolveOrCreateSkuForItem(
        item: CreateInboundItemInput,
        createdBy: string,
        updatedBy: string,
        tx: DbTransaction
    ): Promise<string | null> {
        // 1. Try by explicit skuId
        if (item.skuId) {
            const existingSku = await this.skuRepository.getSkuById(item.skuId, tx);
            if (existingSku) return existingSku.skuId;
        }

        // 2. Try by skuCode lookup (prevents duplicates when frontend couldn't resolve skuId)
        if (item.skuCode) {
            const byCode = await this.skuRepository.getSku({ skuCode: item.skuCode }, undefined, tx);
            if (byCode.query?.length) {
                logger.info(`[InboundServices.resolveOrCreateSkuForItem] matched_by_code skuCode=${item.skuCode}`);
                return byCode.query[0].skuId;
            }
        }

        // 3. Auto-create: need at minimum skuCode; fall back to skuCode as description when skuDescription is blank
        if (item.skuCode) {
            const descriptionToUse = item.skuDescription?.trim() || item.skuCode;
            const resolvedUom = await this.resolveSkuUom(item.skuUom ?? null);
            if (!resolvedUom) {
                logger.error('[InboundServices] Cannot create SKU — no valid UOM could be resolved', { skuCode: item.skuCode, skuUom: item.skuUom });
                return null;
            }
            try {
                const newSku = await this.skuRepository.createSku({
                    skuCode: item.skuCode,
                    skuDescription: descriptionToUse,
                    skuUom: resolvedUom,
                    isActive: true,
                    createdBy,
                    updatedBy,
                } as Parameters<typeof this.skuRepository.createSku>[0], tx);
                logger.info(`[InboundServices.resolveOrCreateSkuForItem] created_sku skuId=${newSku.skuId} skuCode=${item.skuCode}`);
                return newSku.skuId;
            } catch (err) {
                logger.error('[InboundServices] Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
            }
        }

        logger.error('[InboundServices] SKU not found and cannot create', { item });
        return null;
    }

    private static readonly UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    /**
     * Resolve a skuUom value to a valid stock_unit UUID.
     * If it's already a UUID, return as-is. If it's a text label (e.g. "Ea"), look up by unitCode.
     * Falls back to the first active stock unit in the system.
     */
    private async resolveSkuUom(skuUom: string | null): Promise<string | null> {
        if (skuUom && InboundServices.UUID_RE.test(skuUom)) {
            return skuUom;
        }

        if (skuUom) {
            const byCode = await this.stockUnitRepository.getStockUnitByCode(skuUom.trim());
            if (byCode) {
                logger.info(`[InboundServices.resolveSkuUom] matched_by_code unitCode=${skuUom} -> ${byCode.stockUnitId}`);
                return byCode.stockUnitId;
            }
            const byCodeUpper = await this.stockUnitRepository.getStockUnitByCode(skuUom.trim().toUpperCase());
            if (byCodeUpper) {
                logger.info(`[InboundServices.resolveSkuUom] matched_by_code_upper unitCode=${skuUom} -> ${byCodeUpper.stockUnitId}`);
                return byCodeUpper.stockUnitId;
            }
        }

        const fallback = await this.stockUnitRepository.getStockUnit(
            { isActive: true },
            { pageSize: 1, pageNumber: 1 },
        );
        if (fallback.query?.length) {
            logger.info(`[InboundServices.resolveSkuUom] fallback_default unitId=${fallback.query[0].stockUnitId}`);
            return fallback.query[0].stockUnitId;
        }

        logger.error('[InboundServices.resolveSkuUom] No stock units found in system');
        return null;
    }

    // TJ to confirm if this is needed
    async updateInbound(data: any): Promise<boolean> {
        // logger.info('ℹ️ [InboundServices.updateInbound] Updating inbound...');

        // const { userId, inboundQty } = data;
        // if (!userId) {
        //     logger.error('❌ [InboundServices.updateInbound] User ID is required');
        //     return false;
        // }

        return true;
    }
}
