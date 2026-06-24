/**
 * Transport GraphQL Resolvers
 *
 * @description Resolver functions for Transport operations.
 * Uses TransportRepository for data access.
 */

import { transportsRepository } from '@/composition-root';
import { TransportFilter } from './transport.repository';
import {
  applyCapacityTemplate,
  withCapacityTemplateDefaults,
} from './transport-capacity.util';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const transportFilterSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().optional(),
});

const numericFieldSchema = z.union([z.string(), z.number()]).transform((v) => String(v)).optional();

const createTransportSchema = z.object({
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
  storageBinId: z.string().optional(),
  location: z.string().optional(),
  minLengthMm: numericFieldSchema,
  minWidthMm: numericFieldSchema,
  minHeightMm: numericFieldSchema,
  minWeightKg: numericFieldSchema,
  maxLengthMm: numericFieldSchema,
  maxWidthMm: numericFieldSchema,
  maxHeightMm: numericFieldSchema,
  maxWeightKg: numericFieldSchema,
  numberOfPallets: z.number().int().nonnegative().optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updateTransportSchema = z.object({
  code: z.string().min(1).optional(),
  description: z.string().optional(),
  storageBinId: z.string().optional(),
  location: z.string().optional(),
  minLengthMm: numericFieldSchema,
  minWidthMm: numericFieldSchema,
  minHeightMm: numericFieldSchema,
  minWeightKg: numericFieldSchema,
  maxLengthMm: numericFieldSchema,
  maxWidthMm: numericFieldSchema,
  maxHeightMm: numericFieldSchema,
  maxWeightKg: numericFieldSchema,
  numberOfPallets: z.number().int().nonnegative().optional(),
  updatedBy: z.string().min(1),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformTransport(record: {
  id: string;
  code: string;
  description: string | null;
  storageBinId: string | null;
  location: string | null;
  minLengthMm: string | null;
  minWidthMm: string | null;
  minHeightMm: string | null;
  minWeightKg: string | null;
  maxLengthMm: string | null;
  maxWidthMm: string | null;
  maxHeightMm: string | null;
  maxWeightKg: string | null;
  numberOfPallets: number | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  const base = {
    id: record.id,
    code: record.code,
    description: record.description ?? null,
    storageBinId: record.storageBinId ?? null,
    location: record.location ?? null,
    minLengthMm: record.minLengthMm ?? null,
    minWidthMm: record.minWidthMm ?? null,
    minHeightMm: record.minHeightMm ?? null,
    minWeightKg: record.minWeightKg ?? null,
    maxLengthMm: record.maxLengthMm ?? null,
    maxWidthMm: record.maxWidthMm ?? null,
    maxHeightMm: record.maxHeightMm ?? null,
    maxWeightKg: record.maxWeightKg ?? null,
    numberOfPallets: record.numberOfPallets ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
  return applyCapacityTemplate(base);
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get transports with optional filtering and pagination
     */
    transports: async (_: unknown, args: {
      filter?: {
        id?: string;
        code?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: TransportFilter = {};

      if (args.filter) {
        const { success, data, error } = transportFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.id) filter.id = data.id;
        if (data.code) filter.code = data.code;
      }

      const result = await transportsRepository.getTransports(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      return {
        query: result.query.map(transformTransport),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single transport by ID
     */
    transport: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const record = await transportsRepository.getTransportById(id, context.organizationId || undefined);
      if (!record) return null;
      return transformTransport(record);
    },
  },

  Mutation: {
    /**
     * Create a new transport
     */
    createTransport: withAudit(
      {
        entity: 'Transport',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: {
        code: string;
        description?: string;
        storageBinId?: string;
        location?: string;
        minLengthMm?: string;
        minWidthMm?: string;
        minHeightMm?: string;
        minWeightKg?: string;
        maxLengthMm?: string;
        maxWidthMm?: string;
        maxHeightMm?: string;
        maxWeightKg?: string;
        numberOfPallets?: number;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createTransportSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const withDefaults = withCapacityTemplateDefaults(data);
        const record = await transportsRepository.createTransport({
          organizationId: context.organizationId,
          code: withDefaults.code,
          description: withDefaults.description ?? null,
          storageBinId: withDefaults.storageBinId ?? null,
          location: withDefaults.location ?? null,
          minLengthMm: withDefaults.minLengthMm ?? null,
          minWidthMm: withDefaults.minWidthMm ?? null,
          minHeightMm: withDefaults.minHeightMm ?? null,
          minWeightKg: withDefaults.minWeightKg ?? null,
          maxLengthMm: withDefaults.maxLengthMm ?? null,
          maxWidthMm: withDefaults.maxWidthMm ?? null,
          maxHeightMm: withDefaults.maxHeightMm ?? null,
          maxWeightKg: withDefaults.maxWeightKg ?? null,
          numberOfPallets: withDefaults.numberOfPallets ?? null,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        return record ? transformTransport(record) : null;
      },
    ),

    /**
     * Update an existing transport
     */
    updateTransport: withAudit(
      {
        entity: 'Transport',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await transportsRepository.getTransportById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        code?: string;
        description?: string;
        storageBinId?: string;
        location?: string;
        minLengthMm?: string;
        minWidthMm?: string;
        minHeightMm?: string;
        minWeightKg?: string;
        maxLengthMm?: string;
        maxWidthMm?: string;
        maxHeightMm?: string;
        maxWeightKg?: string;
        numberOfPallets?: number;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success: uSuccess, data: uData, error: uError } = updateTransportSchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError(prettifyError(uError), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const existing = await transportsRepository.getTransportById(id, context.organizationId || undefined);
        const merged = withCapacityTemplateDefaults({
          code: uData.code ?? existing?.code ?? '',
          description: uData.description ?? existing?.description,
          minLengthMm: uData.minLengthMm ?? existing?.minLengthMm,
          minWidthMm: uData.minWidthMm ?? existing?.minWidthMm,
          minHeightMm: uData.minHeightMm ?? existing?.minHeightMm,
          minWeightKg: uData.minWeightKg ?? existing?.minWeightKg,
          maxLengthMm: uData.maxLengthMm ?? existing?.maxLengthMm,
          maxWidthMm: uData.maxWidthMm ?? existing?.maxWidthMm,
          maxHeightMm: uData.maxHeightMm ?? existing?.maxHeightMm,
          maxWeightKg: uData.maxWeightKg ?? existing?.maxWeightKg,
          numberOfPallets: uData.numberOfPallets ?? existing?.numberOfPallets,
        });
        const record = await transportsRepository.updateTransport({
          code: uData.code,
          description: merged.description,
          storageBinId: uData.storageBinId,
          location: uData.location,
          minLengthMm: merged.minLengthMm,
          minWidthMm: merged.minWidthMm,
          minHeightMm: merged.minHeightMm,
          minWeightKg: merged.minWeightKg,
          maxLengthMm: merged.maxLengthMm,
          maxWidthMm: merged.maxWidthMm,
          maxHeightMm: merged.maxHeightMm,
          maxWeightKg: merged.maxWeightKg,
          numberOfPallets: merged.numberOfPallets,
          updatedBy: uData.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!record) return null;
        return transformTransport(record);
      },
    ),

    /**
     * Delete a transport
     */
    deleteTransport: withAudit(
      {
        entity: 'Transport',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await transportsRepository.getTransportById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await transportsRepository.deleteTransport(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
