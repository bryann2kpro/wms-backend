/**
 * Warehouses GraphQL Resolvers
 *
 * @description Resolver functions for Warehouse operations.
 */

import { z } from "zod";
import { warehousesRepository, authRepository } from "@/composition-root";

const UUID_SCHEMA = z.string().uuid();
const isUUID = (val: string) => UUID_SCHEMA.safeParse(val).success;
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

const warehouseFilterSchema = z.object({
  warehouseId: z.string().uuid().optional(),
  warehouseIds: z.array(z.string().uuid()).optional(),
  warehouseCode: z.string().optional(),
  warehouseCodes: z.array(z.string()).optional(),
  warehouseName: z.string().optional(),
}).transform((data) => ({
  ...data,
  warehouseIds: data.warehouseId ? [data.warehouseId] : data.warehouseIds,
  warehouseCodes: data.warehouseCode ? [data.warehouseCode] : data.warehouseCodes,
}));

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
      },
      context: GraphQLContext
    ) => {
      const filter: WarehouseFilter = {};

      if (args.filter) {
        const { success, data, error } = warehouseFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
        }
        if (data.warehouseIds) filter.warehouseId = data.warehouseIds;
        if (data.warehouseCodes) filter.warehouseCode = data.warehouseCodes;
        if (data.warehouseName) filter.warehouseName = data.warehouseName;
      }

      const result = await warehousesRepository.getWarehouse(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      // Batch-load audit users to avoid N+1 — skip non-UUID values like "system"
      const allUserIds = Array.from(
        new Set(
          result.query.flatMap((w: any) => [w.createdBy, w.updatedBy].filter(Boolean))
        )
      ).filter(isUUID);

      const users = allUserIds.length > 0 ? await authRepository.getUsersByIds(allUserIds) : [];
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
    warehouse: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const warehouse = await warehousesRepository.getWarehouseById(id, context.organizationId || undefined);
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
          logger.warn("⚠️ [WarehousesResolvers.createWarehouse] Invalid input:", error.flatten().fieldErrors);
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
        }
        logger.info("ℹ️ [WarehousesResolvers.createWarehouse] Input validated successfully");
        logger.debug("🔍 [WarehousesResolvers.createWarehouse] Data:", data);
        
        const userId = context.user?.id ?? "system";

        logger.info("ℹ️ [WarehousesResolvers.createWarehouse] Creating warehouse...");
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const warehouse = await warehousesRepository.createWarehouse({
          organizationId: context.organizationId,
          warehouseName: data.warehouseName,
          warehouseCode: data.warehouseCode ?? null,
          warehouseAddress: data.warehouseAddress ?? null,
          createdBy: userId,
          updatedBy: userId,
        }, context.tx);
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
        getOldData: async (args, context) => {
          return await warehousesRepository.getWarehouseById(args.id, (context as GraphQLContext).organizationId || undefined);
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
          logger.warn("⚠️ [WarehousesResolvers.updateWarehouse] Invalid input:", error.flatten().fieldErrors);
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
        }

        logger.info("ℹ️ [WarehousesResolvers.updateWarehouse] Input validated successfully");
        logger.debug("🔍 [WarehousesResolvers.updateWarehouse] Data:", data);

        const updatedBy = context.user?.id ?? "system";
        const updateData: Record<string, unknown> = { updatedBy };

        if (data.warehouseName !== undefined) updateData.warehouseName = data.warehouseName;
        if (data.warehouseCode !== undefined) updateData.warehouseCode = data.warehouseCode;
        if (data.warehouseAddress !== undefined) updateData.warehouseAddress = data.warehouseAddress;

        logger.info("ℹ️ [WarehousesResolvers.updateWarehouse] Updating warehouse...");
        const warehouse = await warehousesRepository.updateWarehouse(id, updateData, context.organizationId || undefined, context.tx);
        if (!warehouse) return null;

        logger.info("✅ [WarehousesResolvers.updateWarehouse] Warehouse updated successfully");
        return transformWarehouse(warehouse as any);
      }
    ),

    /**
     * Delete a warehouse
     */
    deleteWarehouse: withAudit(
      {
        entity: "Warehouse",
        action: "DELETE",
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await warehousesRepository.getWarehouseById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await warehousesRepository.deleteWarehouse(id, context.organizationId || undefined, context.tx);
      }
    ),
  },
  Warehouse: {
    /**
     * Resolve createdByUser for a warehouse
     */
    createdByUser: async (warehouse: { createdBy: string }) => {
      // @ts-expect-error allow reading potential preloaded field
      if (warehouse.createdByUser) {
        // @ts-expect-error
        return warehouse.createdByUser;
      }
      if (!isUUID(warehouse.createdBy)) return null;
      const user = await authRepository.getUserById(warehouse.createdBy);
      if (!user) return null;
      return { id: user.id, displayName: user.displayName };
    },

    /**
     * Resolve updatedByUser for a warehouse
     */
    updatedByUser: async (warehouse: { updatedBy: string }) => {
      // @ts-expect-error allow reading potential preloaded field
      if (warehouse.updatedByUser) {
        // @ts-expect-error
        return warehouse.updatedByUser;
      }
      if (!isUUID(warehouse.updatedBy)) return null;
      const user = await authRepository.getUserById(warehouse.updatedBy);
      if (!user) return null;
      return { id: user.id, displayName: user.displayName };
    },
  },
};

