import { GraphQLError } from "graphql";
import { z } from "zod";
import type { GraphQLContext } from "@/graphql/context";
import { logger } from "@/util/logger";
import type { StockReservationFilter } from "./reservation.model";
import { ReservationService } from "./reservation.service";

const service = new ReservationService();

const reservationFilterSchema = z.object({
  id: z.string().optional(),
  ids: z.array(z.string()).optional(),
  reservationNo: z.string().optional(),
  customerCode: z.string().optional(),
  customerCodes: z.array(z.string()).optional(),
  skuId: z.string().optional(),
  skuIds: z.array(z.string()).optional(),
  grnItemId: z.string().optional(),
  grnItemIds: z.array(z.string()).optional(),
  status: z.string().optional(),
  statuses: z.array(z.string()).optional(),
});

const upsertCustomerPrioritySchema = z.object({
  customerCode: z.string().min(1),
  customerName: z.string().nullable().optional(),
  rank: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const reorderCustomerPrioritiesSchema = z.array(
  z.object({ customerCode: z.string().min(1) }),
);

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function transformReservation(row: any) {
  return {
    ...row,
    qtyReserved: row.qtyReserved?.toString() ?? "0",
    qtyConsumed: row.qtyConsumed?.toString() ?? "0",
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    reserveStart: toIso(row.reserveStart),
    reserveEnd: toIso(row.reserveEnd),
  };
}

function transformCustomerPriority(row: any) {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function normalizeReservationFilter(
  raw?: z.infer<typeof reservationFilterSchema>,
): StockReservationFilter {
  if (!raw) return {};
  const filter: StockReservationFilter = {};
  if (raw.ids?.length) filter.id = raw.ids;
  else if (raw.id) filter.id = raw.id;
  if (raw.reservationNo) filter.reservationNo = raw.reservationNo;
  if (raw.customerCodes?.length) filter.customerCode = raw.customerCodes;
  else if (raw.customerCode) filter.customerCode = raw.customerCode;
  if (raw.skuIds?.length) filter.skuId = raw.skuIds;
  else if (raw.skuId) filter.skuId = raw.skuId;
  if (raw.grnItemIds?.length) filter.grnItemId = raw.grnItemIds;
  else if (raw.grnItemId) filter.grnItemId = raw.grnItemId;
  if (raw.statuses?.length) filter.status = raw.statuses;
  else if (raw.status) filter.status = raw.status;
  return filter;
}

function requireAuth(context: GraphQLContext) {
  if (!context.organizationId || !context.user?.id) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return { organizationId: context.organizationId, userId: context.user.id };
}

export const resolvers = {
  Query: {
    reservation: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        const { organizationId } = requireAuth(context);
        const row = await service.getReservation(organizationId, args.id);
        return row ? transformReservation(row) : null;
      } catch (error) {
        logger.error("[reservation resolver]", error);
        throw error;
      }
    },

    reservations: async (
      _: unknown,
      args: {
        filter?: z.infer<typeof reservationFilterSchema>;
        pageSize?: number;
        pageNumber?: number;
      },
      context: GraphQLContext,
    ) => {
      try {
        const { organizationId } = requireAuth(context);
        const parsed = reservationFilterSchema.safeParse(args.filter ?? {});
        if (!parsed.success) {
          throw new GraphQLError("Invalid reservation filter", {
            extensions: {
              code: "BAD_USER_INPUT",
              errors: parsed.error.flatten().fieldErrors,
            },
          });
        }

        const result = await service.listReservations(
          organizationId,
          normalizeReservationFilter(parsed.data),
          {
            pageSize: args.pageSize,
            pageNumber: args.pageNumber,
          },
        );

        return {
          query: result.query.map(transformReservation),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("[reservations resolver]", error);
        if (error instanceof GraphQLError) throw error;
        throw new GraphQLError((error as Error).message, {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }
    },

    customerPriorities: async (_: unknown, __: unknown, context: GraphQLContext) => {
      try {
        const { organizationId } = requireAuth(context);
        const rows = await service.listCustomerPriorities(organizationId);
        return rows.map(transformCustomerPriority);
      } catch (error) {
        logger.error("[customerPriorities resolver]", error);
        throw error;
      }
    },
  },

  Mutation: {
    createReservation: async (
      _: unknown,
      args: {
        input: {
          customerCode: string;
          skuId: string;
          grnItemId?: string | null;
          qtyReserved: number;
          reserveStart: string;
          reserveEnd: string;
          priorityFlag?: boolean | null;
          sourceType?: string | null;
          sourceId?: string | null;
          notes?: string | null;
        };
      },
      context: GraphQLContext,
    ) => {
      try {
        const { organizationId, userId } = requireAuth(context);
        const row = await service.createReservation(organizationId, userId, {
          customerCode: args.input.customerCode,
          skuId: args.input.skuId,
          grnItemId: args.input.grnItemId ?? null,
          qtyReserved: args.input.qtyReserved,
          reserveStart: new Date(args.input.reserveStart),
          reserveEnd: new Date(args.input.reserveEnd),
          priorityFlag: args.input.priorityFlag ?? false,
          sourceType: args.input.sourceType ?? null,
          sourceId: args.input.sourceId ?? null,
          notes: args.input.notes ?? null,
        });
        return transformReservation(row);
      } catch (error) {
        logger.error("[createReservation resolver]", error);
        if (error instanceof GraphQLError) throw error;
        throw new GraphQLError((error as Error).message, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
    },

    updateReservation: async (
      _: unknown,
      args: {
        id: string;
        input: {
          qtyReserved?: number | null;
          reserveStart?: string | null;
          reserveEnd?: string | null;
          priorityFlag?: boolean | null;
          customerCode?: string | null;
          grnItemId?: string | null;
          notes?: string | null;
        };
      },
      context: GraphQLContext,
    ) => {
      try {
        const { organizationId, userId } = requireAuth(context);

        const input: Parameters<typeof service.updateReservation>[3] = {};
        if (args.input.qtyReserved != null)
          input.qtyReserved = args.input.qtyReserved;
        if (args.input.reserveStart != null)
          input.reserveStart = new Date(args.input.reserveStart);
        if (args.input.reserveEnd != null)
          input.reserveEnd = new Date(args.input.reserveEnd);
        if (args.input.priorityFlag != null)
          input.priorityFlag = args.input.priorityFlag;
        if (args.input.customerCode != null)
          input.customerCode = args.input.customerCode;
        if ("grnItemId" in args.input)
          input.grnItemId = args.input.grnItemId ?? null;
        if ("notes" in args.input) input.notes = args.input.notes ?? null;

        const row = await service.updateReservation(
          organizationId,
          userId,
          args.id,
          input,
        );
        return transformReservation(row);
      } catch (error) {
        logger.error("[updateReservation resolver]", error);
        if (error instanceof GraphQLError) throw error;
        throw new GraphQLError((error as Error).message, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
    },

    cancelReservation: async (
      _: unknown,
      args: { id: string },
      context: GraphQLContext,
    ) => {
      try {
        const { organizationId, userId } = requireAuth(context);
        const row = await service.cancelReservation(
          organizationId,
          userId,
          args.id,
        );
        return transformReservation(row);
      } catch (error) {
        logger.error("[cancelReservation resolver]", error);
        if (error instanceof GraphQLError) throw error;
        throw new GraphQLError((error as Error).message, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
    },

    upsertCustomerPriority: async (
      _: unknown,
      args: { input: z.infer<typeof upsertCustomerPrioritySchema> },
      context: GraphQLContext,
    ) => {
      try {
        const { organizationId, userId } = requireAuth(context);
        const parsed = upsertCustomerPrioritySchema.safeParse(args.input);
        if (!parsed.success) {
          throw new GraphQLError("Invalid customer priority input", {
            extensions: {
              code: "BAD_USER_INPUT",
              errors: parsed.error.flatten().fieldErrors,
            },
          });
        }

        const row = await service.upsertCustomerPriority(
          organizationId,
          userId,
          parsed.data,
        );
        return transformCustomerPriority(row);
      } catch (error) {
        logger.error("[upsertCustomerPriority resolver]", error);
        if (error instanceof GraphQLError) throw error;
        throw new GraphQLError((error as Error).message, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
    },

    reorderCustomerPriorities: async (
      _: unknown,
      args: { ranking: Array<{ customerCode: string }> },
      context: GraphQLContext,
    ) => {
      try {
        const { organizationId, userId } = requireAuth(context);
        const parsed = reorderCustomerPrioritiesSchema.safeParse(args.ranking);
        if (!parsed.success) {
          throw new GraphQLError("Invalid customer priority ranking", {
            extensions: {
              code: "BAD_USER_INPUT",
              errors: parsed.error.flatten().fieldErrors,
            },
          });
        }

        const rows = await service.reorderCustomerPriorities(
          organizationId,
          userId,
          parsed.data,
        );
        return rows.map(transformCustomerPriority);
      } catch (error) {
        logger.error("[reorderCustomerPriorities resolver]", error);
        if (error instanceof GraphQLError) throw error;
        throw new GraphQLError((error as Error).message, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
    },
  },
};
