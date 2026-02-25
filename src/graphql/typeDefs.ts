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
import { typeDefs as auditLogTypeDefs } from '@/features/audit-log/audit.typeDefs';
import { typeDefs as grnsTypeDefs } from '@/features/inbound/grns.typeDefs';

// Master Data typeDefs
import { typeDefs as regionTypeDefs } from '@/features/master-data/region.typeDefs';
import { typeDefs as deliveryScheduleTypeDefs } from '@/features/master-data/delivery-schedule.typeDefs';
import { typeDefs as outletsTypeDefs } from '@/features/master-data/outlets.typeDefs';
import { typeDefs as suppliersTypeDefs } from '@/features/master-data/suppliers.typeDefs';
import { typeDefs as stockUnitTypeDefs } from '@/features/master-data/stock-unit.typeDefs';
import { typeDefs as racksTypeDefs } from '@/features/master-data/racks.typeDefs';
import { typeDefs as reportTypeDefs } from '@/features/report/report.typeDefs';

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
  Custom scalar for JSON data
  """
  scalar JSON

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

  """
  Common pagination info type
  """
  type Pagination {
    count: Int!
    totalCount: Int!
    currentPage: Int!
    totalPages: Int!
    hasNextPage: Boolean!
    hasPrevPage: Boolean!
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
  grnsTypeDefs,
  // Master Data
  regionTypeDefs,
  deliveryScheduleTypeDefs,
  outletsTypeDefs,
  suppliersTypeDefs,
  stockUnitTypeDefs,
  racksTypeDefs,
  reportTypeDefs,
  auditLogTypeDefs,

];
