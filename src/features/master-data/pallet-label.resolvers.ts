/**
 * Pallet Label GraphQL Resolvers
 *
 * @description Resolver functions for Pallet Label operations.
 * Uses PalletLabelRepository for data access.
 */

import { palletLabelsRepository } from '@/composition-root';
import { PalletLabelFilter } from './pallet-label.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const palletLabelFilterSchema = z.object({
  id: z.string().uuid().optional(),
  storageBinId: z.string().uuid().optional(),
  labelCode: z.string().optional(),
});

const createPalletLabelSchema = z.object({
  storageBinId: z.string().uuid().optional(),
  labelCode: z.string().min(1, 'Label code is required'),
  description: z.string().optional(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updatePalletLabelSchema = z.object({
  storageBinId: z.string().uuid().optional(),
  labelCode: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  updatedBy: z.string().min(1),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformPalletLabel(label: {
  id: string;
  storageBinId: string | null;
  labelCode: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    id: label.id,
    storageBinId: label.storageBinId,
    labelCode: label.labelCode,
    description: label.description,
    isActive: label.isActive,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
    createdBy: label.createdBy,
    updatedBy: label.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get pallet labels with optional filtering and pagination
     */
    palletLabels: async (_: unknown, args: {
      filter?: {
        id?: string;
        storageBinId?: string;
        labelCode?: string;
      };
      pageSize?: number;
      pageNumber?: number;
    }, context: GraphQLContext) => {
      const filter: PalletLabelFilter = {};

      if (args.filter) {
        const { success, data, error } = palletLabelFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.id) filter.id = data.id;
        if (data.storageBinId) filter.storageBinId = data.storageBinId;
        if (data.labelCode) filter.labelCode = data.labelCode;
      }

      const result = await palletLabelsRepository.getPalletLabels(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      }, context.organizationId || undefined);

      return {
        query: result.query.map(transformPalletLabel),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single pallet label by ID
     */
    palletLabel: async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
      const label = await palletLabelsRepository.getPalletLabelById(id, context.organizationId || undefined);
      if (!label) return null;
      return transformPalletLabel(label);
    },
  },

  Mutation: {
    /**
     * Create a new pallet label
     */
    createPalletLabel: withAudit(
      {
        entity: 'PalletLabel',
        action: 'CREATE',
        getEntityId: (result) => result?.id ?? null,
      },
      async (_: unknown, { input }: { input: {
        storageBinId?: string;
        labelCode: string;
        description?: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        if (!context.organizationId) {
          throw new GraphQLError('Organization context is required', {
            extensions: { code: 'UNAUTHORIZED', http: { status: 401 } },
          });
        }
        const { success, data, error } = createPalletLabelSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const label = await palletLabelsRepository.createPalletLabel({
          organizationId: context.organizationId,
          storageBinId: data.storageBinId,
          labelCode: data.labelCode,
          description: data.description,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.organizationId, context.tx);
        return label ? transformPalletLabel(label) : null;
      },
    ),

    /**
     * Update an existing pallet label
     */
    updatePalletLabel: withAudit(
      {
        entity: 'PalletLabel',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await palletLabelsRepository.getPalletLabelById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        storageBinId?: string;
        labelCode?: string;
        description?: string;
        isActive?: boolean;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success: uSuccess, data: uData, error: uError } = updatePalletLabelSchema.safeParse(input);
        if (!uSuccess) {
          throw new GraphQLError(prettifyError(uError), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const label = await palletLabelsRepository.updatePalletLabel({
          storageBinId: uData.storageBinId,
          labelCode: uData.labelCode,
          description: uData.description,
          isActive: uData.isActive,
          updatedBy: uData.updatedBy,
        }, id, context.organizationId || undefined, context.tx);
        if (!label) return null;
        return transformPalletLabel(label);
      },
    ),

    /**
     * Delete a pallet label
     */
    deletePalletLabel: withAudit(
      {
        entity: 'PalletLabel',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args, context) => {
          return await palletLabelsRepository.getPalletLabelById(args.id, (context as GraphQLContext).organizationId || undefined);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await palletLabelsRepository.deletePalletLabel(id, context.organizationId || undefined, context.tx);
      },
    ),
  },
};
