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
import { DeliveryOrderType, DeliveryOrderFilter } from "./delivery-orders.model";
import { PurchaseOrderType, PurchaseOrderFilter } from "./purchase-orders.model";

// ============================================
// ZOD SCHEMAS (input sanitization)
// ============================================

const createDeliveryOrderItemSchema = z
  .object({
    skuId: z.uuid().optional(),
    skuCode: z.string().min(1).optional(),
    qtyRequired: z.union([z.number().positive(), z.string()]).transform((v) => String(v)),
  })
  .refine((data) => data.skuId ?? data.skuCode, {
    message: "Each item must have either skuId or skuCode",
    path: ["items"],
  });

const createDeliveryOrderInputSchema = z.object({
  purchaseOrderNo: z.string().min(1, "Purchase order number is required").trim(),
  deliveryOrderNo: z.string().min(1, "Delivery order number is required").trim(),
  outletId: z.uuid("Outlet ID must be a valid UUID"),
  orderCreatedAt: z
    .string()
    .optional()
    .transform((s) => (s ? new Date(s) : undefined)),
  items: z
    .array(createDeliveryOrderItemSchema)
    .min(1, "At least one line item is required"),
});

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

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  /** Resolves nested fields on PurchaseOrder (e.g. outlet from outletId). Uses DataLoader to batch outlet lookups (avoids N+1). */
  PurchaseOrder: {
    outlet: async (parent: { outletId: string }, _args: unknown, context: GraphQLContext) => {
      const outlet = await context.getOutletLoader().load(parent.outletId);
      return outlet ? transformOutletForGraphQL(outlet) : null;
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

        console.log('fromDate', fromDate);
        console.log('toDate', toDate);

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
  },
  Mutation: {
    createPurchaseOrder: withAudit<
      unknown,
      { input: { purchaseOrderNo: string; outletId: string; items: Array<{ skuCode: string; skuId?: string; qtyRequired: number }> } },
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
        });
        return transformPurchaseOrder(created);
      }
    ),

    createDeliveryOrder: withAudit<
      unknown,
      {
        input: {
          purchaseOrderNo: string;
          deliveryOrderNo: string;
          outletId: string;
          orderCreatedAt?: string;
          items: Array<{ skuId?: string; skuCode?: string; qtyRequired: number }>;
        };
      },
      unknown
    >(
      {
        entity: "DeliveryOrder",
        action: "CREATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "id" in result ? (result as { id: string }).id : null,
      },
      async (_: unknown, { input }, context: GraphQLContext) => {
        const userId = context.user?.id ?? null;
        if (!userId) {
          throw new GraphQLError("Authentication required to create a delivery order", {
            extensions: { code: "UNAUTHENTICATED", http: { status: 401 } },
          });
        }

        logger.info("ℹ️ [outbound.resolvers.createDeliveryOrder] Validating input...");
        const parseResult = createDeliveryOrderInputSchema.safeParse(input);

        if (!parseResult.success) {
          const message = prettifyError(parseResult.error);
          logger.warn("⚠️ [outbound.resolvers.createDeliveryOrder] Invalid input:", message);
          throw new GraphQLError(message, {
            extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
          });
        }

        const data = parseResult.data;
        logger.info("ℹ️ [outbound.resolvers.createDeliveryOrder] Input validated, calling service...");

        const deliveryOrder = await outboundServices.createDeliveryOrder({
          userId,
          purchaseOrderNo: data.purchaseOrderNo,
          deliveryOrderNo: data.deliveryOrderNo,
          outletId: data.outletId,
          orderCreatedAt: data.orderCreatedAt,
          items: data.items.map((item) => ({
            ...(item.skuId && { skuId: item.skuId }),
            ...(item.skuCode && { skuCode: item.skuCode }),
            qtyRequired: item.qtyRequired,
          })),
        });

        logger.info("✅ [outbound.resolvers.createDeliveryOrder] Delivery order created:", deliveryOrder.doNo);
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
  },
};
