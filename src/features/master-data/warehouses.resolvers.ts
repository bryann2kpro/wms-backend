/**
 * Warehouses GraphQL Resolvers
 *
 * @description Resolver functions for Warehouse operations.
 */

import { prettifyError, z } from "zod";
import { warehousesRepository } from "@/composition-root";
import { withAudit } from "@/features/audit-log/audit.wrapper";
import { GraphQLError } from "graphql/error";
import { logger } from "@/util/logger";
import { GraphQLContext } from "@/graphql/context";

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformWarehouse(warehouse: {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string | null;
  warehouseAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    warehouseId: warehouse.warehouseId,
    warehouseName: warehouse.warehouseName,
    warehouseCode: warehouse.warehouseCode,
    warehouseAddress: warehouse.warehouseAddress,
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
    createdBy: warehouse.createdBy,
    updatedBy: warehouse.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Mutation: {
    /**
     * Create a new warehouse
     */
    createWarehouse: withAudit(
      {
        entity: "Warehouse",
        action: "CREATE",
        getEntityId: (result) =>
          result && typeof result === "object" && "warehouseId" in result
            ? (result as any).warehouseId
            : null,
      },
      async (
        _: unknown,
        {
          input,
        }: {
          input: {
            warehouseName: string;
            warehouseCode?: string | null;
            warehouseAddress?: string | null;
          };
        },
        context: GraphQLContext
      ) => {

        const createWarehouseSchema = z.object({
          warehouseName: z.string().min(1, "Warehouse name is required"),
          warehouseCode: z
            .string()
            .min(1, "Warehouse code cannot be empty")
            .max(255)
            .optional()
            .nullable()
            .transform((val) => (val === "" ? null : val ?? null)),
          warehouseAddress: z
            .string()
            .max(1000)
            .optional()
            .nullable()
            .transform((val) => (val === "" ? null : val ?? null)),
        });
        logger.info("ℹ️ [WarehousesResolvers.createWarehouse] Processing input...");
        logger.debug("🔍 [WarehousesResolvers.createWarehouse] Input:", input);
        const { success, data, error } = createWarehouseSchema.safeParse(input);

        if (!success) {
          logger.warn("⚠️ [WarehousesResolvers.createWarehouse] Invalid input:", prettifyError(error));
          throw new GraphQLError("Invalid input", {
            extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
          });
        }
        logger.info("ℹ️ [WarehousesResolvers.createWarehouse] Input validated successfully");
        logger.debug("🔍 [WarehousesResolvers.createWarehouse] Data:", data);
        
        const userId = context.user?.id ?? "system";

        logger.info("ℹ️ [WarehousesResolvers.createWarehouse] Creating warehouse...");
        const warehouse = await warehousesRepository.createWarehouse({
          warehouseName: data.warehouseName,
          warehouseCode: data.warehouseCode ?? null,
          warehouseAddress: data.warehouseAddress ?? null,
          createdBy: userId,
          updatedBy: userId,
        });
        logger.info("✅ [WarehousesResolvers.createWarehouse] Warehouse created successfully");
        return transformWarehouse(warehouse);
      }
    ),
  },
};

