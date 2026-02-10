/**
 * SKU GraphQL Resolvers
 * 
 * @description Resolver functions for SKU (Stock Keeping Unit) operations.
 * Uses SkuRepository for data access (proper layer separation).
 * 
 * Type definitions are in sku.typeDefs.ts
 */

import { skuRepository } from '@/composition-root';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Transform SKU for GraphQL response
 */
function transformSku(sku: {
  skuId: string;
  skuName: string;
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
    skuName: sku.skuName,
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

  Mutation: {
    /**
     * Create a new SKU (uses repository)
     */
    createSku: async (_: unknown, { input }: { input: {
      skuName: string;
      skuDescription: string;
      skuPrice: number;
      skuQuantity: number;
      skuExpiryDate: Date;
      skuSuppliers: string[];
      skuUom: string;
      isActive: boolean;
      createdBy: string;
      updatedBy: string;
    }}) => {
      const sku = await skuRepository.createSku({
        skuName: input.skuName,
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
    },

    /**
     * Update an existing SKU (uses repository)
     */
    updateSku: async (_: unknown, { id, input }: { id: string; input: {
      skuName?: string;
      skuDescription?: string;
      skuPrice?: number;
      skuQuantity?: number;
      skuSupplier?: string[];
      skuExpiryDate?: Date;
      skuUom?: string;
      isActive?: boolean;
      updatedBy: string;
    }}) => {
      const updateData: Record<string, unknown> = {
        updatedBy: input.updatedBy,
      };

      if (input.skuName !== undefined) updateData.skuName = input.skuName;
      if (input.skuDescription !== undefined) updateData.skuDescription = input.skuDescription;
      if (input.skuPrice !== undefined) updateData.skuPrice = input.skuPrice.toString();
      if (input.skuQuantity !== undefined) updateData.skuQuantity = input.skuQuantity.toString();
      if (input.skuExpiryDate !== undefined) updateData.skuExpiryDate = input.skuExpiryDate;
      if (input.skuSupplier !== undefined) updateData.skuSupplier = input.skuSupplier;
      if (input.skuUom !== undefined) updateData.skuUom = input.skuUom;
      if (input.isActive !== undefined) updateData.isActive = input.isActive;

      const sku = await skuRepository.updateSku(id, updateData);
      if (!sku) return null;
      
      return transformSku(sku);
    },
  },
};
