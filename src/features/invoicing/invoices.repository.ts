/**
 * Invoices Repository
 *
 * @description Data access layer for Invoices and Invoice Items.
 * Creates invoices from delivery orders when eligible (n+2 rule or month-end rule).
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
} from "./invoices.model";
import {
  DeliveryOrdersTable,
  DeliveryOrderItemsTable,
  type DeliveryOrderType,
} from "@/features/outbound/delivery-orders.model";
import { SkuTable } from "@/features/master-data/sku.model";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { DbTransaction } from "@/types/db-transaction";
import { eq, and, like, inArray, gte, lte, or, sql, isNull } from "drizzle-orm";

/** Db or transaction client for methods that can run in or out of a transaction */
type DbClient = typeof db | DbTransaction;

const ELIGIBLE_DO_STATUSES = ["SHIPPED", "DELIVERED"] as const;

export class InvoicesRepositoryClass {
  constructor() {}

  private static readonly INVOICE_ADDRESS_SNAPSHOT_ID = "02858010-2dcf-4ef1-82f5-1a5f677a01b1";

  // ============================================
  // Eligibility (n+2 rule and month-end rule)
  // ============================================

  /**
   * Returns delivery orders eligible for invoicing:
   * - Status SHIPPED or DELIVERED
   * - No existing invoice for this DO
   * - Either: updated_at <= now - 2 days (n+2) OR (today in month-end window AND created_at <= 2 days before end of DO's month)
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
      const [row] = await dbClient.select().from(InvoicesTable).where(eq(InvoicesTable.id, id)).limit(1);
      return row ?? null;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getInvoiceById] Error:", error);
      throw error;
    }
  }

  async getInvoices(
    filter: InvoiceFilter,
    paginationParams: PaginationParams
  ): Promise<PaginatedResponse<InvoiceType>> {
    try {
      logger.info("ℹ️ [InvoicesRepository.getInvoices] Getting invoices...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(InvoicesTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(InvoicesTable.id, filter.id));
      }
      if (filter.invoiceNo) {
        whereCondition.push(like(InvoicesTable.invoiceNo, `%${filter.invoiceNo}%`));
      }
      if (Array.isArray(filter.doId)) {
        whereCondition.push(inArray(InvoicesTable.doId, filter.doId));
      } else if (filter.doId) {
        whereCondition.push(eq(InvoicesTable.doId, filter.doId));
      }
      if (Array.isArray(filter.poId)) {
        whereCondition.push(inArray(InvoicesTable.poId, filter.poId));
      } else if (filter.poId) {
        whereCondition.push(eq(InvoicesTable.poId, filter.poId));
      }
      if (Array.isArray(filter.status)) {
        whereCondition.push(inArray(InvoicesTable.status, filter.status));
      } else if (filter.status) {
        whereCondition.push(eq(InvoicesTable.status, filter.status));
      }
      if (filter.dateIssuedFrom) {
        whereCondition.push(gte(InvoicesTable.dateIssued, new Date(filter.dateIssuedFrom)));
      }
      if (filter.dateIssuedTo) {
        whereCondition.push(lte(InvoicesTable.dateIssued, new Date(filter.dateIssuedTo)));
      }
      if (filter.createdAtFrom) {
        whereCondition.push(gte(InvoicesTable.createdAt, new Date(filter.createdAtFrom)));
      }
      if (filter.createdAtTo) {
        whereCondition.push(lte(InvoicesTable.createdAt, new Date(filter.createdAtTo)));
      }

      const baseQuery = db
        .select()
        .from(InvoicesTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info("✅ [InvoicesRepository.getInvoices] Invoices fetched successfully");
      return { query: data as InvoiceType[], pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getInvoices] Error:", error);
      throw error;
    }
  }

  async getInvoiceItemsByInvoiceId(invoiceId: string, tx?: DbClient): Promise<InvoiceItemType[]> {
    try {
      const dbClient = tx ?? db;
      const rows = await dbClient
        .select()
        .from(InvoiceItemsTable)
        .where(eq(InvoiceItemsTable.invoiceId, invoiceId));
      return rows;
    } catch (error) {
      logger.error("❌ [InvoicesRepository.getInvoiceItemsByInvoiceId] Error:", error);
      throw error;
    }
  }

  // ============================================
  // Invoice number generation
  // ============================================

  /**
   * Generates a unique invoice number in format INV-YYYYMMDD-NNNN.
   * Should be called within a transaction when used from createInvoiceFromDeliveryOrder.
   */
  async generateInvoiceNo(tx?: DbClient): Promise<string> {
    const dbClient = tx ?? db;
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const prefix = `INV-${yyyy}${mm}${dd}-`;

    const existing = await dbClient
      .select({ invoiceNo: InvoicesTable.invoiceNo })
      .from(InvoicesTable)
      .where(like(InvoicesTable.invoiceNo, `${prefix}%`));

    const nextSeq = existing.length + 1;
    const suffix = String(nextSeq).padStart(4, "0");
    return `${prefix}${suffix}`;
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
    createdBy: string,
    tx?: DbTransaction
  ): Promise<InvoiceType> {
    const run = async (dbClient: DbClient) => {
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

      const invoiceNo = await this.generateInvoiceNo(dbClient);

      const invoice = await this.createInvoice(
        {
          invoiceNo,
          doId: doRow.id,
          poId: doRow.purchaseOrderId,
          poNo: doRow.poNo,
          billingAddressId: InvoicesRepositoryClass.INVOICE_ADDRESS_SNAPSHOT_ID,
          deliveryAddressId: InvoicesRepositoryClass.INVOICE_ADDRESS_SNAPSHOT_ID,
          status: "GENERATED",
          dateIssued: new Date(),
          createdBy,
          updatedBy: createdBy,
        },
        dbClient
      );

      const invoiceItemInserts: InvoiceItemInsertType[] = doItems.map((item, index) => ({
        invoiceId: invoice.id,
        skuId: item.skuId,
        description: item.skuDescription ?? null,
        qty: item.qtyRequired,
        unitPrice: "0",
        subTotal: "0",
        itemNo: String(index + 1),
        createdBy,
        updatedBy: createdBy,
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
