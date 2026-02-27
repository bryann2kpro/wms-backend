/**
 * GraphQL Custom Directives
 * 
 * @description Implements authorization directives for GraphQL schema.
 * - @auth: Requires user to be authenticated
 * - @requirePermission: Requires user to have specific module/permission
 * 
 * These work similarly to Express middleware but for GraphQL resolvers.
 */

import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { GraphQLSchema, defaultFieldResolver, GraphQLError } from 'graphql';
import { GraphQLContext, hasPermission, isAuthenticated } from '../context';
import { logger } from '@/util/logger';

// ============================================
// ERROR CLASSES
// ============================================

/**
 * Authentication Error (401)
 * Thrown when user is not authenticated
 */
export class AuthenticationError extends GraphQLError {
  constructor(message = 'Unauthorized') {
    super(message, {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 },
      },
    });
  }
}

/**
 * Forbidden Error (403)
 * Thrown when user doesn't have required permission
 */
export class ForbiddenError extends GraphQLError {
  constructor(message = 'Forbidden') {
    super(message, {
      extensions: {
        code: 'FORBIDDEN',
        http: { status: 403 },
      },
    });
  }
}

// ============================================
// DIRECTIVE TYPE DEFINITIONS
// ============================================

/**
 * Type definitions for custom directives.
 * These need to be included in the schema.
 */
export const directiveTypeDefs = `#graphql
  """
  Requires user to be authenticated.
  Use this for operations that don't need specific permissions but require login.
  """
  directive @auth on FIELD_DEFINITION

  """
  Requires user to have a specific permission.
  Implicitly requires authentication.
  
  @param module - The module name (e.g., "Role", "User", "SKU")
  @param permission - The permission type (e.g., "Read", "create", "update", "delete")
  """
  directive @requirePermission(module: String!, permission: String!) on FIELD_DEFINITION
`;

// ============================================
// DIRECTIVE TRANSFORMERS
// ============================================

/**
 * Transforms the schema to apply @auth directive.
 * Checks if user is authenticated before executing the resolver.
 */
function authDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDirective = getDirective(schema, fieldConfig, 'auth')?.[0];

      if (authDirective) {
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context: GraphQLContext, info) {
          // Check authentication
          if (!isAuthenticated(context)) {
            logger.warn(`⚠️ [GraphQL.authDirectiveTransformer] Unauthorized access attempt to ${info.parentType.name}.${info.fieldName}`);
            throw new AuthenticationError('You must be logged in to access this resource');
          }

          return resolve(source, args, context, info);
        };
      }

      return fieldConfig;
    },
  });
}

/**
 * Transforms the schema to apply @requirePermission directive.
 * Checks if user has the required permission before executing the resolver.
 */
function requirePermissionDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const requirePermissionDirective = getDirective(
        schema,
        fieldConfig,
        'requirePermission'
      )?.[0];

      if (requirePermissionDirective) {
        const { module, permission } = requirePermissionDirective;
        const { resolve = defaultFieldResolver } = fieldConfig;

        fieldConfig.resolve = async function (source, args, context: GraphQLContext, info) {
          // First check authentication
          if (!isAuthenticated(context)) {
            logger.warn(`⚠️ [GraphQL.requirePermissionDirectiveTransformer] Unauthorized access attempt to ${info.parentType.name}.${info.fieldName}`);
            throw new AuthenticationError('You must be logged in to access this resource');
          }

          // Then check permission
          if (!hasPermission(context, module, permission)) {
            logger.warn(
              `⚠️ [GraphQL.requirePermissionDirectiveTransformer] Forbidden: User ${context.user?.id} attempted to access ${info.parentType.name}.${info.fieldName} ` +
              `(requires ${module}:${permission})`
            );
            throw new ForbiddenError(
              `You don't have permission to access this resource (requires ${module}:${permission})`
            );
          }

          return resolve(source, args, context, info);
        };
      }

      return fieldConfig;
    },
  });
}

// ============================================
// SCHEMA TRANSFORMER
// ============================================

/**
 * Applies all directive transformers to the schema.
 * Call this after creating the executable schema.
 * 
 * @param schema - The GraphQL schema to transform
 * @returns The transformed schema with directives applied
 */
export function applyDirectives(schema: GraphQLSchema): GraphQLSchema {
  let transformedSchema = schema;
  
  // Apply transformers in order
  transformedSchema = authDirectiveTransformer(transformedSchema);
  transformedSchema = requirePermissionDirectiveTransformer(transformedSchema);
  
  return transformedSchema;
}
