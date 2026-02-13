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
  skuSuppliers: string[];
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
     * Get all SKUs (uses repository)
     */
    skus: async () => {
      const skus = await skuRepository.getAllSkus();
      return skus.map(transformSku);
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
    skuSuppliers: async (sku: { skuSuppliers: string[] }) => {
      if (!sku.skuSuppliers || sku.skuSuppliers.length === 0) {
        return [];
      }

      try {
        // Fetch suppliers by IDs using the repository
        const result = await suppliersRepository.getSupplier(
          { supplierId: sku.skuSuppliers },
          { pageSize: 1000, pageNumber: 1 } // Get all suppliers (no pagination needed for this use case)
        );
        
        // Transform suppliers for GraphQL response
        return result.query.map(transformSupplier);
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
    createSku: withAudit(
      {
        entity: 'SKU',
        action: 'CREATE',
        getEntityId: (result) => result?.skuId ?? null,
      },
      async (_: unknown, { input }: { input: {
        skuCode: string;
        skuDescription: string;
        skuPrice: number;
        skuQuantity: number;
        skuExpiryDate: string | Date;
        skuSuppliers: string[];
        skuUom: string;
        isActive: boolean;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        // Convert date string to Date object if needed
        if (typeof input.skuExpiryDate === 'string') {
          input.skuExpiryDate = new Date(input.skuExpiryDate);
        }

        const sku = await skuRepository.createSku({
          skuCode: input.skuCode,
          skuDescription: input.skuDescription,
          skuPrice: input.skuPrice.toString(),
          skuQuantity: input.skuQuantity.toString(),
          skuExpiryDate: input.skuExpiryDate,
          skuSuppliers: input.skuSuppliers,
          skuUom: input.skuUom,
          isActive: input.isActive,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        });

        return transformSku(sku);
      }
    ),

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
        skuPrice?: number;
        skuQuantity?: number;
        skuSuppliers?: string[];
        skuExpiryDate?: string | Date;
        skuUom?: string;
        isActive?: boolean;
        updatedBy: string;
      }}, context: GraphQLContext) => {
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
        if (input.skuSuppliers !== undefined) updateData.skuSuppliers = input.skuSuppliers;
        if (input.skuUom !== undefined) updateData.skuUom = input.skuUom;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;

        const sku = await skuRepository.updateSku(id, updateData);
        if (!sku) return null;
        
        return transformSku(sku);
      }
    ),
  },
};
