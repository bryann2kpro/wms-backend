import { binsRepository } from '@/composition-root';
import { BinFilter } from './bin.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const binFilterSchema = z.object({
  binId: z.string().uuid().optional(),
  rackId: z.string().uuid().optional(),
  rackIds: z.array(z.string().uuid()).optional(),
  isPickFace: z.boolean().optional(),
});

const createBinSchema = z.object({
  rackId: z.string().uuid('Rack ID must be a valid UUID'),
  binCode: z.string().min(1, 'Bin code is required'),
  level: z.string().min(1, 'Level is required'),
  column: z.string().min(1, 'Column is required'),
  capacityVolume: z.number().positive().optional(),
  capacityWeight: z.number().positive().optional(),
  isPickFace: z.boolean().optional().default(false),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updateBinSchema = z.object({
  binCode: z.string().min(1).optional(),
  level: z.string().min(1).optional(),
  column: z.string().min(1).optional(),
  capacityVolume: z.number().positive().optional().nullable(),
  capacityWeight: z.number().positive().optional().nullable(),
  isPickFace: z.boolean().optional(),
  updatedBy: z.string().min(1),
});

function transformBin(bin: any) {
  return {
    binId: bin.binId,
    rackId: bin.rackId,
    binCode: bin.binCode,
    level: bin.level,
    column: bin.column,
    capacityVolume: bin.capacityVolume != null ? Number(bin.capacityVolume) : null,
    capacityWeight: bin.capacityWeight != null ? Number(bin.capacityWeight) : null,
    currentVolume: Number(bin.currentVolume ?? 0),
    currentWeight: Number(bin.currentWeight ?? 0),
    isPickFace: bin.isPickFace,
    createdAt: bin.createdAt instanceof Date ? bin.createdAt.toISOString() : bin.createdAt,
    updatedAt: bin.updatedAt instanceof Date ? bin.updatedAt.toISOString() : bin.updatedAt,
    createdBy: bin.createdBy,
    updatedBy: bin.updatedBy,
  };
}

export const resolvers = {
  Query: {
    bins: async (_: unknown, args: {
      filter?: { binId?: string; rackId?: string; rackIds?: string[]; isPickFace?: boolean };
      pageSize?: number;
      pageNumber?: number;
    }, _context: GraphQLContext) => {
      const filter: BinFilter = {};

      if (args.filter) {
        const { success, data, error } = binFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.binId) filter.binId = data.binId;
        if (data.rackIds?.length) filter.rackId = data.rackIds;
        else if (data.rackId) filter.rackId = data.rackId;
        if (data.isPickFace !== undefined) filter.isPickFace = data.isPickFace;
      }

      const result = await binsRepository.getBins(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformBin),
        pagination: result.pagination,
      };
    },

    bin: async (_: unknown, { id }: { id: string }, _context: GraphQLContext) => {
      const bin = await binsRepository.getBinById(id);
      if (!bin) return null;
      return transformBin(bin);
    },
  },

  Mutation: {
    createBin: withAudit(
      {
        entity: 'Bin',
        action: 'CREATE',
        getEntityId: (result) => result?.binId ?? null,
      },
      async (_: unknown, { input }: { input: {
        rackId: string;
        binCode: string;
        level: string;
        column: string;
        capacityVolume?: number;
        capacityWeight?: number;
        isPickFace?: boolean;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success, data, error } = createBinSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const bin = await binsRepository.createBin({
          rackId: data.rackId,
          binCode: data.binCode,
          level: data.level,
          column: data.column,
          capacityVolume: data.capacityVolume?.toString(),
          capacityWeight: data.capacityWeight?.toString(),
          isPickFace: data.isPickFace,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.tx);
        return bin ? transformBin(bin) : null;
      },
    ),

    updateBin: withAudit(
      {
        entity: 'Bin',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await binsRepository.getBinById(args.id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        binCode?: string;
        level?: string;
        column?: string;
        capacityVolume?: number | null;
        capacityWeight?: number | null;
        isPickFace?: boolean;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success, data, error } = updateBinSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const updateData: Record<string, any> = { updatedBy: data.updatedBy };
        if (data.binCode !== undefined) updateData.binCode = data.binCode;
        if (data.level !== undefined) updateData.level = data.level;
        if (data.column !== undefined) updateData.column = data.column;
        if ('capacityVolume' in data) updateData.capacityVolume = data.capacityVolume?.toString() ?? null;
        if ('capacityWeight' in data) updateData.capacityWeight = data.capacityWeight?.toString() ?? null;
        if (data.isPickFace !== undefined) updateData.isPickFace = data.isPickFace;

        const bin = await binsRepository.updateBin(id, updateData, context.tx);
        if (!bin) return null;
        return transformBin(bin);
      },
    ),

    deleteBin: withAudit(
      {
        entity: 'Bin',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await binsRepository.getBinById(args.id);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await binsRepository.deleteBin(id, context.tx);
      },
    ),
  },
};
