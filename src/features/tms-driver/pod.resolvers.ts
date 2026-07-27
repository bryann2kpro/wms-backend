/**
 * POD GraphQL Resolvers
 */

import { podRepository, driversRepository, jwtController } from '@/composition-root';
import { GraphQLContext, isAuthenticated } from '@/graphql/context';
import { GraphQLError } from 'graphql';
import type { PodRecordType } from './pod.model';

function getBearerToken(context: GraphQLContext): string | null {
  const header = context.req?.headers?.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/** Same manual-auth pattern as setDriverClock — driver tokens can't use @auth. */
function isAdminOrDriver(context: GraphQLContext): boolean {
  if (isAuthenticated(context)) return true;
  const token = getBearerToken(context);
  if (!token) return false;
  try {
    const payload = jwtController.verifyToken(token);
    return payload.loginType === 'DRIVER';
  } catch {
    return false;
  }
}

function transformPod(record: PodRecordType, driverName?: string | null) {
  return {
    id: record.id,
    doId: record.doId,
    doNo: record.doNo,
    outletName: record.outletName,
    driverId: record.driverId ?? null,
    driverName: driverName ?? null,
    photoUrl: record.photoUrl,
    capturedAt: record.capturedAt.toISOString(),
    lat: record.lat ?? null,
    lng: record.lng ?? null,
    createdAt: record.createdAt.toISOString(),
  };
}

export const resolvers = {
  Query: {
    podRecords: async (_: unknown, { doId }: { doId?: string }) => {
      const records = await podRepository.getPodRecords(doId);
      const results = [];
      for (const record of records) {
        const driver = record.driverId ? await driversRepository.getDriverById(record.driverId) : null;
        results.push(transformPod(record, driver?.name));
      }
      return results;
    },
  },

  Mutation: {
    uploadPod: async (
      _: unknown,
      args: { doId: string; doNo: string; outletName: string; photoUrl: string; driverId?: string; lat?: number; lng?: number },
      context: GraphQLContext,
    ) => {
      if (!isAdminOrDriver(context)) {
        throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
      }
      await podRepository.createPodRecord({
        doId: args.doId,
        doNo: args.doNo,
        outletName: args.outletName,
        photoUrl: args.photoUrl,
        driverId: args.driverId ?? null,
        lat: args.lat !== undefined ? String(args.lat) : null,
        lng: args.lng !== undefined ? String(args.lng) : null,
      });
      return true;
    },
  },
};
