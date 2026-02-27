/**
 * Warehouses GraphQL Resolvers
 *
 * @description Resolver functions for Warehouse operations.
 */

import { prettifyError, z } from "zod";
import { warehousesRepository, authRepository } from "@/composition-root";
import { withAudit } from "@/features/audit-log/audit.wrapper";
import { GraphQLError } from "graphql/error";
import { logger } from "@/util/logger";
import { GraphQLContext } from "@/graphql/context";
import { WarehouseFilter } from "./warehouses.repository";

// ============================================
// HELPER FUNCTIONS
// ============================================

type WarehouseWithAuditUsers = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string | null;
  warehouseAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
  createdByUser?: { id: string; displayName: string };
  updatedByUser?: { id: string; displayName: string };
};

function transformWarehouse(warehouse: WarehouseWithAuditUsers) {
  return {
    warehouseId: warehouse.warehouseId,
    warehouseName: warehouse.warehouseName,
    warehouseCode: warehouse.warehouseCode,
    warehouseAddress: warehouse.warehouseAddress,
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
    createdBy: warehouse.createdBy,
    updatedBy: warehouse.updatedBy,
    createdByUser: warehouse.createdByUser ?? null,
    updatedByUser: warehouse.updatedByUser ?? null,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get warehouses with optional filtering and pagination
     */
    warehouses: async (
      _: unknown,
      args: {
        filter?: {
          warehouseId?: string;
          warehouseIds?: string[];
          warehouseCode?: string;
          warehouseCodes?: string[];
          warehouseName?: string;
        };
        pageSize?: number;
        pageNumber?: number;
      }
    ) => {
      const filter: WarehouseFilter = {};

      if (args.filter) {
        if (args.filter.warehouseIds) {
          filter.warehouseId = args.filter.warehouseIds;
        } else if (args.filter.warehouseId) {
          filter.warehouseId = args.filter.warehouseId;
        }

        if (args.filter.warehouseCodes) {
          filter.warehouseCode = args.filter.warehouseCodes;
        } else if (args.filter.warehouseCode) {
          filter.warehouseCode = args.filter.warehouseCode;
        }

        if (args.filter.warehouseName) {
          filter.warehouseName = args.filter.warehouseName;
        }
      }

      const result = await warehousesRepository.getWarehouse(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      // Batch-load audit users to avoid N+1
      const allUserIds = Array.from(
        new Set(
          result.query.flatMap((w: any) => [w.createdBy, w.updatedBy].filter(Boolean))
        )
      );

      const users = await authRepository.getUsersByIds(allUserIds);
      const userMap = new Map(users.map((u) => [u.id, u]));

      return {
        query: result.query.map((w: any) =>
          transformWarehouse({
            ...w,
            createdByUser: w.createdBy
              ? userMap.get(w.createdBy)
                ? { id: w.createdBy, displayName: userMap.get(w.createdBy)!.displayName }
                : undefined
              : undefined,
            updatedByUser: w.updatedBy
              ? userMap.get(w.updatedBy)
                ? { id: w.updatedBy, displayName: userMap.get(w.updatedBy)!.displayName }
                : undefined
              : undefined,
          })
        ),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single warehouse by ID
     */
    warehouse: async (_: unknown, { id }: { id: string }) => {
      const warehouse = await warehousesRepository.getWarehouseById(id);
      if (!warehouse) return null;

      // For single warehouse, N+1 isn't an issue, but we can still batch-style load
      const users = await authRepository.getUsersByIds(
        [warehouse.createdBy, warehouse.updatedBy].filter(Boolean) as string[]
      );
      const userMap = new Map(users.map((u) => [u.id, u]));

      return transformWarehouse({
        ...(warehouse as any),
        createdByUser: warehouse.createdBy
          ? userMap.get(warehouse.createdBy)
            ? { id: warehouse.createdBy, displayName: userMap.get(warehouse.createdBy)!.displayName }
            : undefined
          : undefined,
        updatedByUser: warehouse.updatedBy
          ? userMap.get(warehouse.updatedBy)
            ? { id: warehouse.updatedBy, displayName: userMap.get(warehouse.updatedBy)!.displayName }
            : undefined
          : undefined,
      });
    },
  },
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
        { input }: { input: { warehouseName: string; warehouseCode?: string | null; warehouseAddress?: string | null } },
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

    /**
     * Update an existing warehouse
     */
    updateWarehouse: withAudit(
      {
        entity: "Warehouse",
        action: "UPDATE",
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await warehousesRepository.getWarehouseById(args.id);
        },
      },
      async (
        _: unknown,
        { id, input }: { id: string; input: { warehouseName?: string; warehouseCode?: string; warehouseAddress?: string } },
        context: GraphQLContext
      ) => {
        const updateWarehouseSchema = z.object({
          warehouseName: z.string().min(1).optional(),
          warehouseCode: z
            .string()
            .min(1, "Warehouse code cannot be empty")
            .max(255)
            .optional(),
          warehouseAddress: z.string().max(1000).optional(),
        });

        logger.info("ℹ️ [WarehousesResolvers.updateWarehouse] Processing input...");
        logger.debug("🔍 [WarehousesResolvers.updateWarehouse] Input:", input);
        const { success, data, error } = updateWarehouseSchema.safeParse(input);

        if (!success) {
          logger.warn("⚠️ [WarehousesResolvers.updateWarehouse] Invalid input:", prettifyError(error));
          throw new GraphQLError("Invalid input", {
            extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
          });
        }

        logger.info("ℹ️ [WarehousesResolvers.updateWarehouse] Input validated successfully");
        logger.debug("🔍 [WarehousesResolvers.updateWarehouse] Data:", data);

        const updatedBy = context.user?.id ?? "system";
        const updateData: Record<string, unknown> = { updatedBy };

        if (data.warehouseName !== undefined) updateData.warehouseName = data.warehouseName;
        if (data.warehouseCode !== undefined) updateData.warehouseCode = data.warehouseCode;
        if (data.warehouseAddress !== undefined) updateData.warehouseAddress = data.warehouseAddress;

        logger.info("ℹ️ [WarehousesResolvers.updateWarehouse] Updating warehouse...");
        const warehouse = await warehousesRepository.updateWarehouse(id, updateData);
        if (!warehouse) return null;

        logger.info("✅ [WarehousesResolvers.updateWarehouse] Warehouse updated successfully");
        return transformWarehouse(warehouse as any);
      }
    ),
  },
  Warehouse: {
    /**
     * Resolve createdByUser for a warehouse
     */
    createdByUser: async (warehouse: { createdBy: string }) => {
      // Prefer preloaded data (from transformWarehouse) to avoid extra DB calls
      // @ts-expect-error allow reading potential preloaded field
      if (warehouse.createdByUser) {
        // @ts-expect-error
        return warehouse.createdByUser;
      }
      const user = await authRepository.getUserById(warehouse.createdBy);
      if (!user) return null;
      return { id: user.id, displayName: user.displayName };
    },

    /**
     * Resolve updatedByUser for a warehouse
     */
    updatedByUser: async (warehouse: { updatedBy: string }) => {
      // Prefer preloaded data (from transformWarehouse) to avoid extra DB calls
      // @ts-expect-error allow reading potential preloaded field
      if (warehouse.updatedByUser) {
        // @ts-expect-error
        return warehouse.updatedByUser;
      }
      const user = await authRepository.getUserById(warehouse.updatedBy);
      if (!user) return null;
      return { id: user.id, displayName: user.displayName };
    },
  },
};

