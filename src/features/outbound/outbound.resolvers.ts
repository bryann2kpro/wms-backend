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

// ============================================
// HELPERS
// ============================================

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
