import { palletLabelsRepository } from '@/composition-root';
import { PalletLabelFilter, PalletLabelSort } from './pallet-label.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const palletLabelFilterSchema = z.object({
  id: z.string().uuid().optional(),
  storageBinId: z.string().uuid().optional(),
  search: z.string().optional(),
  labelCode: z.string().optional(),
  itemCode: z.string().optional(),
  barCode: z.string().optional(),
  referenceNo: z.string().optional(),
  description: z.string().optional(),
  itemDesc02: z.string().optional(),
  includeDeleted: z.boolean().optional(),
});

const sortSchema = z.object({
  sortBy: z.enum(['STORAGE_BIN', 'ITEM_CODE', 'DESCRIPTION', 'ITEM_DESC_02', 'UPDATED_AT', 'CREATED_AT']).optional(),
  direction: z.enum(['ASC', 'DESC']).optional(),
});

const createPalletLabelSchema = z.object({
  itemCode: z.string().min(1, 'Item code is required'),
  barCode: z.string().optional(),
  referenceNo: z.string().optional(),
  storageBinId: z.string().uuid().optional(),
  labelCode: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  itemDesc02: z.string().optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updatePalletLabelSchema = z.object({
  itemCode: z.string().min(1).optional(),
  barCode: z.string().optional(),
  referenceNo: z.string().optional(),
  storageBinId: z.string().uuid().optional(),
  labelCode: z.string().optional(),
  description: z.string().min(1).optional(),
  itemDesc02: z.string().optional(),
  isActive: z.boolean().optional(),
  version: z.number().int().positive(),
  updatedBy: z.string().min(1),
});

function transformPalletLabel(label: {
  id: string;
  itemCode: string;
  barCode?: string | null;
  referenceNo?: string | null;
  storageBinId: string | null;
  storageBinCode?: string | null;
  labelCode: string;
  description: string | null;
  itemDesc02?: string | null;
  printedCount?: number;
  firstPrintedAt?: Date | null;
  lastPrintedAt?: Date | null;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    id: label.id,
    itemCode: label.itemCode,
    barCode: label.barCode ?? null,
    referenceNo: label.referenceNo ?? null,
    storageBinId: label.storageBinId,
    storageBinCode: label.storageBinCode ?? null,
    labelCode: label.labelCode,
    description: label.description,
    itemDesc02: label.itemDesc02 ?? null,
    printedCount: label.printedCount ?? 0,
    firstPrintedAt: label.firstPrintedAt ? label.firstPrintedAt.toISOString() : null,
    lastPrintedAt: label.lastPrintedAt ? label.lastPrintedAt.toISOString() : null,
    isActive: label.isActive,
    isDeleted: label.isDeleted,
    deletedAt: label.deletedAt ? label.deletedAt.toISOString() : null,
    version: label.version,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
    createdBy: label.createdBy,
    updatedBy: label.updatedBy,
  };
}

export const resolvers = {
  Query: {
    palletLabels: async (_: unknown, args: {
      filter?: {
        id?: string;
        storageBinId?: string;
        search?: string;
        labelCode?: string;
        itemCode?: string;
        barCode?: string;
        referenceNo?: string;
        description?: string;
        itemDesc02?: string;
        includeDeleted?: boolean;
      };
      sort?: {
        sortBy?: PalletLabelSort['sortBy'];
        direction?: PalletLabelSort['direction'];
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: PalletLabelFilter = {};
      const sort: PalletLabelSort = {};

      if (args.filter) {
        const parsed = palletLabelFilterSchema.safeParse(args.filter);
        if (!parsed.success) {
          throw new GraphQLError(prettifyError(parsed.error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        Object.assign(filter, parsed.data);
      }

      if (args.sort) {
        const parsedSort = sortSchema.safeParse(args.sort);
        if (!parsedSort.success) {
          throw new GraphQLError(prettifyError(parsedSort.error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        Object.assign(sort, parsedSort.data);
      }

      const result = await palletLabelsRepository.getPalletLabels(
        filter,
        sort,
        { pageSize: args.pageSize, pageNumber: args.pageNumber },
        context.organizationId || undefined,
      );

      return {
        query: result.query.map(transformPalletLabel),
        pagination: result.pagination,
      };
    },

    palletLabel: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const label = await palletLabelsRepository.getPalletLabelById(id, context.organizationId || undefined);
      if (!label) return null;
      return transformPalletLabel(label);
    },
  },

  Mutation: {
    createPalletLabel: withAudit(
      {
        entity: 'StorageBinItem',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: {
        itemCode: string;
        barCode?: string;
        referenceNo?: string;
        storageBinId?: string;
        labelCode?: string;
        description: string;
        itemDesc02?: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }

        const parsed = createPalletLabelSchema.safeParse(input);
        if (!parsed.success) {
          throw new GraphQLError(prettifyError(parsed.error), { extensions: { code: 'BAD_USER_INPUT' } });
        }

        const data = parsed.data;
        const duplicate = await palletLabelsRepository.getActiveDuplicate(
          context.organizationId,
          data.storageBinId,
          data.itemCode.trim(),
        );

        if (duplicate) {
          throw new GraphQLError('Duplicate active record for the same storage bin and item code', {
            extensions: { code: 'CONFLICT' },
          });
        }

        const label = await palletLabelsRepository.createPalletLabel({
          organizationId: context.organizationId,
          itemCode: data.itemCode.trim(),
          barCode: data.barCode,
          referenceNo: data.referenceNo,
          storageBinId: data.storageBinId,
          labelCode: data.labelCode?.trim() || data.itemCode.trim(),
          description: data.description.trim(),
          itemDesc02: data.itemDesc02,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
          printedCount: 0,
          firstPrintedAt: null,
          lastPrintedAt: null,
          isActive: true,
        }, context.tx);

        return label ? transformPalletLabel(label) : null;
      },
    ),

    updatePalletLabel: withAudit(
      {
        entity: 'StorageBinItem',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await palletLabelsRepository.getPalletLabelById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        itemCode?: string;
        barCode?: string;
        referenceNo?: string;
        storageBinId?: string;
        labelCode?: string;
        description?: string;
        itemDesc02?: string;
        isActive?: boolean;
        version: number;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const parsed = updatePalletLabelSchema.safeParse(input);
        if (!parsed.success) {
          throw new GraphQLError(prettifyError(parsed.error), { extensions: { code: 'BAD_USER_INPUT' } });
        }

        const existing = await palletLabelsRepository.getPalletLabelById(id, context.organizationId || undefined);
        if (!existing) {
          throw new GraphQLError('Record not found', { extensions: { code: 'NOT_FOUND' } });
        }

        if (existing.version !== parsed.data.version) {
          throw new GraphQLError('Record has been modified by another user. Please refresh and retry.', {
            extensions: { code: 'CONFLICT' },
          });
        }

        const itemCode = parsed.data.itemCode?.trim() ?? existing.itemCode;
        const storageBinId = parsed.data.storageBinId ?? existing.storageBinId ?? undefined;

        const duplicate = await palletLabelsRepository.getActiveDuplicate(
          context.organizationId,
          storageBinId,
          itemCode,
          id,
        );
        if (duplicate) {
          throw new GraphQLError('Duplicate active record for the same storage bin and item code', {
            extensions: { code: 'CONFLICT' },
          });
        }

        const updated = await palletLabelsRepository.updatePalletLabel({
          itemCode,
          barCode: parsed.data.barCode,
          referenceNo: parsed.data.referenceNo,
          storageBinId: parsed.data.storageBinId,
          labelCode: parsed.data.labelCode ?? itemCode,
          description: parsed.data.description,
          itemDesc02: parsed.data.itemDesc02,
          isActive: parsed.data.isActive,
          updatedBy: parsed.data.updatedBy,
          version: existing.version + 1,
        }, id, context.organizationId || undefined, context.tx);

        return updated ? transformPalletLabel(updated) : null;
      },
    ),

    deletePalletLabel: withAudit(
      {
        entity: 'StorageBinItem',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await palletLabelsRepository.getPalletLabelById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, updatedBy }: { id: string; updatedBy: string }, context: GraphQLContext) => {
        return await palletLabelsRepository.softDeletePalletLabel(id, updatedBy, context.organizationId || undefined, context.tx);
      },
    ),

    deletePalletLabels: withAudit(
      {
        entity: 'StorageBinItem',
        action: 'DELETE',
        getEntityId: () => 'bulk-delete',
      },
      async (_: unknown, { ids, updatedBy }: { ids: string[]; updatedBy: string }, context: GraphQLContext) => {
        const uniqueIds = Array.from(new Set(ids));
        const result = await palletLabelsRepository.softDeletePalletLabels(uniqueIds, updatedBy, context.organizationId || undefined, context.tx);
        const failed = uniqueIds.filter((id) => !result.deletedIds.includes(id));

        return {
          requestedCount: uniqueIds.length,
          deletedCount: result.deletedCount,
          failedIds: failed,
        };
      },
    ),
  },
};
