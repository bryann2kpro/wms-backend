import { putawayRulesRepository } from '@/composition-root';
import { PutawayRuleFilter } from './putaway-rule.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const putawayRuleFilterSchema = z.object({
  putawayRuleId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  targetZonePurpose: z.string().optional(),
});

const createPutawayRuleSchema = z.object({
  warehouseId: z.string().uuid('Warehouse ID must be a valid UUID'),
  itemAttributeKey: z.string().min(1, 'Item attribute key is required'),
  itemAttributeValue: z.string().min(1, 'Item attribute value is required'),
  targetZonePurpose: z.string().min(1, 'Target zone purpose is required'),
  priority: z.number().int().min(1).optional().default(100),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updatePutawayRuleSchema = z.object({
  itemAttributeKey: z.string().min(1).optional(),
  itemAttributeValue: z.string().min(1).optional(),
  targetZonePurpose: z.string().min(1).optional(),
  priority: z.number().int().min(1).optional(),
  updatedBy: z.string().min(1),
});

function transformPutawayRule(rule: any) {
  return {
    putawayRuleId: rule.putawayRuleId,
    warehouseId: rule.warehouseId,
    itemAttributeKey: rule.itemAttributeKey,
    itemAttributeValue: rule.itemAttributeValue,
    targetZonePurpose: rule.targetZonePurpose,
    priority: rule.priority,
    createdAt: rule.createdAt instanceof Date ? rule.createdAt.toISOString() : rule.createdAt,
    updatedAt: rule.updatedAt instanceof Date ? rule.updatedAt.toISOString() : rule.updatedAt,
    createdBy: rule.createdBy,
    updatedBy: rule.updatedBy,
  };
}

export const resolvers = {
  Query: {
    putawayRules: async (_: unknown, args: {
      filter?: { putawayRuleId?: string; warehouseId?: string; targetZonePurpose?: string };
      pageSize?: number;
      pageNumber?: number;
    }, _context: GraphQLContext) => {
      const filter: PutawayRuleFilter = {};

      if (args.filter) {
        const { success, data, error } = putawayRuleFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.putawayRuleId) filter.putawayRuleId = data.putawayRuleId;
        if (data.warehouseId) filter.warehouseId = data.warehouseId;
        if (data.targetZonePurpose) filter.targetZonePurpose = data.targetZonePurpose;
      }

      const result = await putawayRulesRepository.getPutawayRules(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformPutawayRule),
        pagination: result.pagination,
      };
    },

    putawayRule: async (_: unknown, { id }: { id: string }, _context: GraphQLContext) => {
      const rule = await putawayRulesRepository.getPutawayRuleById(id);
      if (!rule) return null;
      return transformPutawayRule(rule);
    },
  },

  Mutation: {
    createPutawayRule: withAudit(
      {
        entity: 'PutawayRule',
        action: 'CREATE',
        getEntityId: (result) => result?.putawayRuleId ?? null,
      },
      async (_: unknown, { input }: { input: {
        warehouseId: string;
        itemAttributeKey: string;
        itemAttributeValue: string;
        targetZonePurpose: string;
        priority?: number;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success, data, error } = createPutawayRuleSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const rule = await putawayRulesRepository.createPutawayRule({
          warehouseId: data.warehouseId,
          itemAttributeKey: data.itemAttributeKey,
          itemAttributeValue: data.itemAttributeValue,
          targetZonePurpose: data.targetZonePurpose,
          priority: data.priority,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.tx);
        return rule ? transformPutawayRule(rule) : null;
      },
    ),

    updatePutawayRule: withAudit(
      {
        entity: 'PutawayRule',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await putawayRulesRepository.getPutawayRuleById(args.id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        itemAttributeKey?: string;
        itemAttributeValue?: string;
        targetZonePurpose?: string;
        priority?: number;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success, data, error } = updatePutawayRuleSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const rule = await putawayRulesRepository.updatePutawayRule(id, {
          itemAttributeKey: data.itemAttributeKey,
          itemAttributeValue: data.itemAttributeValue,
          targetZonePurpose: data.targetZonePurpose,
          priority: data.priority,
          updatedBy: data.updatedBy,
        }, context.tx);
        if (!rule) return null;
        return transformPutawayRule(rule);
      },
    ),

    deletePutawayRule: withAudit(
      {
        entity: 'PutawayRule',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await putawayRulesRepository.getPutawayRuleById(args.id);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await putawayRulesRepository.deletePutawayRule(id, context.tx);
      },
    ),
  },
};
