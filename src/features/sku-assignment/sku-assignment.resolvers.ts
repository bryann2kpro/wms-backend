import { skuAssignmentRepository } from '@/composition-root';
import { withAudit } from '../audit-log/audit.wrapper';

function transformRow(row: any) {
  return {
    id: row.id,
    outlet: {
      outletId: row.outletId,
      outletName: row.outletName,
      outletCode: row.outletCode,
      chain: row.outletChain ?? null,
      channel: row.outletChannel ?? null,
      debtor: row.outletDebtor ?? null,
    },
    sku: {
      skuId: row.skuId,
      skuCode: row.skuCode,
      skuDescription: row.skuDescription,
      brand: row.skuBrand ?? null,
      category: row.skuCategory ?? null,
      manufacturer: row.skuManufacturer ?? null,
    },
    minExpiryMonth: row.minExpiryMonth,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

export const resolvers = {
  Query: {
    skuAssignments: async (_: unknown, args: { pageSize?: number; pageNumber?: number }, context: any) => {
      const result = await skuAssignmentRepository.getSkuAssignments(
        { pageSize: args.pageSize, pageNumber: args.pageNumber },
        context?.organizationId ?? undefined,
      );
      return {
        query: result.query.map(transformRow),
        pagination: result.pagination,
      };
    },
  },

  Mutation: {
    createSkuAssignment: withAudit(
      {
        entity: 'SkuAssignment',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: {
        outletId: string;
        skuId: string;
        minExpiryMonth: number;
        createdBy: string;
        updatedBy: string;
      }}, context: any) => {
        const row = await skuAssignmentRepository.createSkuAssignment({
          organizationId: context?.organizationId ?? undefined,
          outletId: input.outletId,
          skuId: input.skuId,
          minExpiryMonth: input.minExpiryMonth,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        });
        const full = await skuAssignmentRepository.getSkuAssignmentById(row.id, context?.organizationId ?? undefined);
        return full ? transformRow(full) : null;
      },
    ),

    updateSkuAssignment: withAudit(
      {
        entity: 'SkuAssignment',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          const row = await skuAssignmentRepository.getSkuAssignmentById(args.id, context?.organizationId ?? undefined);
          return row ? transformRow(row) : null;
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        outletId?: string;
        skuId?: string;
        minExpiryMonth?: number;
        updatedBy: string;
      }}, context: any) => {
        const updateData: Record<string, unknown> = { updatedBy: input.updatedBy };
        if (input.outletId !== undefined) updateData.outletId = input.outletId;
        if (input.skuId !== undefined) updateData.skuId = input.skuId;
        if (input.minExpiryMonth !== undefined) updateData.minExpiryMonth = input.minExpiryMonth;

        await skuAssignmentRepository.updateSkuAssignment(id, updateData, context?.organizationId ?? undefined);
        const full = await skuAssignmentRepository.getSkuAssignmentById(id, context?.organizationId ?? undefined);
        return full ? transformRow(full) : null;
      },
    ),

    deleteSkuAssignment: withAudit(
      {
        entity: 'SkuAssignment',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          const row = await skuAssignmentRepository.getSkuAssignmentById(args.id, context?.organizationId ?? undefined);
          return row ? transformRow(row) : null;
        },
      },
      async (_: unknown, { id }: { id: string }, context: any) => {
        return await skuAssignmentRepository.deleteSkuAssignment(id, context?.organizationId ?? undefined);
      },
    ),
  },
};
