/**
 * SKU GraphQL Resolvers
 * 
 * @description Resolver functions for SKU (Stock Keeping Unit) operations.
 * Uses SkuRepository for data access (proper layer separation).
 * 
 * Type definitions are in sku.typeDefs.ts
 */

import { skuRepository, suppliersRepository } from '@/composition-root';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { logger } from '@/util/logger';
import { SkuType } from './sku.repository';
import { z } from 'zod';
import { GraphQLError } from 'graphql';

const createSkuSchema = z.object({
  skuCode: z.string().min(1, 'SKU code is required'),
  skuDescription: z.string().min(1, 'SKU description is required'),
  skuUom: z.string().min(1, 'Unit of measure is required'),
  isActive: z.boolean(),
  barcode: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  caseRate: z.number().nonnegative().optional().nullable(),
  caseExtLengthMm: z.number().nonnegative().optional().nullable(),
  caseExtWidthMm: z.number().nonnegative().optional().nullable(),
  caseExtHeightMm: z.number().nonnegative().optional().nullable(),
  caseGrossWeightKg: z.number().nonnegative().optional().nullable(),
  casesPerLayer: z.number().nonnegative().optional().nullable(),
  noOfLayers: z.number().nonnegative().optional().nullable(),
  skuExpiryDate: z.string().optional().nullable(),
  skuSuppliers: z.array(z.object({
    supplierId: z.string().uuid('Invalid supplier ID'),
    originalSkuCode: z.string().optional().nullable(),
  })).optional(),
  pickingStrategy: z.enum(['FIFO', 'LIFO', 'FEFO']).optional().nullable(),
  isLotControlled: z.boolean().optional(),
  isExpiryControlled: z.boolean().optional(),
  looseQuantity: z.number().nonnegative().optional().nullable(),
  initialOnHandQty: z.number().nonnegative().optional().nullable(),
  createdBy: z.string().optional().nullable(),
  updatedBy: z.string().optional().nullable(),
});

const updateSkuSchema = z.object({
  skuCode: z.string().min(1).optional(),
  skuDescription: z.string().min(1).optional(),
  skuUom: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  barcode: z.string().optional().nullable(),
  brand: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  manufacturer: z.string().optional().nullable(),
  caseRate: z.number().nonnegative().optional().nullable(),
  caseExtLengthMm: z.number().nonnegative().optional().nullable(),
  caseExtWidthMm: z.number().nonnegative().optional().nullable(),
  caseExtHeightMm: z.number().nonnegative().optional().nullable(),
  caseGrossWeightKg: z.number().nonnegative().optional().nullable(),
  casesPerLayer: z.number().nonnegative().optional().nullable(),
  noOfLayers: z.number().nonnegative().optional().nullable(),
  skuExpiryDate: z.string().optional().nullable(),
  skuSuppliers: z.array(z.object({
    supplierId: z.string().uuid('Invalid supplier ID'),
    originalSkuCode: z.string().optional().nullable(),
  })).optional().nullable(),
  pickingStrategy: z.enum(['FIFO', 'LIFO', 'FEFO']).optional().nullable(),
  isLotControlled: z.boolean().optional(),
  isExpiryControlled: z.boolean().optional(),
  looseQuantity: z.number().nonnegative().optional().nullable(),
  updatedBy: z.string().optional().nullable(),
});

function resolvePickingStrategy(
  pickingStrategy: string | null | undefined,
  isExpiryControlled: boolean,
): string {
  const strategy = pickingStrategy ?? 'FIFO';
  if (strategy === 'FEFO' && !isExpiryControlled) {
    return 'FIFO';
  }
  return strategy;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Transform supplier for GraphQL response
 */
function transformSupplier(supplier: {
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    supplierId: supplier.supplierId,
    supplierName: supplier.supplierName,
    supplierCode: supplier.supplierCode,
    createdAt: supplier.createdAt.toISOString(),
    updatedAt: supplier.updatedAt.toISOString(),
    createdBy: supplier.createdBy,
    updatedBy: supplier.updatedBy,
  };
}

/**
 * Transform SKU for GraphQL response
 */
function transformSku(sku: {
  skuId: string;
  skuCode: string;
  skuDescription: string;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  manufacturer: string | null;
  caseRate: string | null;
  caseExtLengthMm: string | null;
  caseExtWidthMm: string | null;
  caseExtHeightMm: string | null;
  caseGrossWeightKg: string | null;
  casesPerLayer: string | null;
  noOfLayers: string | null;
  skuExpiryDate: Date | null;
  skuSuppliers: Array<{ supplierId: string; originalSkuCode: string | null }> | null;
  skuUom: string;
  pickingStrategy: string;
  isLotControlled: boolean;
  isExpiryControlled: boolean;
  looseQuantity: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    skuId: sku.skuId,
    skuCode: sku.skuCode,
    skuDescription: sku.skuDescription,
    barcode: sku.barcode,
    brand: sku.brand,
    category: sku.category,
    manufacturer: sku.manufacturer,
    caseRate: sku.caseRate ? parseFloat(sku.caseRate) : null,
    caseExtLengthMm: sku.caseExtLengthMm ? parseFloat(sku.caseExtLengthMm) : null,
    caseExtWidthMm: sku.caseExtWidthMm ? parseFloat(sku.caseExtWidthMm) : null,
    caseExtHeightMm: sku.caseExtHeightMm ? parseFloat(sku.caseExtHeightMm) : null,
    caseGrossWeightKg: sku.caseGrossWeightKg ? parseFloat(sku.caseGrossWeightKg) : null,
    casesPerLayer: sku.casesPerLayer ? parseFloat(sku.casesPerLayer) : null,
    noOfLayers: sku.noOfLayers ? parseFloat(sku.noOfLayers) : null,
    skuExpiryDate: sku.skuExpiryDate ? sku.skuExpiryDate.toISOString() : null,
    skuUom: sku.skuUom,
    pickingStrategy: sku.pickingStrategy,
    isLotControlled: sku.isLotControlled,
    isExpiryControlled: sku.isExpiryControlled,
    looseQuantity: sku.looseQuantity != null ? parseFloat(sku.looseQuantity) : null,
    skuSuppliers: sku.skuSuppliers ?? [],
    isActive: sku.isActive,
    createdAt: sku.createdAt.toISOString(),
    updatedAt: sku.updatedAt.toISOString(),
    createdBy: sku.createdBy,
    updatedBy: sku.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get SKUs with optional filtering and pagination (uses repository)
     */
    skus: async (_: unknown, args: {
      filter?: {
        skuId?: string;
        skuIds?: string[];
        skuCode?: string;
        skuCodes?: string[];
        skuDescription?: string;
        search?: string;
        isActive?: boolean;
        sortBy?: string;
        sortOrder?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      try {
        const filter: any = {};
        
        if (args.filter) {
          if (args.filter.skuIds) {
            filter.skuId = args.filter.skuIds;
          } else if (args.filter.skuId) {
            filter.skuId = args.filter.skuId;
          }
          
          if (args.filter.skuCodes) {
            filter.skuCode = args.filter.skuCodes;
          } 
          
          if (args.filter.skuCode) {
            filter.skuCode = args.filter.skuCode;
          }
          
          if (args.filter.skuDescription) {
            filter.skuDescription = args.filter.skuDescription;
          }

          if (args.filter.search) {
            filter.search = args.filter.search;
          }

          if (args.filter.isActive !== undefined) {
            filter.isActive = args.filter.isActive;
          }
          if (args.filter.sortBy != null) {
            filter.sortBy = args.filter.sortBy;
          }
          if (args.filter.sortOrder != null) {
            filter.sortOrder = args.filter.sortOrder;
          }
        }

        // Only pass pagination params if both are provided, otherwise get all data
        let paginationParams;
        if (args.pageSize && args.pageNumber) {
          paginationParams = { pageSize: args.pageSize, pageNumber: args.pageNumber };
        } else {
          paginationParams = undefined;
        }

        const result = await skuRepository.getSku(filter, paginationParams);

        return {
          query: result.query.map(transformSku),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error('[sku.resolvers] Error:', error);
        return false;
      }
    },

    /**
     * Get a single SKU by ID (uses repository)
     */
    sku: async (_: unknown, { id }: { id: string }) => {
      try {
        const sku = await skuRepository.getSkuById(id);
        if (!sku) return null;
        return transformSku(sku);
      } catch (error) {
        logger.error('[sku.resolvers] Error:', error);
        return false;
      }
    },
  },

  Sku: {
    /**
     * Resolve suppliers for a SKU by fetching supplier data using the IDs
     */
    skuSuppliers: async (sku: { skuSuppliers: Array<{ supplierId: string; originalSkuCode: string | null }> }) => {
      if (!sku.skuSuppliers || sku.skuSuppliers.length === 0) {
        return [];
      }

      try {
        // Extract supplier IDs from the array
        const supplierIds = sku.skuSuppliers.map(s => s.supplierId);
        
        // Fetch suppliers by IDs using the repository
        const result = await suppliersRepository.getSupplier(
          { supplierId: supplierIds },
          { pageSize: 1000, pageNumber: 1 } // Get all suppliers (no pagination needed for this use case)
        );
        
        // Create a map of supplierId -> supplier for quick lookup
        const supplierMap = new Map(
          result.query.map(supplier => [supplier.supplierId, supplier])
        );
        
        // Combine supplier data with original SKU codes
        return sku.skuSuppliers.map(skuSupplier => {
          const supplier = supplierMap.get(skuSupplier.supplierId);
          return {
            supplierId: skuSupplier.supplierId,
            supplier: supplier ? transformSupplier(supplier) : null,
            originalSkuCode: skuSupplier.originalSkuCode,
          };
        }).filter(item => item.supplier !== null); // Filter out suppliers that weren't found
      } catch (error) {
        logger.error('[sku.resolvers.skuSuppliers] Error fetching suppliers for SKU:', error);
        return [];
      }
    },
  },

  Mutation: {
    /**
     * Create a new SKU (uses repository)
     */
    createSku: withAudit(
      {
        entity: 'SKU',
        action: 'CREATE',
        getEntityId: (result): string | null =>
          result && typeof result === 'object' && 'skuId' in result ? result.skuId : null,
    }, 
      async (_: unknown, { input }: { input: {
      skuCode: string;
      skuDescription: string;
      barcode?: string | null;
      brand?: string | null;
      category?: string | null;
      manufacturer?: string | null;
      caseRate?: number | null;
      caseExtLengthMm?: number | null;
      caseExtWidthMm?: number | null;
      caseExtHeightMm?: number | null;
      caseGrossWeightKg?: number | null;
      casesPerLayer?: number | null;
      noOfLayers?: number | null;
      skuExpiryDate?: string | Date | null;
      skuSuppliers?: Array<{ supplierId: string; originalSkuCode?: string | null }>;
      skuUom: string;
      isActive: boolean;
      pickingStrategy?: string | null;
      isLotControlled?: boolean;
      isExpiryControlled?: boolean;
      initialOnHandQty?: number | null;
      createdBy?: string | null;
      updatedBy?: string | null;
    }}, context: GraphQLContext) => {
      try {
        const { success, data, error } = createSkuSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: error.flatten().fieldErrors } });
        }
        const createdBy = data.createdBy ?? context.user?.id ?? 'system';
        const updatedBy = data.updatedBy ?? context.user?.id ?? 'system';
        let expiryDate: Date | null = null;
        if (data.skuExpiryDate != null && data.skuExpiryDate !== '') {
          expiryDate = new Date(data.skuExpiryDate);
        }
        const skuSuppliersData = data.skuSuppliers?.map((s) => ({
          supplierId: s.supplierId,
          originalSkuCode: s.originalSkuCode ?? null,
        }));

        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const isExpiryControlled = data.isExpiryControlled ?? false;
        const isLotControlled = data.isLotControlled ?? false;
        const sku = await skuRepository.createSku({
          organizationId: context.organizationId,
          skuCode: data.skuCode,
          skuDescription: data.skuDescription,
          barcode: data.barcode ?? null,
          brand: data.brand ?? null,
          category: data.category ?? null,
          manufacturer: data.manufacturer ?? null,
          caseRate: data.caseRate != null ? String(data.caseRate) : null,
          caseExtLengthMm: data.caseExtLengthMm != null ? String(data.caseExtLengthMm) : null,
          caseExtWidthMm: data.caseExtWidthMm != null ? String(data.caseExtWidthMm) : null,
          caseExtHeightMm: data.caseExtHeightMm != null ? String(data.caseExtHeightMm) : null,
          caseGrossWeightKg: data.caseGrossWeightKg != null ? String(data.caseGrossWeightKg) : null,
          casesPerLayer: data.casesPerLayer != null ? String(data.casesPerLayer) : null,
          noOfLayers: data.noOfLayers != null ? String(data.noOfLayers) : null,
          skuExpiryDate: expiryDate,
          skuSuppliers: skuSuppliersData ?? null,
          skuUom: data.skuUom,
          pickingStrategy: resolvePickingStrategy(data.pickingStrategy, isExpiryControlled),
          isLotControlled,
          isExpiryControlled,
          looseQuantity: data.looseQuantity != null ? String(data.looseQuantity) : null,
          isActive: data.isActive,
          createdBy,
          updatedBy,
          initialOnHandQty: data.initialOnHandQty ?? undefined,
        });

        return transformSku(sku);
      } catch (error) {
        logger.error('[sku.resolvers.createSku] Error:', error);
        throw error;
      }
    }),

    /**
     * Update an existing SKU (uses repository)
     */
    updateSku: withAudit(
      {
        entity: 'SKU',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await skuRepository.getSkuById(args.id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
      skuCode?: string;
      skuDescription?: string;
      barcode?: string | null;
      brand?: string | null;
      category?: string | null;
      manufacturer?: string | null;
      caseRate?: number | null;
      caseExtLengthMm?: number | null;
      caseExtWidthMm?: number | null;
      caseExtHeightMm?: number | null;
      caseGrossWeightKg?: number | null;
      casesPerLayer?: number | null;
      noOfLayers?: number | null;
      skuSuppliers?: Array<{ supplierId: string; originalSkuCode?: string | null }> | null;
      skuExpiryDate?: string | Date | null;
      skuUom?: string;
      isActive?: boolean;
      pickingStrategy?: string | null;
      isLotControlled?: boolean;
      isExpiryControlled?: boolean;
      looseQuantity?: number | null;
      updatedBy?: string | null;
    }}, context: GraphQLContext) => {
      try {
        const { success: uSuccess, data: uData, error: uError } = updateSkuSchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError('Validation failed', { extensions: { code: 'BAD_USER_INPUT', errors: uError.flatten().fieldErrors } });
        }
        const updatedBy = uData.updatedBy ?? context.user?.id ?? 'system';
        const updateData: Record<string, unknown> = {
          updatedBy,
        };

        if (uData.skuCode !== undefined) updateData.skuCode = uData.skuCode;
        if (uData.skuDescription !== undefined) updateData.skuDescription = uData.skuDescription;
        if (uData.barcode !== undefined) updateData.barcode = uData.barcode;
        if (uData.brand !== undefined) updateData.brand = uData.brand;
        if (uData.category !== undefined) updateData.category = uData.category;
        if (uData.manufacturer !== undefined) updateData.manufacturer = uData.manufacturer;
        if (uData.caseRate !== undefined) updateData.caseRate = uData.caseRate == null ? null : String(uData.caseRate);
        if (uData.caseExtLengthMm !== undefined) updateData.caseExtLengthMm = uData.caseExtLengthMm == null ? null : String(uData.caseExtLengthMm);
        if (uData.caseExtWidthMm !== undefined) updateData.caseExtWidthMm = uData.caseExtWidthMm == null ? null : String(uData.caseExtWidthMm);
        if (uData.caseExtHeightMm !== undefined) updateData.caseExtHeightMm = uData.caseExtHeightMm == null ? null : String(uData.caseExtHeightMm);
        if (uData.caseGrossWeightKg !== undefined) updateData.caseGrossWeightKg = uData.caseGrossWeightKg == null ? null : String(uData.caseGrossWeightKg);
        if (uData.casesPerLayer !== undefined) updateData.casesPerLayer = uData.casesPerLayer == null ? null : String(uData.casesPerLayer);
        if (uData.noOfLayers !== undefined) updateData.noOfLayers = uData.noOfLayers == null ? null : String(uData.noOfLayers);
        if (uData.skuExpiryDate !== undefined) {
          const raw = uData.skuExpiryDate;
          if (raw === null || raw === '') {
            updateData.skuExpiryDate = null;
          } else {
            updateData.skuExpiryDate = new Date(raw);
          }
        }
        if (uData.skuSuppliers !== undefined) {
          updateData.skuSuppliers = uData.skuSuppliers?.map((s) => ({
            supplierId: s.supplierId,
            originalSkuCode: s.originalSkuCode ?? null,
          })) ?? null;
        }
        if (uData.skuUom !== undefined) updateData.skuUom = uData.skuUom;
        if (uData.isActive !== undefined) updateData.isActive = uData.isActive;
        if (uData.isLotControlled !== undefined) {
          updateData.isLotControlled = uData.isLotControlled;
        }
        if (uData.isExpiryControlled !== undefined) {
          updateData.isExpiryControlled = uData.isExpiryControlled;
        }
        if (uData.looseQuantity !== undefined) {
          updateData.looseQuantity = uData.looseQuantity == null ? null : String(uData.looseQuantity);
        }

        const existingSku = await skuRepository.getSkuById(id);
        const nextIsExpiryControlled =
          uData.isExpiryControlled ?? existingSku?.isExpiryControlled ?? false;

        if (uData.pickingStrategy !== undefined && uData.pickingStrategy !== null) {
          updateData.pickingStrategy = resolvePickingStrategy(
            uData.pickingStrategy,
            nextIsExpiryControlled,
          );
        } else if (
          uData.isExpiryControlled === false &&
          existingSku?.pickingStrategy === 'FEFO'
        ) {
          updateData.pickingStrategy = 'FIFO';
        }

        const sku = await skuRepository.updateSku(id, updateData);
        if (!sku) {
          throw new GraphQLError('SKU not found or update failed', {
            extensions: { code: 'NOT_FOUND' },
          });
        }

        return transformSku(sku);
      } catch (error) {
        logger.error('[sku.resolvers.updateSku] Error:', error);
        if (error instanceof GraphQLError) {
          throw error;
        }
        throw new GraphQLError(
          error instanceof Error ? error.message : 'Failed to update SKU',
          { extensions: { code: 'INTERNAL_SERVER_ERROR' } },
        );
      }
    }),

    /**
     * Delete an SKU by ID (uses repository)
     */
    deleteSku: withAudit(
      {
        entity: 'SKU',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => skuRepository.getSkuById(args.id),
      },
      async (_: unknown, { id }: { id: string }) => {
        try {
          await skuRepository.deleteSku(id);
          return true;
        } catch (error) {
          logger.error('[sku.resolvers.deleteSku] Error:', error);
          return false;
        }
      }
    ),
  },
};
