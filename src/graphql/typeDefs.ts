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
import { typeDefs as supplierDeliveriesTypeDefs } from '@/features/inbound/supplier-deliveries/supplier-deliveries.typeDefs';
import { typeDefs as outboundTypeDefs } from '@/features/outbound/outbound.typeDefs';
import { typeDefs as inventoryTypeDefs } from '@/features/inventory/inventory-movement/inventory.typeDefs';
import { typeDefs as inventoryBalanceTypeDefs } from '@/features/inventory/inventory-balance/inventory.typeDefs';
import { typeDefs as stockCountTypeDefs } from '@/features/inventory/stock-count.typeDefs';
// Master Data typeDefs
import { typeDefs as regionTypeDefs } from '@/features/master-data/region.typeDefs';
import { typeDefs as deliveryScheduleTypeDefs } from '@/features/master-data/delivery-schedule.typeDefs';
import { typeDefs as outletsTypeDefs } from '@/features/master-data/outlets.typeDefs';
import { typeDefs as suppliersTypeDefs } from '@/features/master-data/suppliers.typeDefs';
import { typeDefs as stockUnitTypeDefs } from '@/features/master-data/stock-unit.typeDefs';
import { typeDefs as racksTypeDefs } from '@/features/master-data/racks.typeDefs';
import { typeDefs as warehousesTypeDefs } from '@/features/master-data/warehouses.typeDefs';
import { typeDefs as reportTypeDefs } from '@/features/report/report.typeDefs';
import { typeDefs as dashboardTypeDefs } from '@/features/dashboard/dashboard.typeDefs';

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
  supplierDeliveriesTypeDefs,
  outboundTypeDefs,
  inventoryTypeDefs,
  inventoryBalanceTypeDefs,
  stockCountTypeDefs,
  // Master Data
  regionTypeDefs,
  deliveryScheduleTypeDefs,
  outletsTypeDefs,
  suppliersTypeDefs,
  stockUnitTypeDefs,
  racksTypeDefs,
  warehousesTypeDefs,
  reportTypeDefs,
  auditLogTypeDefs,
  dashboardTypeDefs,
];
