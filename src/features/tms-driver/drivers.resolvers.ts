/**
 * Drivers GraphQL Resolvers
 */

import { driversRepository, jwtController } from '@/composition-root';
import { GraphQLContext, isAuthenticated } from '@/graphql/context';
import { comparePassword, hashPassword } from '@/util/password';
import { prettifyError, z } from 'zod';
import { GraphQLError } from 'graphql';
import { logger } from '@/util/logger';
import type { DriverType } from './drivers.model';

const numericFieldSchema = z.union([z.string(), z.number()]).transform((v) => String(v)).optional();

const createDriverSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  licenseNumber: z.string().min(1),
  licenseExpiry: z.string().min(1),
  status: z.string().optional(),
  plateNumber: z.string().optional(),
  vehicleType: z.string().optional(),
  fleetCategory: z.string().optional(),
  barcode: z.string().optional(),
  email: z.string().email().optional(),
  btm: numericFieldSchema,
  bdm: numericFieldSchema,
  payload: numericFieldSchema,
  length: z.string().optional(),
  width: z.string().optional(),
  height: z.string().optional(),
  pallet4x3: numericFieldSchema,
});

const updateDriverSchema = createDriverSchema.partial();

function transformDriver(record: DriverType) {
  return {
    id: record.id,
    name: record.name,
    phone: record.phone,
    licenseNumber: record.licenseNumber,
    licenseExpiry: record.licenseExpiry,
    status: record.status,
    plateNumber: record.plateNumber ?? null,
    vehicleType: record.vehicleType ?? null,
    fleetCategory: record.fleetCategory ?? null,
    barcode: record.barcode ?? null,
    clockedInAt: record.clockedInAt ? record.clockedInAt.toISOString() : null,
    email: record.email ?? null,
    btm: record.btm ?? null,
    bdm: record.bdm ?? null,
    payload: record.payload ?? null,
    length: record.length ?? null,
    width: record.width ?? null,
    height: record.height ?? null,
    pallet4x3: record.pallet4x3 ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * setDriverClock is callable by an admin (normal @auth session) OR by the
 * driver themselves via a DRIVER-scoped token from tmsmobile — the standard
 * @auth directive can't cover the second case, since driver tokens don't
 * resolve against the admin `users` table. So auth is checked manually here.
 */
function getBearerToken(context: GraphQLContext): string | null {
  const header = context.req?.headers?.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

export const resolvers = {
  Query: {
    drivers: async (_: unknown, args: { status?: string }) => {
      const records = await driversRepository.getDrivers(args.status);
      return records.map(transformDriver);
    },

    driver: async (_: unknown, { id }: { id: string }) => {
      const record = await driversRepository.getDriverById(id);
      return record ? transformDriver(record) : null;
    },
  },

  Mutation: {
    createDriver: async (_: unknown, { input }: { input: Record<string, unknown> }) => {
      const { success, data, error } = createDriverSchema.safeParse(input);
      if (!success) {
        throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
      }
      const record = await driversRepository.createDriver({
        ...data,
        status: data.status ?? 'ACTIVE',
      });
      return transformDriver(record);
    },

    updateDriver: async (_: unknown, { id, input }: { id: string; input: Record<string, unknown> }) => {
      const { success, data, error } = updateDriverSchema.safeParse(input);
      if (!success) {
        throw new GraphQLError(prettifyError(error), { extensions: { code: 'BAD_USER_INPUT' } });
      }
      const record = await driversRepository.updateDriver(id, data);
      return record ? transformDriver(record) : null;
    },

    deleteDriver: async (_: unknown, { id }: { id: string }) => {
      return await driversRepository.deleteDriver(id);
    },

    setDriverClock: async (_: unknown, { driverId, action }: { driverId: string; action: string }, context: GraphQLContext) => {
      const normalizedAction = action.toUpperCase();
      if (normalizedAction !== 'IN' && normalizedAction !== 'OUT') {
        throw new GraphQLError('action must be "IN" or "OUT"', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      const isAdmin = isAuthenticated(context);
      let isSelf = false;

      if (!isAdmin) {
        const token = getBearerToken(context);
        if (token) {
          try {
            const payload = jwtController.verifyToken(token);
            isSelf = payload.loginType === 'DRIVER' && payload.driverId === driverId;
          } catch {
            isSelf = false;
          }
        }
      }

      if (!isAdmin && !isSelf) {
        throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
      }

      const record = await driversRepository.setDriverClock(driverId, normalizedAction as 'IN' | 'OUT');
      if (!record) {
        throw new GraphQLError('Driver not found', { extensions: { code: 'NOT_FOUND' } });
      }
      return transformDriver(record);
    },

    setDriverPassword: async (_: unknown, { driverId, password }: { driverId: string; password: string }, context: GraphQLContext) => {
      const isAdmin = isAuthenticated(context);
      let isSelf = false;

      if (!isAdmin) {
        const token = getBearerToken(context);
        if (token) {
          try {
            const payload = jwtController.verifyToken(token);
            isSelf = payload.loginType === 'DRIVER' && payload.driverId === driverId;
          } catch {
            isSelf = false;
          }
        }
      }

      if (!isAdmin && !isSelf) {
        throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
      }

      const hash = await hashPassword(password);
      return await driversRepository.setDriverPassword(driverId, hash);
    },

    driverLogin: async (_: unknown, { email, password }: { email: string; password: string }) => {
      const driver = await driversRepository.getDriverByEmail(email);
      if (!driver || !driver.passwordHash) {
        logger.warn('⚠️ [DriversResolvers.driverLogin] Driver not found or no password set:', email);
        throw new GraphQLError('Invalid email or password', { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
      }

      const isValid = await comparePassword(password, driver.passwordHash);
      if (!isValid) {
        throw new GraphQLError('Invalid email or password', { extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } } });
      }

      const accessToken = jwtController.generateAccessToken({
        username: driver.email ?? driver.phone,
        loginType: 'DRIVER',
        driverId: driver.id,
      });

      return {
        accessToken,
        driver: transformDriver(driver),
      };
    },
  },
};
