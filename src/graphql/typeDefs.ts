/**
 * GraphQL Type Definitions Aggregator
 * 
 * @description Aggregates all feature typeDefs into a single array for Apollo Server.
 * Each feature exports its own typeDefs which are combined here with the base schema.
 */

// Feature typeDefs (separated from resolvers for proper layer separation)
import { typeDefs as skuTypeDefs } from '@/features/master-data/sku.typeDefs';
import { typeDefs as authTypeDefs } from '@/features/auth/auth.typeDefs';
import { typeDefs as rbacTypeDefs } from '@/features/rbac/rbac.typeDefs';

// Directive type definitions
import { directiveTypeDefs } from './directives';

// ============================================
// BASE TYPE DEFINITIONS
// ============================================

/**
 * Base schema with root Query and Mutation types.
 * Features use 'extend type Query' and 'extend type Mutation' to add their fields.
 */
const baseTypeDefs = `#graphql
  """
  Root Query type - extended by features
  """
  type Query {
    """
    Health check query (public, no auth required)
    """
    _health: String
  }

  """
  Root Mutation type - extended by features
  """
  type Mutation {
    """
    Health check mutation (placeholder)
    """
    _health: String
  }
`;

// ============================================
// AGGREGATED TYPE DEFINITIONS
// ============================================

/**
 * Combined typeDefs array for Apollo Server.
 * Apollo Server accepts an array of typeDefs and merges them automatically.
 * 
 * Order matters: directive definitions must come first.
 */
export const typeDefs = [
  directiveTypeDefs, // Must be first - defines @auth and @requirePermission
  baseTypeDefs,
  skuTypeDefs,
  authTypeDefs,
  rbacTypeDefs,
];
