/**
 * SKU GraphQL Resolvers
 * 
 * @description Resolver functions for SKU (Stock Keeping Unit) operations.
 * Uses SkuRepository for data access (proper layer separation).
 * 
 * Type definitions are in sku.typeDefs.ts
 */

import { skuRepository, suppliersRepository } from '@/composition-root';

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
  skuPrice: string;
  skuQuantity: string;
  skuExpiryDate: Date;
  skuSuppliers: Array<{ supplierId: string; originalSkuCode: string | null }>;
  skuUom: string;
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
    skuPrice: parseFloat(sku.skuPrice),
    skuQuantity: parseFloat(sku.skuQuantity),
    skuExpiryDate: sku.skuExpiryDate,
    skuUom: sku.skuUom,
    skuSuppliers: sku.skuSuppliers,
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
        isActive?: boolean;
      };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: any = {};
      
      if (args.filter) {
        if (args.filter.skuIds) {
          filter.skuId = args.filter.skuIds;
        } else if (args.filter.skuId) {
          filter.skuId = args.filter.skuId;
        }
        
        if (args.filter.skuCodes) {
          filter.skuCode = args.filter.skuCodes;
        } else if (args.filter.skuCode) {
          filter.skuCode = args.filter.skuCode;
        }
        
        if (args.filter.skuDescription) {
          filter.skuDescription = args.filter.skuDescription;
        }
        
        if (args.filter.isActive !== undefined) {
          filter.isActive = args.filter.isActive;
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
    },

    /**
     * Get a single SKU by ID (uses repository)
     */
    sku: async (_: unknown, { id }: { id: string }) => {
      const sku = await skuRepository.getSkuById(id);
      if (!sku) return null;
      return transformSku(sku);
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
        console.error('Error fetching suppliers for SKU:', error);
        return [];
      }
    },
  },

  Mutation: {
    /**
     * Create a new SKU (uses repository)
     */
    createSku: async (_: unknown, { input }: { input: {
      skuCode: string;
      skuDescription: string;
      skuPrice: number;
      skuQuantity: number;
      skuExpiryDate: string | Date;
      skuSuppliers: Array<{ supplierId: string; originalSkuCode?: string | null }>;
      skuUom: string;
      isActive: boolean;
      createdBy: string;
      updatedBy: string;
    }}) => {
      // Convert date string to Date object if needed
      if (typeof input.skuExpiryDate === 'string') {
        input.skuExpiryDate = new Date(input.skuExpiryDate);
      }

      // Transform skuSuppliers to match the expected format
      const skuSuppliersData = input.skuSuppliers.map(s => ({
        supplierId: s.supplierId,
        originalSkuCode: s.originalSkuCode ?? null,
      }));

      const sku = await skuRepository.createSku({
        skuCode: input.skuCode,
        skuDescription: input.skuDescription,
        skuPrice: input.skuPrice.toString(),
        skuQuantity: input.skuQuantity.toString(),
        skuExpiryDate: input.skuExpiryDate,
        skuSuppliers: skuSuppliersData,
        skuUom: input.skuUom,
        isActive: input.isActive,
        createdBy: input.createdBy,
        updatedBy: input.updatedBy,
      });

      return transformSku(sku);
    },

    /**
     * Update an existing SKU (uses repository)
     */
    updateSku: async (_: unknown, { id, input }: { id: string; input: {
      skuCode?: string;
      skuDescription?: string;
      skuPrice?: number;
      skuQuantity?: number;
      skuSuppliers?: Array<{ supplierId: string; originalSkuCode?: string | null }>;
      skuExpiryDate?: string | Date;
      skuUom?: string;
      isActive?: boolean;
      updatedBy: string;
    }}) => {
      const updateData: Record<string, unknown> = {
        updatedBy: input.updatedBy,
      };

      if (input.skuCode !== undefined) updateData.skuCode = input.skuCode;
      if (input.skuDescription !== undefined) updateData.skuDescription = input.skuDescription;
      if (input.skuPrice !== undefined) updateData.skuPrice = input.skuPrice.toString();
      if (input.skuQuantity !== undefined) updateData.skuQuantity = input.skuQuantity.toString();
      if (input.skuExpiryDate !== undefined && typeof input.skuExpiryDate === 'string') {
        // Convert date string to Date object if needed
        updateData.skuExpiryDate = new Date(input.skuExpiryDate);
      }
      if (input.skuSuppliers !== undefined) {
        // Transform skuSuppliers to match the expected format
        updateData.skuSuppliers = input.skuSuppliers.map(s => ({
          supplierId: s.supplierId,
          originalSkuCode: s.originalSkuCode ?? null,
        }));
      }
      if (input.skuUom !== undefined) updateData.skuUom = input.skuUom;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const sku = await skuRepository.updateSku(id, updateData);
      if (!sku) return null;
      
      return transformSku(sku);
    },

    /**
     * Delete a SKU (uses repository)
     */
    deleteSku: async (_: unknown, { id }: { id: string }) => {
      const result = await skuRepository.deleteSku(id);
      return result;
    },
  },
};
