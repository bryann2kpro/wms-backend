/**
 * Routes GraphQL Resolvers
 */

import { routesRepository } from "@/composition-root";
import { GraphQLError } from "graphql";
import { z } from "zod";
import type { RouteType } from "./routes.model";

const createRouteSchema = z.object({
  name: z.string().min(1),
  origin: z.string().min(1),
  destination: z.string().min(1),
  distanceKm: z.string(),
  estimatedDurationMins: z.string(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const updateRouteSchema = createRouteSchema.partial();

function transformRoute(r: RouteType) {
  return {
    id: r.id,
    name: r.name,
    origin: r.origin,
    destination: r.destination,
    distanceKm: r.distanceKm,
    estimatedDurationMins: r.estimatedDurationMins,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export const resolvers = {
  Query: {
    tmsRoutes: async () => {
      const routes = await routesRepository.getRoutes();
      return routes.map(transformRoute);
    },
  },

  Mutation: {
    createTmsRoute: async (_: unknown, { input }: { input: Record<string, unknown> }) => {
      const { success, data, error } = createRouteSchema.safeParse(input);
      if (!success) {
        throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
      }
      const route = await routesRepository.createRoute({ ...data, status: data.status ?? "ACTIVE" });
      return transformRoute(route);
    },

    updateTmsRoute: async (_: unknown, { id, input }: { id: string; input: Record<string, unknown> }) => {
      const { success, data, error } = updateRouteSchema.safeParse(input);
      if (!success) {
        throw new GraphQLError(error.message, { extensions: { code: "BAD_USER_INPUT" } });
      }
      const route = await routesRepository.updateRoute(id, data);
      return route ? transformRoute(route) : null;
    },

    deleteTmsRoute: async (_: unknown, { id }: { id: string }) => {
      return await routesRepository.deleteRoute(id);
    },
  },
};
