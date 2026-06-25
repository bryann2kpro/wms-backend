/**
 * GRN GraphQL Resolvers
 *  
 * @description Resolver functions for GRN (Goods Received Note) operations.
 * Uses GrnsRepository for data access (proper layer separation).
 * 
 * Type definitions are in grns.typeDefs.ts
 */

import { grnsRepository, grnItemsRepository, skuRepository, supplierDeliveriesRepository, supplierDeliveryItemsRepository, authRepository, warehousesRepository, racksRepository, inboundServices, inventoryMovementRepository, esItemReceiptService, esRepository, grnPutawayService, inboundPutawaySuggestionService } from '@/composition-root';
import { db } from '@/db';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { GraphQLError } from 'graphql';
import { GrnType, GrnItemRacksTable, GrnItemLossRacksTable, GrnItemsTable } from './grns.model';
import { RacksTable } from '@/features/master-data/racks.model';
import { eq, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { GrnFilter } from './grns.repository';
import type { GrnItemsType } from './grns-items.repository';
import { InventoryMovementType } from '../inventory/inventory-movement/inventory.model';
import type { EsAdvanceNoticeType } from '@/features/es/es.model';
import type { PaginationMeta } from '@/features/rbac/rbac.model';
import { recordGrnApprovalStockQuants } from './grn-stock-quant.service';
import {
    assertGrnItemRackAllocations,
    assertGrnItemLossRackAllocations,
    buildGrnItemRackRows,
    buildGrnItemLossRackRows,
    primaryRackIdFromAllocations,
    resolveGrnItemRackAllocations,
    resolveGrnItemLossRackAllocations,
    type GrnItemRackInput,
} from './grn-rack-allocation.util';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformGrn(grn: GrnType) {
    return {
        id: grn.id,
        organizationId: grn.organizationId,
        grnNo: grn.grnNo,
        supplierId: grn.supplierId,
        supplierDeliveryId: grn.supplierDeliveryId,
        advanceNoticeId: grn.advanceNoticeId ?? null,
        poNo: grn.poNo,
        status: grn.status,
        receivedAt: grn.receivedAt,
        approvedBy: grn.approvedBy,
        approvedAt: grn.approvedAt,
        notes: grn.notes ?? null,
        proofUrl: grn.proofUrl ?? null,
        warehouseId: grn.warehouseId ?? null,
        endUserId: grn.endUserId ?? null,
        nsError: grn.nsError ? JSON.stringify(grn.nsError) : null,
        nsSentAt: grn.nsSentAt ?? null,
        createdAt: grn.createdAt,
        updatedAt: grn.updatedAt,
        createdBy: grn.createdBy,
        updatedBy: grn.updatedBy,
    }
}

function transformGrnItem(
    item: GrnItemsType,
    skuMap?: Map<string, { skuCode: string | null; skuDescription: string | null }>,
    rackMap?: Map<string, Array<{ rackId: string; quantity: number | null; rackLabel: string | null }>>,
    lossRackMap?: Map<string, Array<{ rackId: string; quantity: number | null; rackLabel: string | null }>>,
) {
    const sku = skuMap?.get(item.skuId);
    const rackLinks = rackMap?.get(item.id) ?? [];
    const rackIds = rackLinks.length > 0
        ? rackLinks.map((link) => link.rackId)
        : (item.rackId ? [item.rackId] : []);
    let rackAllocations = rackLinks
        .filter((link) => link.quantity != null && link.quantity > 0)
        .map((link) => ({
            rackId: link.rackId,
            quantity: link.quantity as number,
            rackLabel: link.rackLabel ?? null,
        }));
    if (rackAllocations.length === 0 && rackLinks.length > 0) {
        const resolved = resolveGrnItemRackAllocations({
            qty: item.qty,
            lossQty: item.lossQty,
            rackIds: rackLinks.map((link) => link.rackId),
        });
        const labelByRackId = new Map(rackLinks.map((link) => [link.rackId, link.rackLabel]));
        rackAllocations = resolved.map((row) => ({
            rackId: row.rackId,
            quantity: row.quantity,
            rackLabel: labelByRackId.get(row.rackId) ?? null,
        }));
    }
    const primaryRackId = rackIds[0] ?? null;

    const lossRackLinks = lossRackMap?.get(item.id) ?? [];
    let lossRackAllocations = lossRackLinks
        .filter((link) => link.quantity != null && link.quantity > 0)
        .map((link) => ({
            rackId: link.rackId,
            quantity: link.quantity as number,
            rackLabel: link.rackLabel ?? null,
        }));
    if (lossRackAllocations.length === 0 && lossRackLinks.length > 0) {
        const resolved = resolveGrnItemLossRackAllocations({
            qty: item.qty,
            lossQty: item.lossQty,
            lossRackId: lossRackLinks[0]?.rackId ?? null,
        });
        lossRackAllocations = resolved.map((row) => ({
            rackId: row.rackId,
            quantity: row.quantity,
            rackLabel: lossRackLinks.find((link) => link.rackId === row.rackId)?.rackLabel ?? null,
        }));
    }
    const primaryLossRackId = lossRackAllocations[0]?.rackId ?? (item as any).lossRackId ?? null;

    return {
        id: item.id,
        grnId: item.grnId,
        skuId: item.skuId,
        skuCode: sku?.skuCode ?? null,
        skuDescription: sku?.skuDescription ?? null,
        qty: item.qty,
        lossQty: item.lossQty ?? '0',
        lossRackId: primaryLossRackId,
        remarks: item.remarks,
        rackId: primaryRackId,
        rackIds,
        rackAllocations,
        lossRackAllocations,
        expiryDate: (item as any).expiryDate?.toISOString?.() ?? (item as any).expiryDate ?? null,
        lotNo: (item as any).lotNo ?? null,
        remainingCtn: (item as any).remainingCtn != null ? Number((item as any).remainingCtn) : null,
        remainingLoosePcs: (item as any).remainingLoosePcs != null ? Number((item as any).remainingLoosePcs) : null,
        createdAt: item.createdAt?.toISOString?.() ?? item.createdAt,
        updatedAt: item.updatedAt?.toISOString?.() ?? item.updatedAt,
        createdBy: item.createdBy,
        updatedBy: item.updatedBy,
    };
}

type CreateInboundResolverItemInput = {
    skuId?: string | null;
    skuCode?: string | null;
    qty?: string | null;
    orderedQty?: string | null;
    lotNo?: string | null;
    expiryDate?: string | null;
};

async function assertSkuLotExpiryControls(
    items: CreateInboundResolverItemInput[] | null | undefined,
    organizationId?: string,
) {
    if (!items?.length) return;

    for (const item of items) {
        let sku: Awaited<ReturnType<typeof skuRepository.getSkuById>> | null = null;
        if (item.skuId) {
            sku = await skuRepository.getSkuById(item.skuId, undefined, organizationId);
        } else if (item.skuCode?.trim()) {
            const result = await skuRepository.getSku(
                { skuCode: item.skuCode.trim() },
                { pageSize: 1, pageNumber: 1 },
                undefined,
                organizationId,
            );
            sku = result.query[0] ?? null;
        }
        if (!sku) continue;

        const label = sku.skuCode ?? item.skuCode ?? 'SKU';
        if (sku.isLotControlled && !(item.lotNo ?? '').trim()) {
            throw new GraphQLError(`${label} requires a lot number.`, {
                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
            });
        }
        if (sku.isExpiryControlled && !(item.expiryDate ?? '').trim()) {
            throw new GraphQLError(`${label} requires an expiry date.`, {
                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
            });
        }
    }
}

async function insertGrnItemRackRows(
    createdItems: GrnItemsType[],
    sourceItems: GrnItemRackInput[],
    tx: import('@/types/db-transaction').DbTransaction,
): Promise<void> {
    const rackRows: Array<{ grnItemId: string; rackId: string; quantity: string }> = [];
    createdItems.forEach((createdItem, index) => {
        const source = sourceItems[index];
        if (!source) return;
        rackRows.push(...buildGrnItemRackRows(createdItem.id, source));
    });
    if (rackRows.length > 0) {
        await tx.insert(GrnItemRacksTable).values(rackRows);
    }
}

async function insertGrnItemLossRackRows(
    createdItems: GrnItemsType[],
    sourceItems: GrnItemRackInput[],
    tx: import('@/types/db-transaction').DbTransaction,
): Promise<void> {
    const lossRackRows: Array<{ grnItemId: string; rackId: string; quantity: string }> = [];
    createdItems.forEach((createdItem, index) => {
        const source = sourceItems[index];
        if (!source) return;
        lossRackRows.push(...buildGrnItemLossRackRows(createdItem.id, source));
    });
    if (lossRackRows.length > 0) {
        await tx.insert(GrnItemLossRacksTable).values(lossRackRows);
    }
}

async function assertLotTrackedAsnItemsHaveLotAndExpiry(input: {
    advanceNoticeId?: string | null;
    items?: CreateInboundResolverItemInput[] | null;
}) {
    if (!input.advanceNoticeId) return;

    const asn = await esRepository.findById(input.advanceNoticeId);
    if (!asn) {
        throw new GraphQLError('Advance notice not found.', {
            extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
        });
    }

    const payload = asn.payload as {
        lines?: Array<{ itemid?: string; islotitem?: string }>;
    } | null;
    const lotTrackedItemIds = new Set(
        (payload?.lines ?? [])
            .filter((line) => (line.islotitem ?? '').trim().toUpperCase() === 'T')
            .map((line) => (line.itemid ?? '').trim())
            .filter(Boolean),
    );
    if (lotTrackedItemIds.size === 0) return;

    const itemList = input.items ?? [];
    const invalidLotTrackedSkus = [...lotTrackedItemIds].filter((itemId) => {
        const matchingItems = itemList.filter(
            (item) => (item.skuCode ?? '').trim() === itemId,
        );
        if (matchingItems.length === 0) return true;
        return matchingItems.some(
            (item) => !(item.lotNo ?? '').trim() || !(item.expiryDate ?? '').trim(),
        );
    });

    if (invalidLotTrackedSkus.length > 0) {
        throw new GraphQLError(
            `Lot-tracked ASN items require both lotNo and expiryDate: ${invalidLotTrackedSkus.join(', ')}`,
            {
                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
            },
        );
    }
}

function assertPartialDeliveryInputs(input: {
    poFulfilled?: boolean | null;
    poNo?: string | null;
    items?: CreateInboundResolverItemInput[] | null;
}) {
    if (input.poFulfilled !== false) return;

    if (!input.poNo?.trim()) {
        throw new GraphQLError('PO reference is required for partial delivery.', {
            extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
        });
    }

    if (!input.items?.length) {
        throw new GraphQLError('Line items are required for partial delivery.', {
            extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
        });
    }

    input.items.forEach((item, index) => {
        const label = item.skuCode?.trim() || `line ${index + 1}`;
        const orderedRaw = item.orderedQty?.trim();
        if (!orderedRaw) {
            throw new GraphQLError(`Ordered quantity is required for ${label}.`, {
                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
            });
        }
        const orderedQty = Number(orderedRaw);
        const receivedQty = Number(item.qty ?? 0);
        if (!Number.isFinite(orderedQty) || orderedQty < receivedQty) {
            throw new GraphQLError(`Ordered quantity for ${label} must be greater than or equal to received quantity.`, {
                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
            });
        }
    });
}

type EsAdvanceNoticePayload = {
    tranid: string;
    entity?: string;
    duedate?: string;
    source?: string;
    lines?: Array<{
        lineuniquekey: number;
        itemid: string;
        displayname?: string;
        quantity: number;
        units: string;
        custrecord_r2o_order_code?: string;
        islotitem?: string;
        lots?: Array<{
            serialNumbers: string;
            quantity: number;
            expiryDate: string;
        }>;
    }>;
};

/** Map a stored ES advance-notice record to the GraphQL AdvanceNotice shape. */
function mapAdvanceNoticeRecord(
    r: { id: string; tranid: string; receivedAt: Date | string; payload: unknown },
    fulfillmentStatus: 'PENDING' | 'PARTIAL' = 'PENDING',
) {
    const p = r.payload as EsAdvanceNoticePayload;
    return {
        id: r.id,
        tranid: p.tranid ?? r.tranid,
        entity: p.entity ?? '',
        duedate: p.duedate ?? '',
        receivedAt: r.receivedAt instanceof Date ? r.receivedAt.toISOString() : r.receivedAt,
        fulfillmentStatus,
        lines: (p.lines ?? []).map((l) => {
            const firstLot = l.lots?.[0];
            const lotSerial =
                firstLot &&
                typeof firstLot.serialNumbers === 'string' &&
                firstLot.serialNumbers.trim()
                    ? firstLot.serialNumbers.trim()
                    : null;
            const lotExpiry =
                firstLot &&
                typeof firstLot.expiryDate === 'string' &&
                firstLot.expiryDate.trim()
                    ? firstLot.expiryDate.trim()
                    : null;
            return {
                lineuniquekey: l.lineuniquekey,
                itemid: l.itemid,
                displayname: l.displayname ?? null,
                quantity: l.quantity,
                units: l.units,
                custrecord_r2o_order_code: l.custrecord_r2o_order_code ?? null,
                islotitem: l.islotitem ?? null,
                lotNo: lotSerial,
                expiryDate: lotExpiry,
            };
        }),
    };
}

/**
 * Compute whether a PO's linked ASN is fully received yet, by summing qty across
 * ALL GRNs raised against that poNo (resolving skuId -> skuCode the same way
 * listPendingAdvanceNotices does) and comparing against each ASN line's expected qty.
 *
 * Returns fullyFulfilled = true when there is no linked ASN (manual GRN — nothing to
 * enforce, preserves existing behaviour) or when every line's received >= expected.
 */
async function computePoFulfillment(poNo: string | null | undefined): Promise<{
    asn: EsAdvanceNoticeType | null;
    fullyFulfilled: boolean;
    shortfalls: Array<{ skuCode: string; expected: number; received: number }>;
}> {
    if (!poNo) return { asn: null, fullyFulfilled: true, shortfalls: [] };

    const asn = await esRepository.findByTranid(poNo);
    if (!asn) return { asn: null, fullyFulfilled: true, shortfalls: [] };

    const payload = asn.payload as EsAdvanceNoticePayload;
    const lines = payload.lines ?? [];
    if (lines.length === 0) return { asn, fullyFulfilled: true, shortfalls: [] };

    const grnsForPo = await grnsRepository.getGrns({ poNo }, { pageSize: 100, pageNumber: 1 });
    const grnList = grnsForPo && 'query' in grnsForPo ? grnsForPo.query : [];

    const receivedByskuId = new Map<string, number>();
    for (const grn of grnList) {
        const items = await grnItemsRepository.getGrnItems({ grnId: grn.id });
        for (const item of items || []) {
            receivedByskuId.set(item.skuId, (receivedByskuId.get(item.skuId) ?? 0) + Number(item.qty || 0));
        }
    }

    let receivedBySku = new Map<string, number>();
    if (receivedByskuId.size > 0) {
        const skuResult = await skuRepository.getSku({ skuId: [...receivedByskuId.keys()] }, undefined, undefined, undefined);
        receivedBySku = new Map(
            skuResult.query.map((s: { skuId: string; skuCode: string }) => [s.skuCode, receivedByskuId.get(s.skuId) ?? 0]),
        );
    }

    const shortfalls: Array<{ skuCode: string; expected: number; received: number }> = [];
    for (const line of lines) {
        const received = receivedBySku.get(line.itemid) ?? 0;
        if (line.quantity - received > 0) {
            shortfalls.push({ skuCode: line.itemid, expected: line.quantity, received });
        }
    }

    return { asn, fullyFulfilled: shortfalls.length === 0, shortfalls };
}

/**
 * True when Send to ES must be hidden for this GRN.
 * Hide unless the End User PO has a real ASN ingested from ES (NetSuite) — not a
 * synthetic/manual ASN (payload.source = 'manual' or missing apiKeyId).
 */
function isRealEsAdvanceNotice(record: { apiKeyId: string | null; payload: unknown }): boolean {
    const payload = record.payload as EsAdvanceNoticePayload;
    if (payload.source === 'manual') return false;
    return record.apiKeyId != null;
}

async function isManualInboundGrn(parent: {
    id: string;
    advanceNoticeId?: string | null;
    poNo?: string | null;
}): Promise<boolean> {
    if (!parent.poNo?.trim()) return true;

    const asn = await esRepository.findByTranid(parent.poNo.trim());
    if (!asn) return true;

    return !isRealEsAdvanceNotice(asn);
}

function paginateMappedAdvanceNotices<T>(
    items: T[],
    pageSize: number,
    pageNumber: number,
): { query: T[]; pagination: PaginationMeta } {
    const totalCount = items.length;
    const offset = (pageNumber - 1) * pageSize;
    const slice = items.slice(offset, offset + pageSize);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    return {
        query: slice,
        pagination: {
            count: slice.length,
            totalCount,
            currentPage: pageNumber,
            totalPages,
            hasNextPage: pageNumber < totalPages,
            hasPrevPage: pageNumber > 1,
        },
    };
}

/** Linked ASNs that still have qty outstanding against their PO lines. */
async function filterPartialLinkedAdvanceNotices(
    records: EsAdvanceNoticeType[],
): Promise<EsAdvanceNoticeType[]> {
    const partial: EsAdvanceNoticeType[] = [];
    for (const record of records) {
        const payload = record.payload as EsAdvanceNoticePayload;
        const lines = payload.lines ?? [];
        if (lines.length === 0) continue;

        const grnsForPo = await grnsRepository.getGrns({ poNo: record.tranid }, { pageSize: 100, pageNumber: 1 });
        const grnList = grnsForPo && 'query' in grnsForPo ? grnsForPo.query : [];

        const receivedByskuId = new Map<string, number>();
        for (const grn of grnList) {
            const items = await grnItemsRepository.getGrnItems({ grnId: grn.id });
            for (const item of items || []) {
                receivedByskuId.set(item.skuId, (receivedByskuId.get(item.skuId) ?? 0) + Number(item.qty || 0));
            }
        }

        let receivedBySku = new Map<string, number>();
        if (receivedByskuId.size > 0) {
            const skuResult = await skuRepository.getSku({ skuId: [...receivedByskuId.keys()] }, undefined, undefined, undefined);
            receivedBySku = new Map(
                skuResult.query.map((s: { skuId: string; skuCode: string }) => [s.skuCode, receivedByskuId.get(s.skuId) ?? 0]),
            );
        }

        const hasOutstandingQty = lines.some((l) => l.quantity - (receivedBySku.get(l.itemid) ?? 0) > 0);
        if (hasOutstandingQty) {
            partial.push(record);
        }
    }
    return partial;
}

export const resolvers = {
    Query: {
        grnRemainingReport: async (_: unknown, __: unknown, context: GraphQLContext) => {
            const rows = await grnItemsRepository.getRemainingItems(context.organizationId ?? '');
            return rows.map((row) => ({
                grnId: row.grnId,
                grnNo: row.grnNo,
                poNo: row.poNo ?? null,
                receivedAt: row.receivedAt?.toISOString?.() ?? row.receivedAt ?? null,
                supplierName: row.supplierName ?? null,
                endUserName: row.endUserName ?? null,
                skuCode: row.skuCode,
                skuDescription: row.skuDescription,
                remainingCtn: row.remainingCtn != null ? Number(row.remainingCtn) : null,
                remainingLoosePcs: row.remainingLoosePcs != null ? Number(row.remainingLoosePcs) : null,
            }));
        },
        grns: async (_: unknown, args: {
            filter?: GrnFilter & { page?: number; pageSize?: number; pageNumber?: number };
            pageSize?: number;
            pageNumber?: number;
        }, context: GraphQLContext) => {
            try {
                const organizationId = context.organizationId;
                const filter: GrnFilter = args.filter || {};
                if (args.filter) {
                    if (args.filter.id) {
                        filter.id = args.filter.id
                    };
                    if (args.filter.grnNo) {
                        filter.grnNo = args.filter.grnNo;
                    };
                    if (args.filter.poNo) {
                        filter.poNo = args.filter.poNo;
                    };
                    if (args.filter.search != null) {
                        filter.search = args.filter.search;
                    };
                    if (args.filter.status) {
                        filter.status = args.filter.status;
                    };
                    if (args.filter.excludeDraft === true) {
                        filter.excludeDraft = true;
                    }
                    if (args.filter.sortBy != null) {
                        filter.sortBy = args.filter.sortBy;
                    };
                    if (args.filter.sortOrder != null) {
                        filter.sortOrder = args.filter.sortOrder;
                    };
                }
                const pageSize = args.pageSize ?? args.filter?.pageSize;
                const pageNumber = args.pageNumber ?? args.filter?.pageNumber ?? args.filter?.page;
                let paginationParams;
                if (pageSize != null && pageNumber != null) {
                    paginationParams = { pageSize, pageNumber };
                } else {
                    paginationParams = undefined;
                }
                const result = await grnsRepository.getGrns(filter, paginationParams, organizationId ?? undefined);
                if (result === false) return false;
                return {
                    query: result.query.map(transformGrn),
                    pagination: result.pagination,
                };
            } catch (error) {
                logger.error('[grns.resolvers] Error:', error);
                return false;
            }
        },
        nextGrnNumber: async (_: unknown, args: { date?: string | null }, context: GraphQLContext) => {
            try {
                const baseDate = args.date ? new Date(args.date) : new Date();
                if (Number.isNaN(baseDate.getTime())) {
                    throw new GraphQLError('Invalid date format for nextGrnNumber', {
                        extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                    });
                }
                return await grnsRepository.getNextGrnNoForDate(baseDate, context.organizationId ?? undefined);
            } catch (error) {
                logger.error('[grns.resolvers] nextGrnNumber Error:', error);
                throw error;
            }
        },
        listPendingAdvanceNotices: async (
            _: unknown,
            args: { search?: string | null; pageSize?: number | null; pageNumber?: number | null },
        ) => {
            try {
                const search = args.search?.trim() || undefined;
                const pageSize = args.pageSize ?? 20;
                const pageNumber = args.pageNumber ?? 1;

                if (search) {
                    const [pendingRecords, linkedCandidates] = await Promise.all([
                        esRepository.findPendingFiltered(search),
                        esRepository.findLinkedFiltered(search),
                    ]);
                    const partialRecords = await filterPartialLinkedAdvanceNotices(linkedCandidates);
                    const merged = [
                        ...pendingRecords.map((r) => mapAdvanceNoticeRecord(r, 'PENDING')),
                        ...partialRecords.map((r) => mapAdvanceNoticeRecord(r, 'PARTIAL')),
                    ];
                    merged.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
                    return paginateMappedAdvanceNotices(merged, pageSize, pageNumber);
                }

                const page = await esRepository.findPendingPaginated({ pageSize, pageNumber });
                return {
                    query: page.query.map((r) => mapAdvanceNoticeRecord(r, 'PENDING')),
                    pagination: page.pagination,
                };
            } catch (error) {
                logger.error('[grns.resolvers] listPendingAdvanceNotices Error:', error);
                throw error;
            }
        },
        advanceNoticeByPoNo: async (_: unknown, args: { poNo: string }) => {
            try {
                const record = await esRepository.findByTranid(args.poNo);
                return record ? mapAdvanceNoticeRecord(record) : null;
            } catch (error) {
                logger.error('[grns.resolvers] advanceNoticeByPoNo Error:', error);
                throw error;
            }
        },
        suggestInboundRack: async (
            _: unknown,
            args: {
                skuId?: string | null;
                skuCode?: string | null;
                quantity: number;
                forRackId?: string | null;
            },
            context: GraphQLContext,
        ) => {
            if (!context.organizationId) {
                throw new GraphQLError('Organization context is required', {
                    extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
                });
            }
            const suggestion = await inboundPutawaySuggestionService.suggestRack({
                organizationId: context.organizationId,
                skuId: args.skuId,
                skuCode: args.skuCode,
                quantity: args.quantity,
                forRackId: args.forRackId,
            });
            return suggestion;
        },
        suggestInboundPutawayPlan: async (
            _: unknown,
            args: {
                skuId?: string | null;
                skuCode?: string | null;
                quantity: number;
                forRackId?: string | null;
                excludeRackIds?: string[] | null;
            },
            context: GraphQLContext,
        ) => {
            if (!context.organizationId) {
                throw new GraphQLError('Organization context is required', {
                    extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
                });
            }
            return inboundPutawaySuggestionService.suggestPutawayPlan({
                organizationId: context.organizationId,
                skuId: args.skuId,
                skuCode: args.skuCode,
                quantity: args.quantity,
                forRackId: args.forRackId,
                excludeRackIds: args.excludeRackIds,
            });
        },
        listRacksWithCapacity: async (
            _: unknown,
            args: {
                skuId?: string | null;
                skuCode?: string | null;
                quantity: number;
                excludeRackIds?: string[] | null;
            },
            context: GraphQLContext,
        ) => {
            if (!context.organizationId) {
                throw new GraphQLError('Organization context is required', {
                    extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
                });
            }
            return inboundPutawaySuggestionService.listRacksWithCapacity({
                organizationId: context.organizationId,
                skuId: args.skuId,
                skuCode: args.skuCode,
                quantity: args.quantity,
                excludeRackIds: args.excludeRackIds,
            });
        },
    },
    Grn: {
        createdByUser: async (parent: { createdBy?: string | null }) => {
            if (!parent.createdBy) return null;
            const user = await authRepository.getUserById(parent.createdBy);
            return user ? { id: user.id, displayName: user.displayName } : null;
        },
        updatedByUser: async (parent: { updatedBy?: string | null }) => {
            if (!parent.updatedBy) return null;
            const user = await authRepository.getUserById(parent.updatedBy);
            return user ? { id: user.id, displayName: user.displayName } : null;
        },
        supplierDeliveryNo: async (parent: { supplierDeliveryId?: string | null }) => {
            if (!parent.supplierDeliveryId) return null;
            const result = await supplierDeliveriesRepository.getSupplierDeliveries(
                { id: parent.supplierDeliveryId },
                { pageSize: 1, pageNumber: 1 }
            );
            if (result === false || !result.query?.[0]) return null;
            return result.query[0].supplierDeliveryNo ?? null;
        },
        warehouse: async (parent: { warehouseId?: string | null }) => {
            if (!parent.warehouseId) return null;
            const warehouse = await warehousesRepository.getWarehouseById(parent.warehouseId);
            if (!warehouse) return null;
            return {
                warehouseId: warehouse.warehouseId,
                warehouseName: warehouse.warehouseName,
                warehouseCode: warehouse.warehouseCode ?? null,
                warehouseAddress: warehouse.warehouseAddress ?? null,
                createdAt: warehouse.createdAt?.toISOString?.() ?? warehouse.createdAt,
                updatedAt: warehouse.updatedAt?.toISOString?.() ?? warehouse.updatedAt,
                createdBy: warehouse.createdBy,
                updatedBy: warehouse.updatedBy,
            };
        },
        items: async (parent: { id: string }) => {
            const result = await grnItemsRepository.getGrnItems({ grnId: parent.id });
            if (result === false) return [];
            const skuIds = [...new Set(result.map((r) => r.skuId))];
            let skuMap = new Map<string, { skuCode: string | null; skuDescription: string | null }>();
            if (skuIds.length > 0) {
                const skuResult = await skuRepository.getSku({ skuId: skuIds });
                for (const s of skuResult.query) {
                    skuMap.set(s.skuId, { skuCode: s.skuCode ?? null, skuDescription: s.skuDescription ?? null });
                }
            }

            const grnItemIds = result.map((r) => r.id);
            let rackMap = new Map<string, Array<{ rackId: string; quantity: number | null; rackLabel: string | null }>>();
            if (grnItemIds.length > 0) {
                const rackLinks = await db
                    .select({
                        grnItemId: GrnItemRacksTable.grnItemId,
                        rackId: GrnItemRacksTable.rackId,
                        rackRow: RacksTable.rackRow,
                        rackLevel: RacksTable.rackLevel,
                        rackColumn: RacksTable.rackColumn,
                    })
                    .from(GrnItemRacksTable)
                    .leftJoin(RacksTable, eq(GrnItemRacksTable.rackId, RacksTable.rackId))
                    .where(inArray(GrnItemRacksTable.grnItemId, grnItemIds));
                for (const link of rackLinks) {
                    const rackLabel = link.rackRow && link.rackLevel && link.rackColumn
                        ? `${link.rackRow}-${link.rackLevel}-${link.rackColumn}`
                        : null;
                    const current = rackMap.get(link.grnItemId) ?? [];
                    current.push({
                        rackId: link.rackId,
                        quantity: null,
                        rackLabel,
                    });
                    rackMap.set(link.grnItemId, current);
                }
            }

            let lossRackMap = new Map<string, Array<{ rackId: string; quantity: number | null; rackLabel: string | null }>>();
            if (grnItemIds.length > 0) {
                const lossRackLinks = await db
                    .select({
                        grnItemId: GrnItemLossRacksTable.grnItemId,
                        rackId: GrnItemLossRacksTable.rackId,
                        quantity: GrnItemLossRacksTable.quantity,
                        rackRow: RacksTable.rackRow,
                        rackLevel: RacksTable.rackLevel,
                        rackColumn: RacksTable.rackColumn,
                    })
                    .from(GrnItemLossRacksTable)
                    .leftJoin(RacksTable, eq(GrnItemLossRacksTable.rackId, RacksTable.rackId))
                    .where(inArray(GrnItemLossRacksTable.grnItemId, grnItemIds));
                for (const link of lossRackLinks) {
                    const rackLabel = link.rackRow && link.rackLevel && link.rackColumn
                        ? `${link.rackRow}-${link.rackLevel}-${link.rackColumn}`
                        : null;
                    const current = lossRackMap.get(link.grnItemId) ?? [];
                    current.push({
                        rackId: link.rackId,
                        quantity: link.quantity != null ? Number(link.quantity) : null,
                        rackLabel,
                    });
                    lossRackMap.set(link.grnItemId, current);
                }
            }

            return result.map((item) => transformGrnItem(item, skuMap, rackMap, lossRackMap));
        },
        /**
         * Whether this GRN's PO/ASN is fully received yet — drives the "Send to ES"
         * button's visibility (a partially-fulfilled PO is guaranteed to be rejected
         * by NetSuite, see computePoFulfillment). Returns null when there's nothing
         * to enforce (no linked ASN / not yet approved) so the UI treats it as sendable.
         */
        poFulfilled: async (parent: { status?: string | null; poNo?: string | null }) => {
            if (parent.status !== 'Approved') return null;
            const fulfillment = await computePoFulfillment(parent.poNo);
            if (!fulfillment.asn) return null;
            return fulfillment.fullyFulfilled;
        },
        manualInbound: async (parent: ReturnType<typeof transformGrn>) => isManualInboundGrn(parent),
    },
    GrnItem: {
        rack: async (parent: { rackId?: string | null }) => {
            if (!parent.rackId) return null;
            const rack = await racksRepository.getRackById(parent.rackId);
            if (!rack) return null;
            return {
                rackId: rack.rackId,
                rackRow: rack.rackRow,
                rackColumn: rack.rackColumn,
                rackLevel: rack.rackLevel,
                createdAt: rack.createdAt?.toISOString?.() ?? rack.createdAt,
                updatedAt: rack.updatedAt?.toISOString?.() ?? rack.updatedAt,
                createdBy: rack.createdBy,
                updatedBy: rack.updatedBy,
            };
        },
    },
    Mutation: {
        createInbound: async (_: unknown, { input }: { input: {
            userId: string;
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
            items?: Array<{ skuId?: string | null; qty: string; lossQty?: string | null; lossRackId?: string | null; remarks?: string | null; rackId?: string | null; rackIds?: string[] | null; orderedQty?: string | null; expiryDate?: string | null; lotNo?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
            advanceNoticeId?: string | null;
            poFulfilled?: boolean | null;
            endUserId?: string | null;
        } }, context: GraphQLContext) => {
            try {
                assertPartialDeliveryInputs({
                    poFulfilled: input.poFulfilled,
                    poNo: input.poNo,
                    items: input.items,
                });
                await assertLotTrackedAsnItemsHaveLotAndExpiry({
                    advanceNoticeId: input.advanceNoticeId,
                    items: input.items,
                });
                assertGrnItemRackAllocations(input.items);
                assertGrnItemLossRackAllocations(input.items);
                await assertSkuLotExpiryControls(input.items, context.organizationId ?? undefined);
                const result = await inboundServices.createInbound({
                    userId: input.userId,
                    organizationId: context.organizationId!,
                    grnNo: input.grnNo,
                    supplierId: input.supplierId,
                    supplierDeliveryId: input.supplierDeliveryId,
                    supplierDeliveryNo: input.supplierDeliveryNo,
                    poNo: input.poNo,
                    receivedAt: input.receivedAt,
                    notes: input.notes,
                    proofUrl: input.proofUrl,
                    warehouseId: input.warehouseId,
                    status: input.status,
                    items: input.items ?? undefined,
                    advanceNoticeId: input.advanceNoticeId ?? undefined,
                    poFulfilled: input.poFulfilled ?? undefined,
                    endUserId: input.endUserId ?? undefined,
                });
                return result;
            } catch (error) {
                logger.error('[grns.resolvers.createInbound] Error:', error);
                throw error;
            }
        },
        createGrn: withAudit(
            {
                entity: 'GRN',
                action: 'CREATE',
                getEntityId: (result: GrnType | false | null): string | null =>
                    result && typeof result === 'object' && 'id' in result ? result.id : null,
            },
            async (_: unknown, { input }: {
                input: {
                    grnNo: string;
                    supplierId?: string | null;
                    supplierDeliveryId?: string | null;
                    supplierDeliveryNo?: string | null;
                    poNo?: string | null;
                    receivedAt?: string | null;
                    notes?: string | null;
                    proofUrl?: string | null;
                    warehouseId?: string | null;
                    approvedBy?: string | null;
                    status?: string | null;
                    createdBy: string;
                    updatedBy?: string | null;  
                    items?: Array<{ skuId?: string | null; qty: string; lossQty?: string | null; lossRackId?: string | null; remarks?: string | null; rackId?: string | null; rackIds?: string[] | null; expiryDate?: string | null; lotNo?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
                }
            }, context: GraphQLContext) => {
                try {
                    const createdBy = input.createdBy ?? context.user?.id;
                    if (!createdBy) {
                        throw new Error('createdBy is required (or provide an authenticated user)');
                    }
                    const receivedAt = input.receivedAt != null ? new Date(input.receivedAt) : null;
                    const deliveryDate = receivedAt ?? new Date();
                    const updatedBy = context.user?.id ?? undefined;
                    // for testing purpose,
                    const supplierId = 'b3e317c5-4bec-49aa-82f3-0a83115a8e70';

                    let supplierDeliveryId: string | undefined = input.supplierDeliveryId ?? undefined;

                    // Check for duplicate GRN code before creating
                    const existingResult = await grnsRepository.getGrns(
                        { grnNo: input.grnNo },
                        { pageSize: 1, pageNumber: 1 },
                        context.organizationId ?? undefined
                    );
                    if (existingResult && existingResult.query?.length > 0) {
                        throw new GraphQLError('Repeated GRN code found', {
                            extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                        });
                    }

                    assertGrnItemRackAllocations(input.items);
                    assertGrnItemLossRackAllocations(input.items);
                    await assertSkuLotExpiryControls(
                        input.items,
                        context.organizationId ?? undefined,
                    );

                    if (input.supplierDeliveryNo) {
                        const existingDo = await supplierDeliveriesRepository.getSupplierDeliveries(
                            { supplierDeliveryNo: input.supplierDeliveryNo },
                            { pageSize: 1, pageNumber: 1 }
                        );
                        if (existingDo && existingDo.query?.length > 0) {
                            throw new GraphQLError('Repeated supplier delivery number found', {
                                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                            });
                        }
                        const supplierDelivery = await supplierDeliveriesRepository.createSupplierDelivery({
                            organizationId: context.organizationId ?? '',
                            supplierId,
                            supplierDeliveryNo: input.supplierDeliveryNo,
                            deliveryDate,
                            status: 'RECEIVED_DRAFT',
                            createdBy,
                            updatedBy: updatedBy ?? createdBy,
                        }, context.tx); // TJ: this context.tx is empty!
                        supplierDeliveryId = supplierDelivery.id;

                        if (!supplierDeliveryId) {
                            logger.error('[grns.resolvers]: Failed to create supplier delivery');
                            return false;
                        }

                        // 2. Resolve SKUs and create Supplier Delivery Items (qtyDelivered = item qty)
                        if (input.items?.length) {
                            for (const item of input.items) {
                                let skuIdToUse: string | null = null;
                                if (item.skuId) {
                                    const existingSku = await skuRepository.getSkuById(item.skuId);
                                    if (existingSku) skuIdToUse = existingSku.skuId;
                                }
                                if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
                                    try {
                                        const newSku = await skuRepository.createSku({
                                            skuCode: item.skuCode,
                                            skuDescription: item.skuDescription,
                                            skuUom: item.skuUom,
                                            isActive: true,
                                            createdBy,
                                            updatedBy: updatedBy ?? createdBy,
                                        } as Parameters<typeof skuRepository.createSku>[0], context.tx);
                                        skuIdToUse = newSku.skuId;
                                    } catch (err) {
                                        logger.error('[grns.resolvers]: Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
                                    }
                                }
                                if (!skuIdToUse) {
                                    logger.error('[grns.resolvers]: SKU not found and cannot create', { item });
                                    continue;
                                }
                                await supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                    supplierDeliveryId,
                                    skuId: skuIdToUse,
                                    qtyDelivered: item.qty,
                                    lossQty: item.lossQty ?? '0',
                                    createdBy,
                                    updatedBy: updatedBy ?? createdBy,
                                }, context.tx);
                            }
                        }
                    }
                    // 3. Create GRN (with supplierDeliveryId when supplierDeliveryNo was provided)
                    const grn = await grnsRepository.createGrn({
                        grnNo: input.grnNo,
                        supplierId,
                        supplierDeliveryId,
                        poNo: input.poNo ?? undefined,
                        notes: input.notes ?? undefined,
                        proofUrl: input.proofUrl ?? undefined,
                        warehouseId: input.warehouseId ?? undefined,
                        createdBy,
                        updatedBy,
                        status: input.status ?? 'Draft',
                        receivedAt,
                        organizationId: context.organizationId ?? '',
                    }, context.tx);

                    // 4. Create GRN items
                    const finalStatus = input.status ?? 'Draft';
                    const remainingBySkuCode = finalStatus === 'Submitted' && context.tx
                        ? await inboundServices.computeRemainingForItems(
                            {
                                poNo: input.poNo,
                                organizationId: context.organizationId ?? '',
                                items: input.items ?? [],
                            },
                            context.tx,
                        )
                        : new Map<string, { remainingCtn: number | null; remainingLoosePcs: number | null }>();

                    const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; lossRackId?: string | null; remarks?: string; rackId?: string | null; expiryDate?: Date | null; lotNo?: string | null; remainingCtn?: string | null; remainingLoosePcs?: string | null; createdBy: string; updatedBy?: string }> = [];
                    if (input.items?.length) {
                        for (const item of input.items) {
                            let skuIdToUse: string | null = null;
                            if (item.skuId) {
                                const existingSku = await skuRepository.getSkuById(item.skuId);
                                if (existingSku) skuIdToUse = existingSku.skuId;
                            }
                            if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
                                try {
                                    const newSku = await skuRepository.createSku({
                                        skuCode: item.skuCode,
                                        skuDescription: item.skuDescription,
                                        skuUom: item.skuUom,
                                        isActive: true,
                                        createdBy,
                                        updatedBy: updatedBy ?? createdBy,
                                    } as Parameters<typeof skuRepository.createSku>[0], context.tx);
                                    skuIdToUse = newSku.skuId;
                                } catch (err) {
                                    logger.error('[grns.resolvers]: Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
                                }
                            }
                            if (!skuIdToUse) {
                                logger.error('[grns.resolvers]: SKU not found and cannot create', { item });
                                continue;
                            }
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
                        const createdItems = await grnItemsRepository.createGrnItems(grnItemRows, context.tx);
                        if (createdItems.length && input.items && context.tx) {
                            await insertGrnItemRackRows(createdItems, input.items, context.tx);
                            await insertGrnItemLossRackRows(createdItems, input.items, context.tx);
                        }
                    }

                    return transformGrn(grn);
                } catch (error) {
                    logger.error('[grns.resolvers] createGrn Error:', error);
                    throw error;
                }
            }
        ),

        updateGrn: withAudit(
            {
                entity: 'GRN',
                action: 'UPDATE',
                getEntityId: (_, args) => args.id,
                getOldData: async (args, context) => {
                    const result = await grnsRepository.getGrns(
                        { id: args.id },
                        undefined,
                        context.organizationId ?? undefined,
                    );
                    const previous = result && 'query' in result ? result.query?.[0] : null;
                    return previous ? transformGrn(previous) : null;
                },
            },
            async (_: unknown, { id, input }: {
                id: string; input: {
                    grnNo?: string | null;
                    supplierId?: string | null;
                    supplierDeliveryId?: string | null;
                    supplierDeliveryNo?: string | null;
                    poNo?: string | null;
                    receivedAt?: string | null;
                    notes?: string | null;
                    proofUrl?: string | null;
                    warehouseId?: string | null;
                    approvedBy?: string | null;
                    approvedAt?: string | null;
                    status?: string | null;
                    updatedBy?: string | null;
                    updatedAt?: Date;
                    items?: Array<{ skuId?: string | null; qty: string; lossQty?: string | null; lossRackId?: string | null; remarks?: string | null; rackId?: string | null; rackIds?: string[] | null; expiryDate?: string | null; lotNo?: string | null; skuCode?: string | null; skuDescription?: string | null; skuUom?: string | null }> | null;
                }
            }, context: GraphQLContext) => {
                try {
                    const updatedBy = input.updatedBy ?? context.user?.id;
                    if (!updatedBy) {
                        logger.error('[grns.resolvers]: Data updated failed caused by user not found.');
                        return false;
                    }

                    const grnResult = await grnsRepository.getGrns({ id }, undefined, context.organizationId ?? undefined);
                    const existingGrn = (grnResult && 'query' in grnResult && grnResult.query?.[0]) ? grnResult.query[0] : null;
                    if (!existingGrn) {
                        logger.error('[grns.resolvers]: GRN not found', { id });
                        return false;
                    }

                    if (input.items?.length) {
                        assertGrnItemRackAllocations(input.items);
                        assertGrnItemLossRackAllocations(input.items);
                        await assertSkuLotExpiryControls(
                            input.items,
                            context.organizationId ?? undefined,
                        );
                    }

                    if (input.grnNo != null && input.grnNo !== existingGrn.grnNo) {
                        const existingResult = await grnsRepository.getGrns(
                            { grnNo: input.grnNo },
                            { pageSize: 1, pageNumber: 1 },
                            context.organizationId ?? undefined
                        );
                        const existingByGrnNo = existingResult && existingResult.query?.[0];
                        if (existingByGrnNo && existingByGrnNo.id !== id) {
                            throw new GraphQLError('Repeated GRN code found', {
                                extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
                            });
                        }
                    }

                    const updateData: Record<string, unknown> = { updatedBy };
                    if (input.grnNo !== undefined) updateData.grnNo = input.grnNo;
                    if (input.supplierId !== undefined) updateData.supplierId = input.supplierId;
                    if (input.supplierDeliveryId !== undefined) updateData.supplierDeliveryId = input.supplierDeliveryId;
                    if (input.poNo !== undefined) updateData.poNo = input.poNo;
                    if (input.receivedAt !== undefined) updateData.receivedAt = input.receivedAt != null ? new Date(input.receivedAt) : null;
                    if (input.approvedBy !== undefined) updateData.approvedBy = input.approvedBy;
                    if (input.approvedAt !== undefined) updateData.approvedAt = input.approvedAt != null ? new Date(input.approvedAt) : null;
                    if (input.status !== undefined) updateData.status = input.status;
                    if (input.notes !== undefined) updateData.notes = input.notes;
                    if (input.proofUrl !== undefined) updateData.proofUrl = input.proofUrl;
                    if (input.warehouseId !== undefined) updateData.warehouseId = input.warehouseId;

                    const deliveryDate = input.receivedAt != null ? new Date(input.receivedAt) : undefined;
                    let supplierDeliveryId: string | null = existingGrn.supplierDeliveryId ?? null;

                    // Create or update Supplier Delivery (supplierDeliveryNo and deliveryDate from receivedAt)
                    if (input.supplierDeliveryNo != null) {
                        if (supplierDeliveryId) {
                            const deliveryUpdate: Record<string, unknown> = { updatedBy, updatedAt: new Date() };
                            deliveryUpdate.supplierDeliveryNo = input.supplierDeliveryNo;
                            if (deliveryDate != null) deliveryUpdate.deliveryDate = deliveryDate;
                            await supplierDeliveriesRepository.updateSupplierDelivery(supplierDeliveryId, deliveryUpdate, context.tx);
                        } else {
                            const supplierId = (input.supplierId ?? existingGrn.supplierId) as string;
                            const created = await supplierDeliveriesRepository.createSupplierDelivery({
                                organizationId: context.organizationId ?? '',
                                supplierId,
                                supplierDeliveryNo: input.supplierDeliveryNo,
                                deliveryDate: deliveryDate ?? new Date(),
                                status: 'RECEIVED_DRAFT',
                                createdBy: updatedBy,
                                updatedBy,
                            }, context.tx);
                            supplierDeliveryId = created.id;
                            updateData.supplierDeliveryId = created.id;
                        }
                    } else if (supplierDeliveryId && deliveryDate != null) {
                        await supplierDeliveriesRepository.updateSupplierDelivery(supplierDeliveryId, {
                            deliveryDate,
                            updatedBy,
                            updatedAt: new Date(),
                        }, context.tx);
                    }

                    // Replace GRN items and sync Supplier Delivery Items (skuId, qtyDelivered = item qty)
                    if (input.items != null && input.items.length > 0) {
                        const createdBy = existingGrn.createdBy;
                        const grnItemRows: Array<{ grnId: string; skuId: string; qty: string; lossQty?: string; lossRackId?: string | null; remarks?: string; rackId?: string | null; expiryDate?: Date | null; lotNo?: string | null; remainingCtn?: string | null; remainingLoosePcs?: string | null; createdBy: string; updatedBy?: string }> = [];

                        const finalStatus = input.status !== undefined ? input.status : existingGrn.status;
                        const finalPoNo = input.poNo !== undefined ? input.poNo : existingGrn.poNo;
                        const remainingBySkuCode = finalStatus === 'Submitted' && context.tx
                            ? await inboundServices.computeRemainingForItems(
                                {
                                    poNo: finalPoNo,
                                    organizationId: context.organizationId ?? existingGrn.organizationId ?? '',
                                    items: input.items,
                                },
                                context.tx,
                                id,
                            )
                            : new Map<string, { remainingCtn: number | null; remainingLoosePcs: number | null }>();

                        for (const item of input.items) {
                            let skuIdToUse: string | null = null;
                            if (item.skuId) {
                                const existingSku = await skuRepository.getSkuById(item.skuId);
                                if (existingSku) skuIdToUse = existingSku.skuId;
                            }
                            if (!skuIdToUse && item.skuCode && item.skuDescription && item.skuUom) {
                                try {
                                    const newSku = await skuRepository.createSku({
                                        skuCode: item.skuCode,
                                        skuDescription: item.skuDescription,
                                        skuUom: item.skuUom,
                                        isActive: true,
                                        createdBy,
                                        updatedBy: updatedBy ?? createdBy,
                                    } as Parameters<typeof skuRepository.createSku>[0], context.tx);
                                    skuIdToUse = newSku.skuId;
                                } catch (err) {
                                    logger.error('[grns.resolvers]: Failed to create new SKU for GRN item', { skuCode: item.skuCode, err });
                                }
                            }
                            if (!skuIdToUse) {
                                logger.error('[grns.resolvers]: SKU not found and cannot create', { item });
                                continue;
                            }
                            const allocations = resolveGrnItemRackAllocations(item);
                            const lossAllocations = resolveGrnItemLossRackAllocations(item);
                            const remaining = item.skuCode ? remainingBySkuCode.get(item.skuCode) : undefined;
                            grnItemRows.push({
                                grnId: id,
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

                        // Delete existing rack mappings for this GRN's items
                        const existingItems = await grnItemsRepository.getGrnItems({ grnId: id }, context.tx);
                        if (existingItems && existingItems.length > 0) {
                            const existingIds = existingItems.map((i) => i.id);
                            await db
                                .delete(GrnItemRacksTable)
                                .where(inArray(GrnItemRacksTable.grnItemId, existingIds));
                            await db
                                .delete(GrnItemLossRacksTable)
                                .where(inArray(GrnItemLossRacksTable.grnItemId, existingIds));
                        }

                        await grnItemsRepository.deleteGrnItem({ grnId: id }, context.tx);
                        if (grnItemRows.length > 0) {
                            const createdItems = await grnItemsRepository.createGrnItems(grnItemRows, context.tx);
                            if (createdItems.length && input.items && context.tx) {
                                await insertGrnItemRackRows(createdItems, input.items, context.tx);
                                await insertGrnItemLossRackRows(createdItems, input.items, context.tx);
                            }
                        }

                        const effectiveDeliveryId = supplierDeliveryId ?? (updateData.supplierDeliveryId as string | undefined);
                        if (effectiveDeliveryId) {
                            await supplierDeliveryItemsRepository.deleteSupplierDeliveryItemsByDeliveryId(effectiveDeliveryId, context.tx);
                            for (const item of grnItemRows) {
                                await supplierDeliveryItemsRepository.createSupplierDeliveryItem({
                                    supplierDeliveryId: effectiveDeliveryId,
                                    skuId: item.skuId,
                                    qtyDelivered: item.qty,
                                    lossQty: item.lossQty ?? '0',
                                    createdBy: item.createdBy,
                                    updatedBy: item.updatedBy ?? updatedBy,
                                }, context.tx);
                            }
                        }
                    } else if (updateData.status === 'Submitted' && context.tx) {
                        // Status-only transition to Submitted (e.g. from the GRN list's
                        // "Submit" action), no items in this call — compute the remaining-qty
                        // snapshot from the GRN's existing items instead of skipping it.
                        const existingItems = await grnItemsRepository.getGrnItems({ grnId: id }, context.tx);
                        if (existingItems && existingItems.length > 0) {
                            const skuIds = [...new Set(existingItems.map((i) => i.skuId))];
                            const skuResult = await skuRepository.getSku({ skuId: skuIds }, undefined, context.tx);
                            const codeBySkuId = new Map(
                                (skuResult.query as Array<{ skuId: string; skuCode: string }>).map(
                                    (s) => [s.skuId, s.skuCode] as const,
                                ),
                            );
                            const remainingBySkuCode = await inboundServices.computeRemainingForItems(
                                {
                                    poNo: existingGrn.poNo,
                                    organizationId: context.organizationId ?? existingGrn.organizationId ?? '',
                                    items: existingItems.map((i) => ({
                                        skuCode: codeBySkuId.get(i.skuId) ?? null,
                                        qty: i.qty,
                                        lossQty: i.lossQty,
                                    })),
                                },
                                context.tx,
                                id,
                            );
                            for (const item of existingItems) {
                                const code = codeBySkuId.get(item.skuId);
                                const remaining = code ? remainingBySkuCode.get(code) : undefined;
                                await context.tx.update(GrnItemsTable).set({
                                    remainingCtn: remaining?.remainingCtn != null ? String(remaining.remainingCtn) : null,
                                    remainingLoosePcs: remaining?.remainingLoosePcs != null ? String(remaining.remainingLoosePcs) : null,
                                }).where(eq(GrnItemsTable.id, item.id));
                            }
                        }
                    }

                    const grn = await grnsRepository.updateGrn(id, updateData, context.tx);
                    if (!grn) return false;

                    // First approval only (Submitted → Approved): record inbound movement and stock quants.
                    if (
                        updateData.status === 'Approved' &&
                        existingGrn.status === 'Submitted'
                    ) {
                        const grnItems = await grnItemsRepository.getGrnItems({ grnId: id }, context.tx);
                        if (grnItems === false) {
                            logger.error('[grns.resolvers]: Failed to get GRN items');
                            throw new Error('Failed to get GRN items for approval');
                        }
                        const approvalOrganizationId =
                            context.organizationId ?? existingGrn.organizationId ?? grn.organizationId;
                        if (!approvalOrganizationId) {
                            throw new GraphQLError('Organization context is required to approve a GRN', {
                                extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
                            });
                        }

                        await inventoryMovementRepository.createInventoryMovement(grnItems.map(item => ({
                            skuId: item.skuId,
                            quantity: item.qty,
                            lossQty: item.lossQty ?? undefined,
                            referenceNo: grn.grnNo,
                            reason: 'Inbound',
                            createdBy: updatedBy,
                            updatedBy: updatedBy,
                            movementType: InventoryMovementType.INBOUND,
                        })), updatedBy, approvalOrganizationId, context.tx);

                        await recordGrnApprovalStockQuants({
                            organizationId: approvalOrganizationId,
                            userId: updatedBy,
                            items: grnItems,
                            tx: context.tx!,
                        });

                        return transformGrn(grn);
                    }

                    if (updateData.status === 'SentToES') {
                        // Block premature sends: if the linked ASN/PO still has outstanding qty,
                        // NetSuite will reject the item receipt anyway (root cause of the
                        // "5 GRNs all failed sending to ES" incident — partial sends against
                        // an unfulfilled PO are doomed). Fail fast with an actionable message.
                        const fulfillment = await computePoFulfillment(existingGrn.poNo);
                        if (!fulfillment.fullyFulfilled) {
                            const outstanding = fulfillment.shortfalls
                                .map((s) => `${s.skuCode} (${s.received}/${s.expected} units)`)
                                .join(', ');
                            const nsError = `PO ${existingGrn.poNo} not fully received yet — outstanding: ${outstanding}. Wait for remaining deliveries before sending to ES.`;
                            logger.info(`ℹ️ [grns.resolvers] Blocking send-to-ES — PO not fully fulfilled: ${nsError}`);
                            const blockedGrn = await grnsRepository.updateGrn(id, {
                                status: 'Failed',
                                nsError,
                                nsSentAt: new Date(),
                            }, context.tx);
                            return transformGrn(blockedGrn ?? grn);
                        }

                        logger.info(`ℹ️ [grns.resolvers] Sending Item Receipt to NetSuite — grnNo: ${existingGrn.grnNo}`);
                        const nsResult = await esItemReceiptService.sendItemReceipt(existingGrn, context.organizationId!);
                        const finalStatus = nsResult.success ? 'SentToES' : 'Failed';
                        const updatedGrn = await grnsRepository.updateGrn(id, {
                            status: finalStatus,
                            nsError: nsResult.success ? null : nsResult.nsResponse,
                            nsSentAt: new Date(),
                        }, context.tx);
                        logger.info(`ℹ️ [grns.resolvers] GRN status updated to ${finalStatus} — grnNo: ${existingGrn.grnNo}`);

                        // The Item Receipt sent represents the WHOLE PO (merged across all its GRNs),
                        // so once it succeeds, every sibling GRN against the same PO is also "sent".
                        if (nsResult.success && existingGrn.poNo) {
                            const siblingResult = await grnsRepository.getGrns(
                                { poNo: existingGrn.poNo },
                                { pageSize: 100, pageNumber: 1 },
                                context.organizationId ?? undefined,
                            );
                            const siblings = siblingResult && 'query' in siblingResult ? siblingResult.query : [];
                            for (const sibling of siblings) {
                                if (sibling.id === id || sibling.status === 'SentToES') continue;
                                await grnsRepository.updateGrn(sibling.id, {
                                    status: 'SentToES',
                                    nsError: null,
                                    nsSentAt: new Date(),
                                }, context.tx);
                                logger.info(`ℹ️ [grns.resolvers] Synced sibling GRN to SentToES — grnNo: ${sibling.grnNo}`);
                            }
                        }

                        return transformGrn(updatedGrn ?? grn);
                    }

                    return transformGrn(grn);
                } catch (error) {
                    logger.error('[grns.resolvers] Error:', error);
                    throw error;
                }
            }
        ),

        deleteGrn: withAudit(
            {
                entity: 'GRN',
                action: 'DELETE',
                getEntityId: (_, args) => args.id,
                getOldData: async (args, context) => grnsRepository.getGrns({ id: args.id }, undefined, (context as GraphQLContext).organizationId ?? undefined),
            },
            async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
                try {
                    await db.transaction(async (tx) => {
                        const grnResult = await grnsRepository.getGrns({ id }, undefined, context.organizationId ?? undefined);
                        const grn = grnResult && 'query' in grnResult && grnResult.query?.[0] ? grnResult.query[0] : null;
                        const supplierDeliveryId = grn?.supplierDeliveryId ?? null;
                        if (supplierDeliveryId) {
                            const deleteDOItems = await supplierDeliveryItemsRepository.deleteSupplierDeliveryItemsByDeliveryId(supplierDeliveryId, tx);
                            if (deleteDOItems === false) {
                                logger.error('[grns.resolvers]: Failed to delete DO items');
                                return false;
                            }
                            const deletedDelivery = await supplierDeliveriesRepository.deleteSupplierDelivery(supplierDeliveryId, tx);
                            if (deletedDelivery === false) {
                                logger.error('[grns.resolvers]: Failed to delete supplier delivery');
                                return false;
                            }
                        }
                        const deleteGrnItems = await grnItemsRepository.deleteGrnItem({ grnId: id }, tx);
                        if (deleteGrnItems === false) {
                            logger.error('[grns.resolvers]: Failed to delete GRN items');
                            return false;
                        }
                        const deleted = await grnsRepository.deleteGrn(id, tx);
                        if (!deleted) {
                            logger.error('[grns.resolvers]: Failed to delete GRN');
                            return false;
                        }
                    });
                    return true;
                } catch (error) {
                    logger.error('[grns.resolvers] Error:', error);
                    return false;
                }
            }
        ),

        assignPutawayBins: async (_: unknown, { grnId }: { grnId: string }, context: GraphQLContext) => {
            if (!context.organizationId) {
                throw new GraphQLError('Organization context is required', {
                    extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
                });
            }
            return await grnPutawayService.assignBinsForGrn(grnId, context.organizationId);
        },
    },
};
