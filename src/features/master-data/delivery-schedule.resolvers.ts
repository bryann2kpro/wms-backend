/**
 * Delivery Schedule GraphQL Resolvers
 * 
 * @description Resolver functions for Region Delivery Schedule operations.
 * Uses DeliveryScheduleRepository for data access.
 */

import { deliveryScheduleRepository } from '@/composition-root';
import { DeliveryScheduleFilter } from './delivery-schedule.repository';
import { withAudit } from '../audit-log/audit.wrapper';

// ============================================
// HELPER FUNCTIONS
// ============================================

function transformSchedule(schedule: {
  scheduleId: string;
  regionId: string;
  regionName: string;
  regionCode: string;
  dayOfWeek: number;
  dayName: string;
  cutoffDaysBefore: number;
  cutoffTime: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}) {
  return {
    scheduleId: schedule.scheduleId,
    regionId: schedule.regionId,
    regionName: schedule.regionName,
    regionCode: schedule.regionCode,
    dayOfWeek: schedule.dayOfWeek,
    dayName: schedule.dayName,
    cutoffDaysBefore: schedule.cutoffDaysBefore,
    cutoffTime: schedule.cutoffTime,
    isActive: schedule.isActive,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
    createdBy: schedule.createdBy,
    updatedBy: schedule.updatedBy,
  };
}

// ============================================
// RESOLVERS
// ============================================

export const resolvers = {
  Query: {
    /**
     * Get delivery schedules with optional filtering and pagination
     */
    deliverySchedules: async (_: unknown, args: {
      filter?: {
        scheduleId?: string;
        scheduleIds?: string[];
        regionId?: string;
        regionIds?: string[];
        dayOfWeek?: number;
        daysOfWeek?: number[];
        isActive?: boolean;
      };
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: DeliveryScheduleFilter = {};
      
      if (args.filter) {
        if (args.filter.scheduleIds) {
          filter.scheduleId = args.filter.scheduleIds;
        } else if (args.filter.scheduleId) {
          filter.scheduleId = args.filter.scheduleId;
        }
        
        if (args.filter.regionIds) {
          filter.regionId = args.filter.regionIds;
        } else if (args.filter.regionId) {
          filter.regionId = args.filter.regionId;
        }
        
        if (args.filter.daysOfWeek) {
          filter.dayOfWeek = args.filter.daysOfWeek;
        } else if (args.filter.dayOfWeek !== undefined) {
          filter.dayOfWeek = args.filter.dayOfWeek;
        }
        
        if (args.filter.isActive !== undefined) {
          filter.isActive = args.filter.isActive;
        }
      }

      const result = await deliveryScheduleRepository.getDeliverySchedule(filter, {
        pageSize: args.pageSize,
        pageNumber: args.pageNumber,
      });

      return {
        query: result.query.map(transformSchedule),
        pagination: result.pagination,
      };
    },

    /**
     * Get a single delivery schedule by ID
     */
    deliverySchedule: async (_: unknown, { id }: { id: string }) => {
      const schedule = await deliveryScheduleRepository.getScheduleById(id);
      if (!schedule) return null;
      return transformSchedule(schedule);
    },
  },

  Mutation: {
    /**
     * Create a new delivery schedule
     */
    createDeliverySchedule: withAudit(
      {
        entity: 'DeliverySchedule',
        action: 'CREATE',
        getEntityId: (result) => result?.scheduleId ?? null,
      },
      async (_: unknown, { input }: { input: {
        regionId: string;
        dayOfWeek: number;
        cutoffDaysBefore: number;
        cutoffTime: string;
        isActive?: boolean;
        createdBy: string;
        updatedBy: string;
      }}) => {
        const schedule = await deliveryScheduleRepository.createDeliverySchedule({
          regionId: input.regionId,
          dayOfWeek: input.dayOfWeek,
          cutoffDaysBefore: input.cutoffDaysBefore,
          cutoffTime: input.cutoffTime,
          isActive: input.isActive ?? true,
          createdBy: input.createdBy,
          updatedBy: input.updatedBy,
        });

        // Fetch the full schedule with region info
        const fullSchedule = await deliveryScheduleRepository.getScheduleById(schedule.scheduleId);
        return fullSchedule ? transformSchedule(fullSchedule) : null;
      }
    ),

    /**
     * Update an existing delivery schedule
     */
    updateDeliverySchedule: withAudit(
      {
        entity: 'DeliverySchedule',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          const schedule = await deliveryScheduleRepository.getScheduleById(args.id);
          return schedule ? transformSchedule(schedule) : null;
        },
      },
      async (_: unknown, { id, input }: { id: string; input: {
        dayOfWeek?: number;
        cutoffDaysBefore?: number;
        cutoffTime?: string;
        isActive?: boolean;
        updatedBy: string;
      }}) => {
        const updateData: Record<string, unknown> = {
          updatedBy: input.updatedBy,
        };

        if (input.dayOfWeek !== undefined) updateData.dayOfWeek = input.dayOfWeek;
        if (input.cutoffDaysBefore !== undefined) updateData.cutoffDaysBefore = input.cutoffDaysBefore;
        if (input.cutoffTime !== undefined) updateData.cutoffTime = input.cutoffTime;
        if (input.isActive !== undefined) updateData.isActive = input.isActive;

        await deliveryScheduleRepository.updateDeliverySchedule(updateData, id);
        
        // Fetch the full schedule with region info
        const fullSchedule = await deliveryScheduleRepository.getScheduleById(id);
        return fullSchedule ? transformSchedule(fullSchedule) : null;
      }
    ),

    /**
     * Toggle delivery schedule active status
     */
    toggleDeliveryScheduleActive: withAudit(
      {
        entity: 'DeliverySchedule',
        action: 'UPDATE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          const schedule = await deliveryScheduleRepository.getScheduleById(args.id);
          return schedule ? transformSchedule(schedule) : null;
        },
      },
      async (_: unknown, { id, isActive, updatedBy }: { 
        id: string; 
        isActive: boolean; 
        updatedBy: string; 
      }) => {
        await deliveryScheduleRepository.toggleScheduleActive(id, isActive, updatedBy);
        
        // Fetch the full schedule with region info
        const fullSchedule = await deliveryScheduleRepository.getScheduleById(id);
        return fullSchedule ? transformSchedule(fullSchedule) : null;
      }
    ),

    /**
     * Delete a delivery schedule
     */
    deleteDeliverySchedule: withAudit(
      {
        entity: 'DeliverySchedule',
        action: 'DELETE',
        getEntityId: (_, args) => args.id,
        getOldData: async (args) => {
          const schedule = await deliveryScheduleRepository.getScheduleById(args.id);
          return schedule ? transformSchedule(schedule) : null;
        },
      },
      async (_: unknown, { id }: { id: string }) => {
        return await deliveryScheduleRepository.deleteDeliverySchedule(id);
      }
    ),
  },
};
