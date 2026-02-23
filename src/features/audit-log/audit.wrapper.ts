/**
 * Audit Log Wrapper for GraphQL Resolvers
 * 
 * @description Provides a higher-order function to wrap mutation resolvers
 * with automatic audit logging functionality.
 */

import { randomUUID } from "crypto";
import { GraphQLContext } from "@/graphql/context";
import { AuditLogRepositoryClass } from "./audit.repository";
import { logger } from "@/util/logger";
import { db } from "@/db";

// ============================================
// TYPES
// ============================================

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'BULK_CREATE'
  | 'BULK_UPDATE'
  | 'BULK_DELETE';

export interface WithAuditOptions<TArgs, TResult> {
  /** The entity/table name being modified */
  entity: string;
  /**
   * The type of action (CREATE, UPDATE, DELETE) or bulk variants
   * (BULK_CREATE, BULK_UPDATE, BULK_DELETE).
   */
  action: AuditActionType;
  /** 
   * Extract the entity ID from the result or args.
   * For CREATE: usually from result (e.g., result.regionId)
   * For UPDATE/DELETE: usually from args (e.g., args.id)
   */
  getEntityId?: (result: TResult | null, args: TArgs) => string | string[] | null;
  /**
   * Fetch old data before the mutation executes (for UPDATE/DELETE).
   * Return null/undefined if not applicable.
   */
  getOldData?: (args: TArgs, context: GraphQLContext) => Promise<unknown> | unknown;
  /**
   * Transform the result to store as newData in audit log.
   * By default, stores the entire result.
   */
  getNewData?: (result: TResult | null, args: TArgs) => unknown;
}

export type ResolverFn<TParent, TArgs, TResult> = (
  parent: TParent,
  args: TArgs,
  context: GraphQLContext,
  info: unknown
) => Promise<TResult>;

// ============================================
// AUDIT REPOSITORY SINGLETON
// ============================================

const auditLogRepository = new AuditLogRepositoryClass();

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract IP address from Express request
 */
function getIpAddress(context: GraphQLContext): string {
  const req = context.req;
  
  // Check various headers for proxied requests
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const forwardedStr = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return forwardedStr.split(',')[0].trim();
  }
  
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Extract User-Agent from Express request
 */
function getUserAgent(context: GraphQLContext): string {
  const userAgent = context.req.headers['user-agent'];
  return userAgent || 'unknown';
}

/**
 * Extract user's role from context
 * Returns the first role name, prioritizing Super Admin if present
 */
function getUserRole(context: GraphQLContext): string | null {
  if (!context.user || context.userRoles.length === 0) {
    return null;
  }

  // Prioritize Super Admin if present
  const superAdminRole = context.userRoles.find(
    (role) => role.roleName === 'Super Admin'
  );
  if (superAdminRole) {
    return superAdminRole.roleName;
  }

  // Otherwise return the first role
  return context.userRoles[0]?.roleName ?? null;
}

// ============================================
// WITH AUDIT WRAPPER
// ============================================

/**
 * Wraps a GraphQL resolver with audit logging functionality.
 * 
 * @param options - Configuration for audit logging
 * @param resolver - The resolver function to wrap
 * @returns Wrapped resolver that logs mutations to audit_logs table
 * 
 * @example
 * ```typescript
 * // CREATE example
 * createRegion: withAudit(
 *   {
 *     entity: 'Region',
 *     action: 'CREATE',
 *     getEntityId: (result) => result?.regionId ?? null,
 *   },
 *   async (_, { input }, context) => {
 *     const region = await regionRepository.createRegion(input);
 *     return transformRegion(region);
 *   }
 * ),
 * 
 * // UPDATE example
 * updateRegion: withAudit(
 *   {
 *     entity: 'Region',
 *     action: 'UPDATE',
 *     getEntityId: (_, args) => args.id,
 *     getOldData: async (args) => regionRepository.getRegionById(args.id),
 *   },
 *   async (_, { id, input }, context) => {
 *     const region = await regionRepository.updateRegion(input, id);
 *     return transformRegion(region);
 *   }
 * ),
 * 
 * // DELETE example
 * deleteRegion: withAudit(
 *   {
 *     entity: 'Region',
 *     action: 'DELETE',
 *     getEntityId: (_, args) => args.id,
 *     getOldData: async (args) => regionRepository.getRegionById(args.id),
 *   },
 *   async (_, { id }) => {
 *     return regionRepository.deleteRegion(id);
 *   }
 * ),
 * ```
 */
export function withAudit<TParent, TArgs, TResult>(
  options: WithAuditOptions<TArgs, TResult>,
  resolver: ResolverFn<TParent, TArgs, TResult>
): ResolverFn<TParent, TArgs, TResult> {
  const { entity, action, getEntityId, getOldData, getNewData } = options;
  const isBulkAction = action === 'BULK_CREATE' || action === 'BULK_UPDATE' || action === 'BULK_DELETE';
  const isCreateAction = action === 'CREATE' || action === 'BULK_CREATE';
  const isDeleteAction = action === 'DELETE' || action === 'BULK_DELETE';

  return async (parent, args, context, info) => {
    const batchId = isBulkAction ? randomUUID() : null;
    let oldData: unknown = null;
    let result: TResult | null = null;

    // Execute everything within a transaction to ensure atomicity
    return await db.transaction(async (tx) => {
      try {
        // Create context with transaction
        const contextWithTx: GraphQLContext = {
          ...context,
          tx,
        };

        // Fetch old data before mutation (for UPDATE/DELETE)
        if (getOldData && (action === 'UPDATE' || action === 'DELETE' || action === 'BULK_UPDATE' || action === 'BULK_DELETE')) {
          try {
            oldData = await getOldData(args, contextWithTx);
          } catch (error) {
            logger.warn('[withAudit] Failed to fetch old data:', error);
          }
        }

        // Execute the actual resolver with transaction in context
        result = await resolver(parent, args, contextWithTx, info);

        // Create audit log entry/entries within the same transaction
        const entityIdValue = getEntityId ? getEntityId(result, args) : null;
        const newDataValue = getNewData ? getNewData(result, args) : result;

        if (isBulkAction && Array.isArray(entityIdValue)) {
          const oldArray = Array.isArray(oldData) ? oldData : entityIdValue.map(() => oldData);
          const newArray = Array.isArray(newDataValue) ? newDataValue : entityIdValue.map(() => newDataValue);

          await Promise.all(
            entityIdValue.map((id, index) =>
              auditLogRepository.createAuditLog({
                userId: context.user?.id ?? null,
                role: getUserRole(context),
                action,
                entity,
                entityId: id,
                batchId,
                oldData: !isCreateAction ? oldArray[index] : undefined,
                newData: !isDeleteAction ? newArray[index] : undefined,
                ipAddress: getIpAddress(context),
                userAgent: getUserAgent(context),
              }, tx)
            )
          );
        } else {
          const entityId = Array.isArray(entityIdValue) ? entityIdValue[0] ?? null : entityIdValue;
          const newData = Array.isArray(newDataValue) ? newDataValue[0] : newDataValue;

          await auditLogRepository.createAuditLog({
            userId: context.user?.id ?? null,
            role: getUserRole(context),
            action,
            entity,
            entityId,
            batchId,
            oldData: !isCreateAction ? oldData : undefined,
            newData: !isDeleteAction ? newData : undefined,
            ipAddress: getIpAddress(context),
            userAgent: getUserAgent(context),
          }, tx);
        }

        return result;
      } catch (error) {
        // Even on error, try to log the failed attempt within the transaction
        try {
          const entityIdValue = getEntityId ? getEntityId(result, args) : null;
          const entityId = Array.isArray(entityIdValue) ? entityIdValue.join(',') : entityIdValue;

          await auditLogRepository.createAuditLog({
            userId: context.user?.id ?? null,
            role: getUserRole(context),
            action: `${action}_FAILED`,
            entity,
            entityId,
            batchId,
            oldData: action !== 'CREATE' ? oldData : undefined,
            newData: { args, error: error instanceof Error ? error.message : String(error) },
            ipAddress: getIpAddress(context),
            userAgent: getUserAgent(context),
          }, tx);
        } catch (logError) {
          logger.error('[withAudit] Failed to create audit log for failed mutation:', logError);
        }

        throw error;
      }
    });
  };
}

/**
 * Creates a pre-configured withAudit function for a specific entity.
 * Useful when multiple mutations operate on the same entity.
 * 
 * @param entity - The entity name
 * @returns Pre-configured withAudit function
 * 
 * @example
 * ```typescript
 * const withRegionAudit = createEntityAudit('Region');
 * 
 * export const resolvers = {
 *   Mutation: {
 *     createRegion: withRegionAudit(
 *       { action: 'CREATE', getEntityId: (r) => r?.regionId ?? null },
 *       async (_, { input }) => { ... }
 *     ),
 *   }
 * };
 * ```
 */
export function createEntityAudit(entity: string) {
  return function<TParent, TArgs, TResult>(
    options: Omit<WithAuditOptions<TArgs, TResult>, 'entity'>,
    resolver: ResolverFn<TParent, TArgs, TResult>
  ): ResolverFn<TParent, TArgs, TResult> {
    return withAudit({ ...options, entity }, resolver);
  };
}
