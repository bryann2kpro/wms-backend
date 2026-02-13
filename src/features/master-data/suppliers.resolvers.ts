/**
 * Suppliers GraphQL Resolvers
 * 
 * @description Resolver functions for Supplier operations.
 * Uses SuppliersRepository for data access.
 */

import { suppliersRepository } from '@/composition-root';
import { SupplierFilter } from './suppliers.repository';
import { withAudit } from '@/features/audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';

// ============================================
// HELPER FUNCTIONS
// ============================================

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

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get suppliers with optional filtering and pagination
     */
    suppliers: async (_: unknown, args: {
      filter?: {
        supplierId?: string;
        supplierIds?: string[];
        supplierCode?: string;
        supplierCodes?: string[];
        supplierName?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: SupplierFilter = {};
      
      if (args.filter) {
        if (args.filter.supplierIds) {
          filter.supplierId = args.filter.supplierIds;
        } else if (args.filter.supplierId) {
          filter.supplierId = args.filter.supplierId;
        }
        
        if (args.filter.supplierCodes) {
          filter.supplierCode = args.filter.supplierCodes;
        } else if (args.filter.supplierCode) {
          filter.supplierCode = args.filter.supplierCode;
        }
        
        if (args.filter.supplierName) {
          filter.supplierName = args.filter.supplierName;
        }
      }

      const result = await suppliersRepository.getSupplier(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformSupplier),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single supplier by ID
     */
    supplier: async (_: unknown, { id }: { id: string }) => {
      const supplier = await suppliersRepository.getSupplierById(id);
      if (!supplier) return null;
      return transformSupplier(supplier);
    },
  },

  Mutation: {
    /**
     * Create a new supplier
     */
    createSupplier: withAudit(
      {
        entity: 'Supplier',
        action: 'CREATE',
        getEntityId: (result) => result?.supplierId ?? null,
      },
      async (_: unknown, { input }: { input: {
        supplierName: string;
        supplierCode: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const supplier = await suppliersRepository.createSupplier({
          supplierName: input.supplierName,
          supplierCode: input.supplierCode,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        }, context.tx);

        return transformSupplier(supplier);
      }
    ),

    /**
     * Update an existing supplier
     */
    updateSupplier: withAudit(
      {
        entity: 'Supplier',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await suppliersRepository.getSupplierById(args.id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        supplierName?: string;
        supplierCode?: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const updateData: Record<string, unknown> = {
          updatedBy: input.updatedBy,
        };

        if (input.supplierName !== undefined) updateData.supplierName = input.supplierName;
        if (input.supplierCode !== undefined) updateData.supplierCode = input.supplierCode;

        const supplier = await suppliersRepository.updateSupplier(updateData, id, context.tx);
        if (!supplier) return null;
        
        return transformSupplier(supplier);
      }
    ),

    /**
     * Delete a supplier
     */
    deleteSupplier: withAudit(
      {
        entity: 'Supplier',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await suppliersRepository.getSupplierById(args.id);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await suppliersRepository.deleteSupplier(id, context.tx);
      }
    ),
  },
};
