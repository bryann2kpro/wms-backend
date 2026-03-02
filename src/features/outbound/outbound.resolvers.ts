/**
 * Outbound GraphQL Resolvers
 *
 * @description Resolver functions for Outbound operations (Delivery Orders).
 * Uses Zod for input sanitization and OutboundServices for business logic.
 */

import { prettifyError, z } from "zod";
import { outboundServices } from "@/composition-root";
import { withAudit } from "@/features/audit-log/audit.wrapper";
import { GraphQLContext } from "@/graphql/context";
import { GraphQLError } from "graphql";
import { logger } from "@/util/logger";
import { DeliveryOrderType } from "./delivery-orders.model";

// ============================================
// ZOD SCHEMAS (input sanitization)
// ============================================

const createDeliveryOrderItemSchema = z
  .object({
    skuId: z.string().uuid().optional(),
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

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    _outboundHealth: () => "Outbound GraphQL is available",
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
  },
};
