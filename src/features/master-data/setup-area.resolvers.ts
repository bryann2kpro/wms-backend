/**
 * Setup Area GraphQL Resolvers
 *
 * @description Resolver functions for Setup Area operations.
 * Uses SetupAreaRepository for data access.
 */

import { setupAreasRepository } from '@/composition-root';
import { SetupAreaFilter } from './setup-area.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const setupAreaFilterSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().optional(),
  description: z.string().optional(),
});

const createSetupAreaSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  description: z.string().min(1, 'Description is required'),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updateSetupAreaSchema = z.object({
  code: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  updatedBy: z.string().min(1),
});

function transformSetupArea(record: {
  id: string;
  code: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    id: record.id,
    code: record.code,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
}

export const resolvers = {
  Query: {
    setupAreas: async (_: unknown, args: {
      filter?: {
        id?: string;
        code?: string;
        description?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: SetupAreaFilter = {};

      if (args.filter) {
        const { success, data, error } = setupAreaFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.id) filter.id = data.id;
        if (data.code) filter.code = data.code;
        if (data.description) filter.description = data.description;
      }

      const result = await setupAreasRepository.getSetupAreas(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      return {
        query: result.query.map(transformSetupArea),
        pagination: result.pagination,
      };
    },

    setupArea: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const record = await setupAreasRepository.getSetupAreaById(id, context.organizationId || undefined);
      if (!record) return null;
      return transformSetupArea(record);
    },
  },

  Mutation: {
    createSetupArea: withAudit(
      {
        entity: 'SetupArea',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: {
        code: string;
        description: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createSetupAreaSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const record = await setupAreasRepository.createSetupArea({
          organizationId: context.organizationId,
          code: data.code,
          description: data.description,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        return record ? transformSetupArea(record) : null;
      },
    ),

    updateSetupArea: withAudit(
      {
        entity: 'SetupArea',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await setupAreasRepository.getSetupAreaById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        code?: string;
        description?: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success, data, error } = updateSetupAreaSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const record = await setupAreasRepository.updateSetupArea({
          code: data.code,
          description: data.description,
          updatedBy: data.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!record) return null;
        return transformSetupArea(record);
      },
    ),

    deleteSetupArea: withAudit(
      {
        entity: 'SetupArea',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await setupAreasRepository.getSetupAreaById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await setupAreasRepository.deleteSetupArea(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
