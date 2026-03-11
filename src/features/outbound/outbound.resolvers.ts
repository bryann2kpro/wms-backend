/**
 * Outbound GraphQL Resolvers
 *
 * @description Resolver functions for Outbound operations (Delivery Orders).
 * Uses Zod for input sanitization and OutboundServices for business logic.
 */

import { prettifyError, z } from "zod";
import { outboundServices, deliveryOrdersRepository, purchaseOrdersRepository } from "@/composition-root";
import type { GraphQLContext } from "@/graphql/context";
import { withAudit } from "@/features/audit-log/audit.wrapper";
import { GraphQLError } from "graphql";
import { logger } from "@/util/logger";
import { DeliveryOrderType, DeliveryOrderFilter, DeliveryOrderItemFilter } from "./delivery-orders.model";
import { DeliveryOrderItemWithDetails } from "./delivery-orders.repository";
import { PurchaseOrderType, PurchaseOrderFilter } from "./purchase-orders.model";

// ============================================
// ZOD SCHEMAS (input sanitization)
// ============================================

/** Parses and sanitizes purchase order list filter; strips undefined values. */
const purchaseOrderFilterSchema = z
  .object({
    id: z.union([z.uuid(), z.array(z.uuid())]).optional(),
    purchaseOrderNo: z.string().min(1).optional(),
    outletId: z.union([z.uuid(), z.array(z.string().uuid())]).optional(),
    status: z.union([z.string(), z.array(z.string())]).optional(),
    requestedDeliveryDateFrom: z.string().optional(),
    requestedDeliveryDateTo: z.string().optional(),
    scheduledDeliveryDateFrom: z.string().optional(),
    scheduledDeliveryDateTo: z.string().optional(),
    createdAtFrom: z.string().optional(),
    createdAtTo: z.string().optional(),
  })
  .transform((data): PurchaseOrderFilter => {
    return Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    ) as PurchaseOrderFilter;
  });

/** Input for purchaseOrdersByWeek: optional date range (defaults to today through 7 days in business timezone). */
const purchaseOrderWeekFilterSchema = z.object({
  scheduledDeliveryDateFrom: z.string().optional(),
  scheduledDeliveryDateTo: z.string().optional(),
  outletId: z.string().uuid().optional(),
  status: z.string().optional(),
});

const createPurchaseOrderLineItemSchema = z.object({
  skuCode: z.string().min(1, "SKU code is required"),
  skuId: z.string().uuid().optional(),
  qtyRequired: z.union([z.number().positive(), z.string()]).transform((v) => Number(v)),
});

const createPurchaseOrderInputSchema = z.object({
  purchaseOrderNo: z.string().min(1, "Purchase order number is required").trim(),
  outletId: z.uuid("Outlet ID must be a valid UUID"),
  items: z.array(createPurchaseOrderLineItemSchema).min(1, "At least one line item is required"),
  isEmergency: z.boolean().optional().default(false),
});

const updateDeliveryOrderInputSchema = z.object({
  isEmergency: z.boolean().optional(),
  status: z.enum(["NEW", "PACKING", "SHIPPED", "DELIVERED"]).optional(),
});

// ============================================
// HELPERS
// ============================================

/** Business timezone offset in minutes from UTC (e.g. UTC+8 = 480). */
const BUSINESS_TZ_OFFSET_MINUTES = 8 * 60;

/** Format a date as DD/MM/YYYY in the business timezone. */
function formatDateKeyBusinessTZ(d: Date): string {
  const offsetMs = BUSINESS_TZ_OFFSET_MINUTES * 60_000;
  const shifted = new Date(d.getTime() + offsetMs);
  const day = shifted.getUTCDate();
  const month = shifted.getUTCMonth() + 1;
  const year = shifted.getUTCFullYear();
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

/** Get start of day UTC and end of day UTC for a given date. */
function getDayBoundsUTC(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

/** Get start/end of a day in the business timezone, returned as UTC Date objects. */
function getDayBoundsInBusinessTZ(d: Date): { start: Date; end: Date } {
  const offsetMs = BUSINESS_TZ_OFFSET_MINUTES * 60_000;
  const shifted = new Date(d.getTime() + offsetMs);

  const startShifted = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 0, 0, 0, 0)
  );
  const endShifted = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 23, 59, 59, 999)
  );

  return {
    start: new Date(startShifted.getTime() - offsetMs),
    end: new Date(endShifted.getTime() - offsetMs),
  };
}

/**
 * Default week: from "today" through 7 days (today + 6) in the business timezone.
 * Returns [fromDate, toDate] inclusive, as UTC Date objects.
 */
function getDefaultWeekRangeInBusinessTZ(): [Date, Date] {
  const now = new Date();
  const { start } = getDayBoundsInBusinessTZ(now);
  const endAnchor = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const { end } = getDayBoundsInBusinessTZ(endAnchor);
  return [start, end];
}

function transformDeliveryOrder(order: DeliveryOrderType) {
  return {
    id: order.id,
    doNo: order.doNo,
    poNo: order.poNo,
    status: order.status,
    isEmergency: order.isEmergency,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt?.toISOString() ?? order.createdAt.toISOString(),
    createdBy: order.createdBy,
    updatedBy: order.updatedBy ?? null,
  };
}

function transformPurchaseOrder(po: PurchaseOrderType) {
  return {
    id: po.id,
    purchaseOrderNo: po.purchaseOrderNo,
    outletId: po.outletId,
    status: po.status,
    scheduledDeliveryDate: po.scheduledDeliveryDate?.toISOString() ?? null,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt?.toISOString() ?? po.createdAt.toISOString(),
    createdBy: po.createdBy ?? null,
    updatedBy: po.updatedBy ?? null,
  };
}

/** Maps outlet DB row (with region join) to GraphQL Outlet shape. Used by PurchaseOrder.outlet. */
function transformOutletForGraphQL(outlet: {
  outletId: string;
  outletName: string;
  outletCode: string;
  regionId: string | null;
  regionName: string | null;
  regionCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    outletId: outlet.outletId,
    outletName: outlet.outletName,
    outletCode: outlet.outletCode,
    regionId: outlet.regionId,
    regionName: outlet.regionName,
    regionCode: outlet.regionCode,
    createdAt: outlet.createdAt.toISOString(),
    updatedAt: outlet.updatedAt.toISOString(),
    createdBy: outlet.createdBy,
    updatedBy: outlet.updatedBy,
  };
}

function transformDeliveryOrderItemWithDetails(item: DeliveryOrderItemWithDetails) {
  return {
    id: item.id,
    purchaseOrderId: item.purchaseOrderId,
    purchaseOrderNo: item.purchaseOrderNo,
    skuId: item.skuId,
    qtyRequired: item.qtyRequired,
    qtyPicked: item.qtyPicked ?? "0",
    qtyPacked: item.qtyPacked ?? "0",
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdBy: item.createdBy,
    updatedBy: item.updatedBy ?? null,
    skuCode: item.skuCode ?? null,
    skuDescription: item.skuDescription ?? null,
    doNo: item.doNo ?? null,
    doStatus: item.doStatus ?? null,
    onHandQty: item.onHandQty ?? "0",
    lossQty: item.lossQty ?? "0",
    reservedQty: item.reservedQty ?? "0",
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  /** Resolves nested fields on PurchaseOrder (e.g. outlet from outletId, deliveryOrder from purchaseOrderId). */
  PurchaseOrder: {
    outlet: async (parent: { outletId: string }, _args: unknown, context: GraphQLContext) => {
      const outlet = await context.getOutletLoader().load(parent.outletId);
      return outlet ? transformOutletForGraphQL(outlet) : null;
    },
    deliveryOrder: async (parent: { id: string }) => {
      const doRow = await deliveryOrdersRepository.getDeliveryOrderByPurchaseOrderId(parent.id);
      return doRow ? transformDeliveryOrder(doRow) : null;
    },
  },

  Query: {
    _outboundHealth: () => "Outbound GraphQL is available",
    purchaseOrders: async (
      _: unknown,
      args: {
        filter?: PurchaseOrderFilter & { page?: number; pageSize?: number; pageNumber?: number };
        pageSize?: number;
        pageNumber?: number;
      }
    ) => {
      try {
        const filter = purchaseOrderFilterSchema.parse(args.filter ?? {});
        const paginationParams = {
          pageSize: args.pageSize ?? args.filter?.pageSize ?? 10,
          pageNumber: args.pageNumber ?? args.filter?.pageNumber ?? args.filter?.page ?? 1,
        };

        const result = await purchaseOrdersRepository.getPurchaseOrders(filter, paginationParams);

        return {
          query: result.query.map(transformPurchaseOrder),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("❌ [outbound.resolvers.purchaseOrders] Error:", error);
        return false;
      }
    },

    purchaseOrdersByWeek: async (
      _: unknown,
      args: { filter?: { scheduledDeliveryDateFrom?: string; scheduledDeliveryDateTo?: string; outletId?: string; status?: string } }
    ) => {
      try {
        const filter = purchaseOrderWeekFilterSchema.parse(args.filter ?? {});
        let fromDate: Date;
        let toDate: Date;
        if (filter.scheduledDeliveryDateFrom && filter.scheduledDeliveryDateTo) {
          fromDate = new Date(filter.scheduledDeliveryDateFrom);
          toDate = new Date(filter.scheduledDeliveryDateTo);
          fromDate.setUTCHours(0, 0, 0, 0);
          toDate.setUTCHours(23, 59, 59, 999);
        } else {
          [fromDate, toDate] = getDefaultWeekRangeInBusinessTZ();
        }

        const repoFilter: Partial<PurchaseOrderFilter> = {};
        if (filter.outletId) repoFilter.outletId = filter.outletId;
        if (filter.status) repoFilter.status = filter.status;

        const orders = await purchaseOrdersRepository.getPurchaseOrdersByScheduledDateRange(
          fromDate,
          toDate,
          Object.keys(repoFilter).length > 0 ? repoFilter : undefined
        );

        const byDate = new Map<string, PurchaseOrderType[]>();
        for (const po of orders) {
          if (po.scheduledDeliveryDate) {
            const key = formatDateKeyBusinessTZ(po.scheduledDeliveryDate);
            if (!byDate.has(key)) byDate.set(key, []);
            byDate.get(key)!.push(po);
          }
        }

        const entries: Array<{ date: string; orders: PurchaseOrderType[] }> = [];
        const cursor = new Date(fromDate);
        while (cursor <= toDate) {
          const key = formatDateKeyBusinessTZ(cursor);
          entries.push({ date: key, orders: byDate.get(key) ?? [] });
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        return entries.map((e) => ({
          date: e.date,
          orders: e.orders.map(transformPurchaseOrder),
        }));
      } catch (error) {
        logger.error("❌ [outbound.resolvers.purchaseOrdersByWeek] Error:", error);
        throw error;
      }
    },
    deliveryOrders: async (
      _: unknown,
      args: {
        filter?: DeliveryOrderFilter & { page?: number; pageSize?: number; pageNumber?: number };
        pageSize?: number;
        pageNumber?: number;
      }
    ) => {
      try {
        const filter: DeliveryOrderFilter = {};
        if (args.filter) {
          if (args.filter.id) filter.id = args.filter.id;
          if (args.filter.doNo) filter.doNo = args.filter.doNo;
          if (args.filter.toId) filter.toId = args.filter.toId;
          if (args.filter.status) filter.status = args.filter.status;
          if (args.filter.isEmergency !== undefined) filter.isEmergency = args.filter.isEmergency;
          if (args.filter.createdBy) filter.createdBy = args.filter.createdBy;
          if (args.filter.createdAtFrom) filter.createdAtFrom = args.filter.createdAtFrom;
          if (args.filter.createdAtTo) filter.createdAtTo = args.filter.createdAtTo;
        }

        const pageSize = args.pageSize ?? args.filter?.pageSize;
        const pageNumber = args.pageNumber ?? args.filter?.pageNumber ?? args.filter?.page;

        const paginationParams = {
          pageSize: pageSize ?? 10,
          pageNumber: pageNumber ?? 1,
        };

        const result = await deliveryOrdersRepository.getDeliveryOrders(filter, paginationParams);

        return {
          query: result.query.map(transformDeliveryOrder),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("❌ [outbound.resolvers.deliveryOrders] Error:", error);
        return false;
      }
    },

    deliveryOrderItems: async (
      _: unknown,
      args: {
        filter?: {
          id?: string;
          purchaseOrderNo?: string;
          doNo?: string;
          doStatus?: string;
          search?: string;
        };
        pageSize?: number;
        pageNumber?: number;
      }
    ) => {
      try {
        logger.info("ℹ️ [outbound.resolvers.deliveryOrderItems] Getting delivery order items...");
        const filter: DeliveryOrderItemFilter & {
          purchaseOrderNo?: string;
          doNo?: string;
          doStatus?: string;
          search?: string;
        } = {};

        if (args.filter) {
          if (args.filter.id) filter.id = args.filter.id;
          if (args.filter.purchaseOrderNo) filter.purchaseOrderNo = args.filter.purchaseOrderNo;
          if (args.filter.doNo) filter.doNo = args.filter.doNo;
          if (args.filter.doStatus) filter.doStatus = args.filter.doStatus;
          if (args.filter.search) filter.search = args.filter.search;
        }

        const paginationParams = {
          pageSize: args.pageSize ?? 10,
          pageNumber: args.pageNumber ?? 1,
        };

        const result = await deliveryOrdersRepository.getDeliveryOrderItemsWithDetails(filter, paginationParams);

        logger.info("✅ [outbound.resolvers.deliveryOrderItems] Delivery order items fetched:", result.query.length);
        return {
          query: result.query.map(transformDeliveryOrderItemWithDetails),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("❌ [outbound.resolvers.deliveryOrderItems] Error:", error);
        throw error;
      }
    },
  },
  Mutation: {
    createPurchaseOrder: withAudit<
      unknown,
      { input: { purchaseOrderNo: string; outletId: string; items: Array<{ skuCode: string; skuId?: string; qtyRequired: number }>; isEmergency?: boolean } },
      unknown
    >(
      {
        entity: "PurchaseOrder",
        action: "CREATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "id" in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { input }, context: GraphQLContext) => {
        const userId = context.user?.id ?? null;
        if (!userId) {
          throw new GraphQLError("Authentication required to create a purchase order", {
            extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
          });
        }
        const parseResult = createPurchaseOrderInputSchema.safeParse(input);
        if (!parseResult.success) {
          const message = prettifyError(parseResult.error);
          throw new GraphQLError(message, {
            extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
          });
        }
        const data = parseResult.data;
        const created = await outboundServices.createPurchaseOrder({
          userId,
          purchaseOrderNo: data.purchaseOrderNo,
          outletId: data.outletId,
          items: data.items.map((item) => ({
            skuCode: item.skuCode,
            skuId: item.skuId,
            qtyRequired: item.qtyRequired,
          })),
          isEmergency: data.isEmergency,
        });
        return transformPurchaseOrder(created);
      }
    ),

    applyEmergencyDelivery: withAudit<
      unknown,
      { id: string },
      unknown
    >(
      {
        entity: "PurchaseOrder",
        action: "UPDATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "id" in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { id }, context: GraphQLContext) => {
        const userId = context.user?.id ?? null;
        if (!userId) {
          throw new GraphQLError("Authentication required to apply emergency delivery", {
            extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
          });
        }
        const po = await outboundServices.applyEmergencyDelivery(id, userId);
        return transformPurchaseOrder(po);
      }
    ),

    updateDeliveryOrder: withAudit<
      unknown,
      { id: string; input: { isEmergency?: boolean } },
      unknown
    >(
      {
        entity: "DeliveryOrder",
        action: "UPDATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "id" in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { id, input }, context: GraphQLContext) => {
        const userId = context.user?.id ?? null;
        if (!userId) {
          throw new GraphQLError("Authentication required to update a delivery order", {
            extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
          });
        }
        const parseResult = updateDeliveryOrderInputSchema.safeParse(input);
        if (!parseResult.success) {
          const message = prettifyError(parseResult.error);
          throw new GraphQLError(message, {
            extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
          });
        }
        const data = parseResult.data;
        if (Object.keys(data).length === 0) {
          throw new GraphQLError("At least one field must be provided to update", {
            extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
          });
        }
        const deliveryOrder = await outboundServices.updateDeliveryOrder(id, {
          ...data,
          updatedBy: userId,
        });
        return transformDeliveryOrder(deliveryOrder);
      }
    ),

    advanceDeliveryOrderStatus: withAudit<
      unknown,
      { id: string },
      unknown
    >(
      {
        entity: "DeliveryOrder",
        action: "UPDATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "id" in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { id }, context: GraphQLContext) => {
        const userId = context.user?.id ?? null;
        if (!userId) {
          throw new GraphQLError("Authentication required to advance delivery order status", {
            extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
          });
        }
        const deliveryOrder = await outboundServices.advanceDeliveryOrderStatus({ id, userId });
        return transformDeliveryOrder(deliveryOrder);
      }
    ),

    completeDeliveryOrder: withAudit<
      unknown,
      { id: string },
      unknown
    >(
      {
        entity: "DeliveryOrder",
        action: "UPDATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "id" in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { id }, context: GraphQLContext) => {
        const userId = context.user?.id ?? null;
        if (!userId) {
          throw new GraphQLError("Authentication required to complete a delivery order", {
            extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
          });
        }

        logger.info("ℹ️ [outbound.resolvers.completeDeliveryOrder] Completing delivery order...");
        const deliveryOrder = await outboundServices.completeDeliveryOrder({
          userId,
          id,
        });

        logger.info("✅ [outbound.resolvers.completeDeliveryOrder] Delivery order completed:", deliveryOrder.id);
        return transformDeliveryOrder(deliveryOrder);
      }
    ),

    markDeliveryOrderItemPicked: withAudit<
      unknown,
      { id: string; qtyPicked: string },
      unknown
    >(
      {
        entity: "DeliveryOrderItem",
        action: "UPDATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "id" in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { id, qtyPicked }, context: GraphQLContext) => {
        const userId = context.user?.id ?? null;
        if (!userId) {
          throw new GraphQLError("Authentication required to mark item as picked", {
            extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
          });
        }

        logger.info("ℹ️ [outbound.resolvers.markDeliveryOrderItemPicked] Marking item as picked...");
        await deliveryOrdersRepository.markItemAsPicked(id, qtyPicked, userId);

        const result = await deliveryOrdersRepository.getDeliveryOrderItemsWithDetails(
          { id },
          { pageSize: 1, pageNumber: 1 }
        );

        if (!result.query.length) {
          throw new GraphQLError("Delivery order item not found", {
            extensions: { code: "NOT_FOUND", http: { status: 404 } },
          });
        }

        logger.info("✅ [outbound.resolvers.markDeliveryOrderItemPicked] Item marked as picked:", id);
        return transformDeliveryOrderItemWithDetails(result.query[0]);
      }
    ),
  },
};
