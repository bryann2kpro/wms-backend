import { zonesRepository } from '@/composition-root';
import { ZoneFilter } from './zone.repository';
import { withAudit } from '../audit-log/audit.wrapper';
import { GraphQLContext } from '@/graphql/context';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';

const zoneFilterSchema = z.object({
  zoneId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  purpose: z.enum(['GENERAL', 'WET', 'DRY', 'AMBIENT', 'DAMAGED']).optional(),
  zoneName: z.string().optional(),
});

const createZoneSchema = z.object({
  warehouseId: z.string().uuid('Warehouse ID must be a valid UUID'),
  zoneCode: z.string().min(1, 'Zone code is required'),
  zoneName: z.string().min(1, 'Zone name is required'),
  purpose: z.enum(['GENERAL', 'WET', 'DRY', 'AMBIENT', 'DAMAGED']).optional().default('GENERAL'),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const updateZoneSchema = z.object({
  zoneCode: z.string().min(1).optional(),
  zoneName: z.string().min(1).optional(),
  purpose: z.enum(['GENERAL', 'WET', 'DRY', 'AMBIENT', 'DAMAGED']).optional(),
  updatedBy: z.string().min(1),
});

function transformZone(zone: any) {
  return {
    zoneId: zone.zoneId,
    warehouseId: zone.warehouseId,
    zoneCode: zone.zoneCode,
    zoneName: zone.zoneName,
    purpose: zone.purpose,
    warehouseName: zone.warehouseName ?? null,
    createdAt: zone.createdAt instanceof Date ? zone.createdAt.toISOString() : zone.createdAt,
    updatedAt: zone.updatedAt instanceof Date ? zone.updatedAt.toISOString() : zone.updatedAt,
    createdBy: zone.createdBy,
    updatedBy: zone.updatedBy,
  };
}

export const resolvers = {
  Query: {
    zones: async (_: unknown, args: {
      filter?: { zoneId?: string; warehouseId?: string; purpose?: string; zoneName?: string };
      pageSize?: number;
      pageNumber?: number;
    }, _context: GraphQLContext) => {
      const filter: ZoneFilter = {};

      if (args.filter) {
        const { success, data, error } = zoneFilterSchema.safeParse(args.filter);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        if (data.zoneId) filter.zoneId = data.zoneId;
        if (data.warehouseId) filter.warehouseId = data.warehouseId;
        if (data.purpose) filter.purpose = data.purpose;
        if (data.zoneName) filter.zoneName = data.zoneName;
      }

      const result = await zonesRepository.getZones(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformZone),
        pagination: result.pagination,
      };
    },

    zone: async (_: unknown, { id }: { id: string }, _context: GraphQLContext) => {
      const zone = await zonesRepository.getZoneById(id);
      if (!zone) return null;
      return transformZone(zone);
    },
  },

  Mutation: {
    createZone: withAudit(
      {
        entity: 'Zone',
        action: 'CREATE',
        getEntityId: (result) => result?.zoneId ?? null,
      },
      async (_: unknown, { input }: { input: {
        warehouseId: string;
        zoneCode: string;
        zoneName: string;
        purpose?: string;
        createdBy: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success, data, error } = createZoneSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const zone = await zonesRepository.createZone({
          warehouseId: data.warehouseId,
          zoneCode: data.zoneCode,
          zoneName: data.zoneName,
          purpose: data.purpose,
          createdBy: data.createdBy,
          updatedBy: data.updatedBy,
        }, context.tx);
        return zone ? transformZone(zone) : null;
      },
    ),

    updateZone: withAudit(
      {
        entity: 'Zone',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await zonesRepository.getZoneById(args.id);
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        zoneCode?: string;
        zoneName?: string;
        purpose?: string;
        updatedBy: string;
      }}, context: GraphQLContext) => {
        const { success, data, error } = updateZoneSchema.safeParse(input);
        if (!success) {
          throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
        }
        const zone = await zonesRepository.updateZone(id, {
          zoneCode: data.zoneCode,
          zoneName: data.zoneName,
          purpose: data.purpose as any,
          updatedBy: data.updatedBy,
        }, context.tx);
        if (!zone) return null;
        return transformZone(zone);
      },
    ),

    deleteZone: withAudit(
      {
        entity: 'Zone',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          return await zonesRepository.getZoneById(args.id);
        },
      },
      async (_: unknown, { id }: { id: string }, context: GraphQLContext) => {
        return await zonesRepository.deleteZone(id, context.tx);
      },
    ),
  },
};
