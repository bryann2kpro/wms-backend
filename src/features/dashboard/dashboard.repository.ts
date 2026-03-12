import { db } from '@/db';
import { GrnsTable } from '@/features/inbound/grns.model';
import { PurchaseOrdersTable } from '@/features/outbound/purchase-orders.model';
import { PurchaseOrderItemsTable } from '@/features/outbound/purchase-orders.model';
import { DeliveryOrdersTable } from '@/features/outbound/delivery-orders.model';
import { InvoicesTable } from '@/features/invoicing/invoices.model';
import { SyncCursorsTable, IntegrationJobsTable } from '@/features/integration/integration.model';
import { SettlementsTable } from '@/features/settlement/settlements.model';
import { SuppliersTable } from '@/features/master-data/suppliers.model';
import { OutletsTable } from '@/features/master-data/outlets.model';
import { eq, and, gte, lte, sql, count, inArray } from 'drizzle-orm';
import { logger } from '@/util/logger';

/** Business timezone offset (UTC+8 for Malaysia). */
const BIZ_TZ_OFFSET_MS = 8 * 60 * 60_000;

/** Get start/end of today in business timezone, returned as UTC dates. */
function getTodayBoundsUTC(): { start: Date; end: Date } {
  const now = new Date();
  const shifted = new Date(now.getTime() + BIZ_TZ_OFFSET_MS);
  const startShifted = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0));
  const endShifted = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 23, 59, 59, 999));
  return {
    start: new Date(startShifted.getTime() - BIZ_TZ_OFFSET_MS),
    end: new Date(endShifted.getTime() - BIZ_TZ_OFFSET_MS),
  };
}

/** Get start of the current week (Monday) in business timezone, returned as UTC dates. */
function getWeekBoundsUTC(): { start: Date; end: Date } {
  const now = new Date();
  const shifted = new Date(now.getTime() + BIZ_TZ_OFFSET_MS);
  const dayOfWeek = shifted.getUTCDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + mondayOffset, 0, 0, 0, 0));
  const sunday = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + mondayOffset + 6, 23, 59, 59, 999));
  return {
    start: new Date(monday.getTime() - BIZ_TZ_OFFSET_MS),
    end: new Date(sunday.getTime() - BIZ_TZ_OFFSET_MS),
  };
}

export class DashboardRepositoryClass {

  /** Aggregate GRN statistics. */
  async getGrnStats() {
    const today = getTodayBoundsUTC();

    const [totalRow] = await db.select({ count: count() }).from(GrnsTable);
    const [pendingRow] = await db.select({ count: count() }).from(GrnsTable)
      .where(inArray(GrnsTable.status, ['DRAFT', 'SUBMITTED']));
    const [todayRow] = await db.select({ count: count() }).from(GrnsTable)
      .where(and(gte(GrnsTable.createdAt, today.start), lte(GrnsTable.createdAt, today.end)));
    const [pendingApprovalRow] = await db.select({ count: count() }).from(GrnsTable)
      .where(eq(GrnsTable.status, 'SUBMITTED'));

    return {
      totalGRNs: totalRow.count,
      pendingGRNs: pendingRow.count,
      grnsToday: todayRow.count,
      grnsPendingApproval: pendingApprovalRow.count,
    };
  }

  /** Aggregate Purchase Order (Transfer Order) statistics. */
  async getPurchaseOrderStats() {
    const today = getTodayBoundsUTC();

    const [totalRow] = await db.select({ count: count() }).from(PurchaseOrdersTable);
    const [activeRow] = await db.select({ count: count() }).from(PurchaseOrdersTable)
      .where(inArray(PurchaseOrdersTable.status, ['NEW', 'ACCEPTED', 'DO_CREATED']));
    const [pulledTodayRow] = await db.select({ count: count() }).from(PurchaseOrdersTable)
      .where(and(gte(PurchaseOrdersTable.pulledAt, today.start), lte(PurchaseOrdersTable.pulledAt, today.end)));

    // Last pull time from sync cursors
    const [syncCursor] = await db.select({ lastSuccessAt: SyncCursorsTable.lastSuccessAt })
      .from(SyncCursorsTable)
      .where(eq(SyncCursorsTable.source, 'NETSUITE_TO_PULL'));

    return {
      totalTransfers: totalRow.count,
      activeTransfers: activeRow.count,
      tosPulledToday: pulledTodayRow.count,
      tosLastPullTime: syncCursor?.lastSuccessAt?.toISOString() ?? null,
    };
  }

  /** Aggregate Delivery Order statistics by status. */
  async getDeliveryOrderStats() {
    const [totalRow] = await db.select({ count: count() }).from(DeliveryOrdersTable);

    const [packingRow] = await db.select({ count: count() }).from(DeliveryOrdersTable)
      .where(eq(DeliveryOrdersTable.status, 'PACKING'));
    const [shippedRow] = await db.select({ count: count() }).from(DeliveryOrdersTable)
      .where(eq(DeliveryOrdersTable.status, 'SHIPPED'));

    // DOs in DELIVERED status where proof not yet uploaded
    const pendingProofRows = await db.select({ count: count() })
      .from(DeliveryOrdersTable)
      .leftJoin(SettlementsTable, eq(DeliveryOrdersTable.id, SettlementsTable.doId))
      .where(and(
        eq(DeliveryOrdersTable.status, 'DELIVERED'),
        sql`(${SettlementsTable.signedProofUploaded} = false OR ${SettlementsTable.signedProofUploaded} IS NULL)`,
      ));

    // Count DOs that are not in a terminal state (CREATED, PACKING, SHIPPED)
    const [scheduledRow] = await db.select({ count: count() }).from(DeliveryOrdersTable)
      .where(inArray(DeliveryOrdersTable.status, ['CREATED', 'PACKING']));

    const pendingProofCount = pendingProofRows[0]?.count ?? 0;
    return {
      totalDeliveries: totalRow?.count ?? 0,
      scheduledDeliveries: scheduledRow?.count ?? 0,
      dosByStatus: {
        picking: packingRow?.count ?? 0,
        ready: shippedRow?.count ?? 0,
        deliveredPendingProof: pendingProofCount,
      },
      pendingProofCount,
    };
  }

  /** Aggregate Invoice statistics. */
  async getInvoiceStats() {
    const today = getTodayBoundsUTC();
    const week = getWeekBoundsUTC();

    const [todayRow] = await db.select({ count: count() }).from(InvoicesTable)
      .where(and(
        inArray(InvoicesTable.status, ['ISSUED', 'SENT']),
        gte(InvoicesTable.dateIssued, today.start),
        lte(InvoicesTable.dateIssued, today.end),
      ));

    const [weekRow] = await db.select({ count: count() }).from(InvoicesTable)
      .where(and(
        inArray(InvoicesTable.status, ['ISSUED', 'SENT']),
        gte(InvoicesTable.dateIssued, week.start),
        lte(InvoicesTable.dateIssued, week.end),
      ));

    return {
      invoicesIssuedToday: todayRow.count,
      invoicesIssuedThisWeek: weekRow.count,
    };
  }

  /** Get integration health from sync cursors and failed jobs. */
  async getIntegrationHealth() {
    const [toPull] = await db.select({ lastSuccessAt: SyncCursorsTable.lastSuccessAt })
      .from(SyncCursorsTable)
      .where(eq(SyncCursorsTable.source, 'NETSUITE_TO_PULL'));

    const [stockSync] = await db.select({ lastSuccessAt: SyncCursorsTable.lastSuccessAt })
      .from(SyncCursorsTable)
      .where(eq(SyncCursorsTable.source, 'NETSUITE_STOCK_PUSH'));

    const [failedRow] = await db.select({ count: count() }).from(IntegrationJobsTable)
      .where(eq(IntegrationJobsTable.status, 'FAILED'));

    // Determine stock sync status: OK if last sync was within 24h, Fail otherwise
    const stockSyncTime = stockSync?.lastSuccessAt;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60_000);
    const stockSyncStatus = stockSyncTime && stockSyncTime > twentyFourHoursAgo ? 'OK' : 'Fail';

    return {
      lastTOPullTime: toPull?.lastSuccessAt?.toISOString() ?? new Date().toISOString(),
      lastStockSyncTime: stockSync?.lastSuccessAt?.toISOString() ?? new Date().toISOString(),
      failedSyncCount: failedRow.count,
      stockSyncStatus,
    };
  }

  /** Get recent GRNs joined with supplier name. */
  async getRecentGrns(limit = 10) {
    const rows = await db.select({
      id: GrnsTable.id,
      grnNumber: GrnsTable.grnNo,
      supplier: SuppliersTable.supplierName,
      status: GrnsTable.status,
      createdAt: GrnsTable.createdAt,
    })
      .from(GrnsTable)
      .leftJoin(SuppliersTable, eq(GrnsTable.supplierId, SuppliersTable.supplierId))
      .orderBy(sql`${GrnsTable.createdAt} DESC`)
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      grnNumber: r.grnNumber,
      supplier: r.supplier ?? 'Unknown',
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      totalAmount: 0, // GRN table doesn't store monetary totals
    }));
  }

  /** Get recent purchase orders (transfer orders) joined with outlet name. */
  async getRecentTransferOrders(limit = 10) {
    const rows = await db.select({
      id: PurchaseOrdersTable.id,
      transferOrderNumber: PurchaseOrdersTable.purchaseOrderNo,
      outletName: OutletsTable.outletName,
      status: PurchaseOrdersTable.status,
      createdAt: PurchaseOrdersTable.createdAt,
      outletId: PurchaseOrdersTable.outletId,
    })
      .from(PurchaseOrdersTable)
      .leftJoin(OutletsTable, eq(PurchaseOrdersTable.outletId, OutletsTable.outletId))
      .where(inArray(PurchaseOrdersTable.status, ['NEW', 'ACCEPTED', 'DO_CREATED', 'SHIPPED']))
      .orderBy(sql`${PurchaseOrdersTable.createdAt} DESC`)
      .limit(limit);

    // Get item counts per PO
    const poNos = rows.map((r) => r.transferOrderNumber);
    let itemCountMap = new Map<string, number>();
    if (poNos.length > 0) {
      const itemCounts = await db.select({
        purchaseOrderNo: PurchaseOrderItemsTable.purchaseOrderNo,
        count: count(),
      })
        .from(PurchaseOrderItemsTable)
        .where(inArray(PurchaseOrderItemsTable.purchaseOrderNo, poNos))
        .groupBy(PurchaseOrderItemsTable.purchaseOrderNo);

      itemCountMap = new Map(itemCounts.map((ic) => [ic.purchaseOrderNo, ic.count]));
    }

    return rows.map((r) => ({
      id: r.id,
      transferOrderNumber: r.transferOrderNumber,
      fromLocation: 'SME Warehouse',
      toLocation: r.outletName ?? 'Unknown',
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      itemCount: itemCountMap.get(r.transferOrderNumber) ?? 0,
    }));
  }

  /** Get recent delivery orders joined with PO + outlet. */
  async getRecentDeliveries(limit = 10) {
    const rows = await db.select({
      id: DeliveryOrdersTable.id,
      deliveryNumber: DeliveryOrdersTable.doNo,
      status: DeliveryOrdersTable.status,
      createdAt: DeliveryOrdersTable.createdAt,
      purchaseOrderId: DeliveryOrdersTable.purchaseOrderId,
      outletName: OutletsTable.outletName,
      scheduledDeliveryDate: PurchaseOrdersTable.scheduledDeliveryDate,
    })
      .from(DeliveryOrdersTable)
      .leftJoin(PurchaseOrdersTable, eq(DeliveryOrdersTable.purchaseOrderId, PurchaseOrdersTable.id))
      .leftJoin(OutletsTable, eq(PurchaseOrdersTable.outletId, OutletsTable.outletId))
      .orderBy(sql`${DeliveryOrdersTable.createdAt} DESC`)
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      deliveryNumber: r.deliveryNumber,
      customerName: r.outletName ?? 'Unknown',
      status: r.status,
      scheduledDate: (r.scheduledDeliveryDate ?? r.createdAt).toISOString(),
      deliveryDate: r.status === 'DELIVERED' ? r.createdAt.toISOString() : null,
      totalAmount: 0,
    }));
  }
}
