import { pickingCriteriaRepository } from '@/composition-root';
import { PickingCriteriaFilter } from './picking-criteria.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const pickingCriteriaFilterSchema = z.object({
  id: z.string().uuid().optional(),
  userId: z.string().optional(),
  category: z.string().optional(),
  chain: z.string().optional(),
  channel: z.string().optional(),
  debtor: z.string().optional(),
  deliveryPoint: z.string().optional(),
  storageClass: z.string().optional(),
  brand: z.string().optional(),
  itemCategory: z.string().optional(),
  manufacturer: z.string().optional(),
  item: z.string().optional(),
});

const createPickingCriteriaSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  category: z.string().min(1, 'category is required'),
  chain: z.string().min(1, 'chain is required'),
  channel: z.string().min(1, 'channel is required'),
  debtor: z.string().min(1, 'debtor is required'),
  deliveryPoint: z.string().min(1, 'deliveryPoint is required'),
  storageClass: z.string().min(1, 'storageClass is required'),
  brand: z.string().min(1, 'brand is required'),
  itemCategory: z.string().min(1, 'itemCategory is required'),
  manufacturer: z.string().min(1, 'manufacturer is required'),
  item: z.string().min(1, 'item is required'),
  minExpiryMonth: z.number().int().min(0, 'minExpiryMonth must be >= 0'),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updatePickingCriteriaSchema = z.object({
  userId: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  chain: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
  debtor: z.string().min(1).optional(),
  deliveryPoint: z.string().min(1).optional(),
  storageClass: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  itemCategory: z.string().min(1).optional(),
  manufacturer: z.string().min(1).optional(),
  item: z.string().min(1).optional(),
  minExpiryMonth: z.number().int().min(0).optional(),
  updatedBy: z.string().min(1),
});

function transformPickingCriteria(record: any) {
  return {
    id: record.id,
    userId: record.userId,
    category: record.category,
    chain: record.chain,
    channel: record.channel,
    debtor: record.debtor,
    deliveryPoint: record.deliveryPoint,
    storageClass: record.storageClass,
    brand: record.brand,
    itemCategory: record.itemCategory,
    manufacturer: record.manufacturer,
    item: record.item,
    minExpiryMonth: record.minExpiryMonth,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
}

export const resolvers = {
  Query: {
    pickingCriterias: async (
      _: unknown,
      args: { filter?: PickingCriteriaFilter; sort?: { sortBy?: string; sortOrder?: string }; pageSize?: number; pageNumber?: number },
      context: GraphQLContext,
    ) => {
      const filter: PickingCriteriaFilter = {};

      if (args.filter) {
        const { success, data, error } = pickingCriteriaFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        Object.assign(filter, data);
      }

      if (args.sort) {
        if (args.sort.sortBy) filter.sortBy = args.sort.sortBy;
        if (args.sort.sortOrder) filter.sortOrder = args.sort.sortOrder;
      }

      const result = await pickingCriteriaRepository.getPickingCriterias(
        filter,
        { pageSize: args.pageSize, pageNumber: args.pageNumber },
        context.organizationId || undefined,
      );

      return {
        query: result.query.map(transformPickingCriteria),
        pagination: result.pagination,
      };
    },

    pickingCriteria: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const record = await pickingCriteriaRepository.getPickingCriteriaById(
        id,
        context.organizationId || undefined,
      );
      if (!record) return null;
      return transformPickingCriteria(record);
    },
  },

  Mutation: {
    createPickingCriteria: withAudit(
      {
        entity: 'PickingCriteria',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: any }, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createPickingCriteriaSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const record = await pickingCriteriaRepository.createPickingCriteria(
          { organizationId: context.organizationId, ...data },
          context.tx,
        );
        return record ? transformPickingCriteria(record) : null;
      },
    ),

    updatePickingCriteria: withAudit(
      {
        entity: 'PickingCriteria',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, ctx) => {
          return await pickingCriteriaRepository.getPickingCriteriaById(
            args.id,
            (ctx as GraphQLContext).organizationId || undefined,
          );
        },
      },
      async (_: unknown, { id, input }: { id: string; input: any }, context: GraphQLContext) => {
        const { success, data, error } = updatePickingCriteriaSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const record = await pickingCriteriaRepository.updatePickingCriteria(
          id,
          data,
          context.organizationId || undefined,
          context.tx,
        );
        if (!record) return null;
        return transformPickingCriteria(record);
      },
    ),

    deletePickingCriteria: withAudit(
      {
        entity: 'PickingCriteria',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, ctx) => {
          return await pickingCriteriaRepository.getPickingCriteriaById(
            args.id,
            (ctx as GraphQLContext).organizationId || undefined,
          );
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await pickingCriteriaRepository.deletePickingCriteria(
          id,
          context.organizationId || undefined,
          context.tx,
        );
      },
    ),
  },
};
