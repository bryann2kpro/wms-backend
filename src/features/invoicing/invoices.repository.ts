/**
 * Invoices Repository
 *
 * @description Data access layer for Invoices and Invoice Items.
 * Creates invoices from delivery orders when eligible (n+2 rule).
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import {
  InvoicesTable,
  InvoiceItemsTable,
  InvoiceType,
  InvoiceInsertType,
  InvoiceFilter,
  InvoiceItemType,
  InvoiceItemInsertType,
  InvoiceSummaryData,
  InvoiceWithDoNo,
} from "./invoices.model";
import {
  DeliveryOrdersTable,
  DeliveryOrderItemsTable,
  type DeliveryOrderType,
} from "@/features/outbound/delivery-orders.model";
import { PurchaseOrdersTable, PurchaseOrderItemsTable } from "@/features/outbound/purchase-orders.model";
import { OutletsTable } from "@/features/master-data/outlets.model";
import { RegionPricingTable } from "@/features/master-data/region.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { DbTransaction } from "@/types/db-transaction";
import { eq, and, like, inArray, gte, lte, or, sql, isNull, count, notInArray } from "drizzle-orm";
import { RunningNoRepositoryClass } from "@/features/running-no/running-no.repository";

/** Db or transaction client for methods that can run in or out of a transaction */
type DbClient = typeof db | DbTransaction;

const ELIGIBLE_DO_STATUSES = ["SHIPPED", "DELIVERED"] as const;

export class InvoicesRepositoryClass {
  constructor(
    private readonly runningNoRepository: RunningNoRepositoryClass,
  ) {}
  
  private static readonly INVOICE_ADDRESS_SNAPSHOT_ID = process.env.INVOICE_ADDRESS_SNAPSHOT_ID || "02858010-2dcf-4ef1-82f5-1a5f677a01b1";
  
  // ============================================
  // Eligibility (n+2 rule)
  // ============================================

  /**
   * Returns delivery orders eligible for invoicing:
   * - Status SHIPPED or DELIVERED
   * - No existing invoice for this DO
   * - updated_at <= now - 2 days (n+2)
   */
  async getDeliveryOrdersEligibleForInvoicing(): Promise<DeliveryOrderType[]> {
    try {
      logger.info("ℹ️ [InvoicesRepository.getDeliveryOrdersEligibleForInvoicing] Getting eligible delivery orders...");

      const nPlusTwoCondition = sql`${DeliveryOrdersTable.updatedAt} <= now() - interval '2 days'`;

      const rows = await db
        .select({
          id: DeliveryOrdersTable.id,
          doNo: DeliveryOrdersTable.doNo,
          purchaseOrderId: DeliveryOrdersTable.purchaseOrderId,
          poNo: DeliveryOrdersTable.poNo,
          status: DeliveryOrdersTable.status,
          isEmergency: DeliveryOrdersTable.isEmergency,
          createdAt: DeliveryOrdersTable.createdAt,
          updatedAt: DeliveryOrdersTable.updatedAt,
          createdBy: DeliveryOrdersTable.createdBy,
          updatedBy: DeliveryOrdersTable.updatedBy,
        })
        .from(DeliveryOrdersTable)
        .leftJoin(InvoicesTable, eq(DeliveryOrdersTable.id, InvoicesTable.doId))
        .where(
          and(
            inArray(DeliveryOrdersTable.status, [...ELIGIBLE_DO_STATUSES]),
            isNull(InvoicesTable.doId),
            nPlusTwoCondition,
          )
        );

      logger.info(`✅ [InvoicesRepository.getDeliveryOrdersEligibleForInvoicing] Found ${rows.length} eligible delivery orders`);
      return rows as DeliveryOrderType[];
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getDeliveryOrdersEligibleForInvoicing] Error:", error);
      throw error;
    }
  }

  // ============================================
  // Invoices CRUD
  // ============================================

  async createInvoice(data: InvoiceInsertType, tx?: DbClient): Promise<InvoiceType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [InvoicesRepository.createInvoice] Creating invoice...");
      const [row] = await dbClient
        .insert(InvoicesTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      if (!row) throw new Error("[InvoicesRepository.createInvoice] Insert did not return a row");
      logger.info("✅ [InvoicesRepository.createInvoice] Invoice created successfully");
      return row;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.createInvoice] Error:", error);
      throw error;
    }
  }

  async createInvoiceItems(items: InvoiceItemInsertType[], tx?: DbClient): Promise<InvoiceItemType[]> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [InvoicesRepository.createInvoiceItems] Creating invoice items...");
      const now = new Date();
      const rows = await dbClient
        .insert(InvoiceItemsTable)
        .values(
          items.map((item) => ({
            ...item,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .returning();
      logger.info(`✅ [InvoicesRepository.createInvoiceItems] ${rows.length} invoice items created successfully`);
      return rows;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.createInvoiceItems] Error:", error);
      throw error;
    }
  }

  async getInvoiceByDoId(doId: string, tx?: DbClient): Promise<InvoiceType | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .select()
        .from(InvoicesTable)
        .where(eq(InvoicesTable.doId, doId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getInvoiceByDoId] Error:", error);
      throw error;
    }
  }

  async getInvoiceById(id: string, tx?: DbClient): Promise<InvoiceType | null> {
    try {
      const dbClient = tx ?? db;
      const [row] = await dbClient
        .select({
          id: InvoicesTable.id,
          organizationId: InvoicesTable.organizationId,
          invoiceNo: InvoicesTable.invoiceNo,
          doId: InvoicesTable.doId,
          doNo: DeliveryOrdersTable.doNo,
          poId: InvoicesTable.poId,
          poNo: InvoicesTable.poNo,
          poAmount: PurchaseOrdersTable.amount,
          poAmountCalcSnapshot: PurchaseOrdersTable.amountCalcSnapshot,
          billingAddressId: InvoicesTable.billingAddressId,
          deliveryAddressId: InvoicesTable.deliveryAddressId,
          customerAccount: InvoicesTable.customerAccount,
          salesExecutive: InvoicesTable.salesExecutive,
          pageNo: InvoicesTable.pageNo,
          dateIssued: InvoicesTable.dateIssued,
          totalExclTax: InvoicesTable.totalExclTax,
          taxAmount: InvoicesTable.taxAmount,
          totalInclTax: InvoicesTable.totalInclTax,
          taxRate: InvoicesTable.taxRate,
          status: InvoicesTable.status,
          issuedBy: InvoicesTable.issuedBy,
          issuedAt: InvoicesTable.issuedAt,
          createdAt: InvoicesTable.createdAt,
          updatedAt: InvoicesTable.updatedAt,
          createdBy: InvoicesTable.createdBy,
          updatedBy: InvoicesTable.updatedBy,
        })
        .from(InvoicesTable)
        .leftJoin(DeliveryOrdersTable, eq(InvoicesTable.doId, DeliveryOrdersTable.id))
        .leftJoin(PurchaseOrdersTable, eq(InvoicesTable.poId, PurchaseOrdersTable.id))
        .where(eq(InvoicesTable.id, id))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getInvoiceById] Error:", error);
      throw error;
    }
  }

  async getInvoices(
    filter: InvoiceFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<InvoiceWithDoNo> & { summary: InvoiceSummaryData }> {
    try {
      logger.info("ℹ️ [InvoicesRepository.getInvoices] Getting invoices...");

      const conditions: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        conditions.push(inArray(InvoicesTable.id, filter.id));
      } else if (filter.id) {
        conditions.push(eq(InvoicesTable.id, filter.id));
      }
      if (filter.invoiceNo) {
        conditions.push(like(InvoicesTable.invoiceNo, `%${filter.invoiceNo}%`));
      }
      if (Array.isArray(filter.doId)) {
        conditions.push(inArray(InvoicesTable.doId, filter.doId));
      } else if (filter.doId) {
        conditions.push(eq(InvoicesTable.doId, filter.doId));
      }
      if (Array.isArray(filter.poId)) {
        conditions.push(inArray(InvoicesTable.poId, filter.poId));
      } else if (filter.poId) {
        conditions.push(eq(InvoicesTable.poId, filter.poId));
      }
      if (Array.isArray(filter.status)) {
        conditions.push(inArray(InvoicesTable.status, filter.status));
      } else if (filter.status) {
        conditions.push(eq(InvoicesTable.status, filter.status));
      }
      if (filter.search) {
        const term = `%${filter.search}%`;
        conditions.push(
          or(
            like(InvoicesTable.invoiceNo, term),
            like(DeliveryOrdersTable.doNo, term),
          ) as ReturnType<typeof eq>
        );
      }
      if (filter.dateIssuedFrom) {
        conditions.push(gte(InvoicesTable.dateIssued, new Date(filter.dateIssuedFrom)));
      }
      if (filter.dateIssuedTo) {
        conditions.push(lte(InvoicesTable.dateIssued, new Date(filter.dateIssuedTo)));
      }
      if (filter.createdAtFrom) {
        conditions.push(gte(InvoicesTable.createdAt, new Date(filter.createdAtFrom)));
      }
      if (filter.createdAtTo) {
        conditions.push(lte(InvoicesTable.createdAt, new Date(filter.createdAtTo)));
      }
      if (filter.deliveryDateFrom) {
        conditions.push(gte(PurchaseOrdersTable.scheduledDeliveryDate, new Date(filter.deliveryDateFrom)));
      }
      if (filter.deliveryDateTo) {
        conditions.push(lte(PurchaseOrdersTable.scheduledDeliveryDate, new Date(filter.deliveryDateTo)));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const offset = (pageNumber - 1) * pageSize;

      // Count query (must join PO table when delivery date filter is active)
      const [countRow] = await db
        .select({ total: count() })
        .from(InvoicesTable)
        .leftJoin(DeliveryOrdersTable, eq(InvoicesTable.doId, DeliveryOrdersTable.id))
        .leftJoin(PurchaseOrdersTable, eq(InvoicesTable.poId, PurchaseOrdersTable.id))
        .where(whereClause);
      const totalCount = countRow?.total ?? 0;

      // Data query with join
      const rows = await db
        .select({
          id: InvoicesTable.id,
          organizationId: InvoicesTable.organizationId,
          invoiceNo: InvoicesTable.invoiceNo,
          doId: InvoicesTable.doId,
          poId: InvoicesTable.poId,
          poNo: InvoicesTable.poNo,
          poAmount: PurchaseOrdersTable.amount,
          poAmountCalcSnapshot: PurchaseOrdersTable.amountCalcSnapshot,
          billingAddressId: InvoicesTable.billingAddressId,
          deliveryAddressId: InvoicesTable.deliveryAddressId,
          customerAccount: InvoicesTable.customerAccount,
          salesExecutive: InvoicesTable.salesExecutive,
          pageNo: InvoicesTable.pageNo,
          dateIssued: InvoicesTable.dateIssued,
          totalExclTax: InvoicesTable.totalExclTax,
          taxAmount: InvoicesTable.taxAmount,
          totalInclTax: InvoicesTable.totalInclTax,
          taxRate: InvoicesTable.taxRate,
          status: InvoicesTable.status,
          issuedBy: InvoicesTable.issuedBy,
          issuedAt: InvoicesTable.issuedAt,
          createdAt: InvoicesTable.createdAt,
          updatedAt: InvoicesTable.updatedAt,
          createdBy: InvoicesTable.createdBy,
          updatedBy: InvoicesTable.updatedBy,
          doNo: DeliveryOrdersTable.doNo,
          deliveryDate: PurchaseOrdersTable.scheduledDeliveryDate,
        })
        .from(InvoicesTable)
        .leftJoin(DeliveryOrdersTable, eq(InvoicesTable.doId, DeliveryOrdersTable.id))
        .leftJoin(PurchaseOrdersTable, eq(InvoicesTable.poId, PurchaseOrdersTable.id))
        .where(whereClause)
        .orderBy(sql`${InvoicesTable.createdAt} DESC`)
        .limit(pageSize)
        .offset(offset);

      // Summary counts (across all invoices, ignoring current filter except status)
      const summaryRows = await db
        .select({
          status: InvoicesTable.status,
          cnt: count(),
          total: sql<string>`COALESCE(SUM(${InvoicesTable.totalInclTax}), '0')`,
        })
        .from(InvoicesTable)
        .groupBy(InvoicesTable.status);

      const summary: InvoiceSummaryData = { issued: 0, sent: 0, cancelled: 0, totalAmount: "0" };
      let grandTotal = 0;
      for (const row of summaryRows) {
        const s = row.status?.toUpperCase();
        if (s === "ISSUED" || s === "GENERATED" || s === "DRAFT") summary.issued += row.cnt;
        else if (s === "SENT") summary.sent += row.cnt;
        else if (s === "CANCELLED") summary.cancelled += row.cnt;
        grandTotal += parseFloat(row.total ?? "0");
      }
      summary.totalAmount = grandTotal.toFixed(2);

      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

      logger.info("✅ [InvoicesRepository.getInvoices] Invoices fetched successfully");
      return {
        query: rows as InvoiceWithDoNo[],
        pagination: {
          count: rows.length,
          totalCount,
          currentPage: pageNumber,
          totalPages,
          hasNextPage: pageNumber < totalPages,
          hasPrevPage: pageNumber > 1,
        },
        summary,
      };
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getInvoices] Error:", error);
      throw error;
    }
  }

  async updateInvoiceStatus(id: string, status: string): Promise<InvoiceType | null> {
    try {
      logger.info(`ℹ️ [InvoicesRepository.updateInvoiceStatus] Updating invoice ${id} to status ${status}...`);
      const [row] = await db
        .update(InvoicesTable)
        .set({ status, updatedAt: new Date() })
        .where(eq(InvoicesTable.id, id))
        .returning();
      if (!row) return null;
      logger.info("✅ [InvoicesRepository.updateInvoiceStatus] Invoice status updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.updateInvoiceStatus] Error:", error);
      throw error;
    }
  }

  async getInvoiceItemsByInvoiceId(
    invoiceId: string,
    tx?: DbClient
  ): Promise<(InvoiceItemType & { skuCode: string | null })[]> {
    try {
      const dbClient = tx ?? db;
      const rows = await dbClient
        .select({
          id: InvoiceItemsTable.id,
          invoiceId: InvoiceItemsTable.invoiceId,
          itemNo: InvoiceItemsTable.itemNo,
          skuId: InvoiceItemsTable.skuId,
          description: InvoiceItemsTable.description,
          qty: InvoiceItemsTable.qty,
          unitPrice: InvoiceItemsTable.unitPrice,
          subTotal: InvoiceItemsTable.subTotal,
          createdAt: InvoiceItemsTable.createdAt,
          updatedAt: InvoiceItemsTable.updatedAt,
          createdBy: InvoiceItemsTable.createdBy,
          updatedBy: InvoiceItemsTable.updatedBy,
          skuCode: SkuTable.skuCode,
        })
        .from(InvoiceItemsTable)
        .leftJoin(SkuTable, eq(InvoiceItemsTable.skuId, SkuTable.skuId))
        .where(eq(InvoiceItemsTable.invoiceId, invoiceId));
      return rows.map((r) => ({ ...r, skuCode: r.skuCode ?? null }));
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getInvoiceItemsByInvoiceId] Error:", error);
      throw error;
    }
  }

  // ============================================
  // Invoice number generation
  // ============================================

  /**
   * Generates a unique invoice number in format PI-YYYYMMDD-NNNN.
   * Should be called within a transaction when used from createInvoiceFromDeliveryOrder.
   */
  async generateInvoiceNo(tx?: DbClient): Promise<string> {
    const run = async (dbClient: DbClient) => {
      const nextNo = await this.runningNoRepository.generateRunningNo(
        {
          scope: "invoice",
          prefix: "PI",
          width: 4,
        },
        dbClient
      );

      return nextNo;
    };

    if (tx) return run(tx);
    return db.transaction(async (dbTx) => run(dbTx));
  }

  // ============================================
  // Create invoice from delivery order
  // ============================================

  /**
   * Creates an invoice (DRAFT) and invoice items from a delivery order.
   * Throws if DO not found, or invoice already exists for this DO.
   */
  async createInvoiceFromDeliveryOrder(
    doId: string,
    tx?: DbTransaction
  ): Promise<InvoiceType> {
    const run = async (dbClient: DbClient) => {
      const systemUserId = process.env.SYSTEM_USER_UUID;
      if (!systemUserId) {
        throw new Error("[InvoicesRepository.createInvoiceFromDeliveryOrder] System user ID is not set");
      }

      const [doRow] = await dbClient
        .select()
        .from(DeliveryOrdersTable)
        .where(eq(DeliveryOrdersTable.id, doId))
        .limit(1);

      if (!doRow) {
        throw new Error("[InvoicesRepository.createInvoiceFromDeliveryOrder] Delivery order not found");
      }

      const existingInvoice = await this.getInvoiceByDoId(doId, dbClient);
      if (existingInvoice) {
        throw new Error("[InvoicesRepository.createInvoiceFromDeliveryOrder] Invoice already exists for this delivery order");
      }

      const doItems = await dbClient
        .select({
          skuId: DeliveryOrderItemsTable.skuId,
          qtyRequired: DeliveryOrderItemsTable.qtyRequired,
          skuDescription: SkuTable.skuDescription,
        })
        .from(DeliveryOrderItemsTable)
        .leftJoin(SkuTable, eq(DeliveryOrderItemsTable.skuId, SkuTable.skuId))
        .where(eq(DeliveryOrderItemsTable.purchaseOrderId, doRow.purchaseOrderId));

      // Resolve region pricing via PO → Outlet → Region → RegionPricing
      // Also fetch outletId, scheduledDeliveryDate, organizationId for group QOM lookup
      const [regionPricingRow] = await dbClient
        .select({
          rate: RegionPricingTable.rate,
          minQty: RegionPricingTable.minQty,
          sstRate: RegionPricingTable.sstRate,
          outletId: PurchaseOrdersTable.outletId,
          scheduledDeliveryDate: PurchaseOrdersTable.scheduledDeliveryDate,
          organizationId: PurchaseOrdersTable.organizationId,
        })
        .from(PurchaseOrdersTable)
        .innerJoin(OutletsTable, eq(PurchaseOrdersTable.outletId, OutletsTable.outletId))
        .innerJoin(RegionPricingTable, and(
          eq(OutletsTable.regionId, RegionPricingTable.regionId),
          eq(RegionPricingTable.isActive, true),
        ))
        .where(eq(PurchaseOrdersTable.id, doRow.purchaseOrderId))
        .limit(1);

      const regionRate = regionPricingRow ? parseFloat(regionPricingRow.rate) : 0;
      const minQty = regionPricingRow ? parseFloat(regionPricingRow.minQty) : 5;
      const sstRate = regionPricingRow ? parseFloat(regionPricingRow.sstRate) : 0.06;

      // --- Group QOM: sum PO item quantities across all non-cancelled POs for same outlet + delivery date ---
      // combinedQty must cover the whole group so the min-surcharge is applied once per group,
      // not once per individual PO. Fall back to thisPOQty only when we have no delivery date to
      // anchor the group (legacy POs with null scheduledDeliveryDate).
      const thisPOQty = doItems.reduce((sum, item) => sum + parseFloat(item.qtyRequired), 0);
      let combinedQty = thisPOQty;

      if (regionPricingRow?.outletId && regionPricingRow.organizationId) {
        if (regionPricingRow.scheduledDeliveryDate) {
          // Normal path: group by outlet + calendar day
          const deliveryDate = new Date(regionPricingRow.scheduledDeliveryDate);
          const startOfDay = new Date(deliveryDate);
          startOfDay.setUTCHours(0, 0, 0, 0);
          const endOfDay = new Date(deliveryDate);
          endOfDay.setUTCHours(23, 59, 59, 999);

          const [groupQtyRow] = await dbClient
            .select({
              combinedQty: sql<string>`COALESCE(SUM(${PurchaseOrderItemsTable.qtyRequired}::numeric), '0')`,
            })
            .from(PurchaseOrdersTable)
            .leftJoin(
              PurchaseOrderItemsTable,
              eq(PurchaseOrdersTable.purchaseOrderNo, PurchaseOrderItemsTable.purchaseOrderNo)
            )
            .where(
              and(
                eq(PurchaseOrdersTable.outletId, regionPricingRow.outletId),
                eq(PurchaseOrdersTable.organizationId, regionPricingRow.organizationId),
                gte(PurchaseOrdersTable.scheduledDeliveryDate, startOfDay),
                lte(PurchaseOrdersTable.scheduledDeliveryDate, endOfDay),
                notInArray(PurchaseOrdersTable.status, ['CANCELLED', 'REJECTED']),
              )
            );

          if (groupQtyRow) {
            combinedQty = parseFloat(groupQtyRow.combinedQty);
          }
        } else {
          // Fallback for POs without a scheduled delivery date: use this PO's total qty.
          // Min-surcharge is still applied at PO level (all items summed), not per item.
          logger.warn(
            `⚠️ [InvoicesRepository.createInvoiceFromDeliveryOrder] PO ${doRow.purchaseOrderId} has no scheduledDeliveryDate — group QOM lookup skipped, using thisPOQty=${thisPOQty}`
          );
        }
      }

      // Apply the group minimum once: each item's effective share = item.qty × (combinedEffectiveQty / combinedQty)
      const combinedEffectiveQty = combinedQty > 0 ? Math.max(combinedQty, minQty) : 0;
      const effectiveFactor = combinedQty > 0 ? combinedEffectiveQty / combinedQty : 1;

      const invoiceNo = await this.generateInvoiceNo(dbClient);

      // Compute per-item pricing using the group-level effective factor
      const pricedItems = doItems.map((item) => {
        const qty = parseFloat(item.qtyRequired);
        const effectiveQty = qty * effectiveFactor;
        const unitPrice = regionRate;
        const subTotal = effectiveQty * unitPrice;
        return { ...item, effectiveQty, unitPrice, subTotal };
      });

      const totalExclTax = pricedItems.reduce((sum, i) => sum + i.subTotal, 0);
      const taxAmount = totalExclTax * sstRate;
      const totalInclTax = totalExclTax + taxAmount;

      const invoice = await this.createInvoice(
        {
          organizationId: doRow.organizationId,
          invoiceNo,
          doId: doRow.id,
          doNo: doRow.doNo,
          poId: doRow.purchaseOrderId,
          poNo: doRow.poNo,
          billingAddressId: InvoicesRepositoryClass.INVOICE_ADDRESS_SNAPSHOT_ID,
          deliveryAddressId: InvoicesRepositoryClass.INVOICE_ADDRESS_SNAPSHOT_ID,
          status: "GENERATED",
          dateIssued: new Date(),
          totalExclTax: totalExclTax.toFixed(2),
          taxAmount: taxAmount.toFixed(2),
          totalInclTax: totalInclTax.toFixed(2),
          taxRate: sstRate.toFixed(4),
          createdBy: systemUserId,
          updatedBy: systemUserId,
        },
        dbClient
      );

      const invoiceItemInserts: InvoiceItemInsertType[] = pricedItems.map((item, index) => ({
        invoiceId: invoice.id,
        skuId: item.skuId,
        description: item.skuDescription ?? null,
        qty: item.qtyRequired,
        unitPrice: item.unitPrice.toFixed(2),
        subTotal: item.subTotal.toFixed(2),
        itemNo: String(index + 1),
        createdBy: systemUserId,
        updatedBy: systemUserId,
      }));

      if (invoiceItemInserts.length > 0) {
        await this.createInvoiceItems(invoiceItemInserts, dbClient);
      }

      return invoice;
    };

    try {
      logger.info("ℹ️ [InvoicesRepository.createInvoiceFromDeliveryOrder] Creating invoice from delivery order...");
      if (tx) {
        const invoice = await run(tx);
        logger.info("✅ [InvoicesRepository.createInvoiceFromDeliveryOrder] Invoice created successfully");
        return invoice;
      }
      const invoice = await db.transaction(async (dbTx) => run(dbTx));
      logger.info("✅ [InvoicesRepository.createInvoiceFromDeliveryOrder] Invoice created successfully");
      return invoice;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.createInvoiceFromDeliveryOrder] Error:", error);
      throw error;
    }
  }
}
