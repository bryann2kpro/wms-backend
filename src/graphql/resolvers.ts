/**
 * GraphQL Resolvers Aggregator
 * 
 * @description Merges all feature resolvers into a single resolver map for Apollo Server.
 * Uses @graphql-tools/merge to deep merge resolver objects.
 */

import { mergeResolvers } from '@graphql-tools/merge';

// Feature resolvers (separated from typeDefs for proper layer separation)
import { resolvers as skuResolvers } from '@/features/master-data/sku.resolvers';
import { resolvers as authResolvers } from '@/features/auth/auth.resolvers';
import { resolvers as rbacResolvers } from '@/features/rbac/rbac.resolvers';

// Master Data resolvers
import { resolvers as regionResolvers } from '@/features/master-data/region.resolvers';
import { resolvers as deliveryScheduleResolvers } from '@/features/master-data/delivery-schedule.resolvers';
import { resolvers as outletsResolvers } from '@/features/master-data/outlets.resolvers';
import { resolvers as suppliersResolvers } from '@/features/master-data/suppliers.resolvers';
import { resolvers as stockUnitResolvers } from '@/features/master-data/stock-unit.resolvers';
import { resolvers as racksResolvers } from '@/features/master-data/racks.resolvers';

// ============================================
// BASE RESOLVERS
// ============================================

/**
 * Base resolvers for root Query and Mutation types.
 */
const baseResolvers = {
  Query: {
    _health: () => 'GraphQL server is running!',
  },
  Mutation: {
    _health: () => 'GraphQL mutations are available!',
  },
};

// ============================================
// MERGED RESOLVERS
// ============================================

/**
 * Combined resolvers object for Apollo Server.
 * Uses mergeResolvers to deep merge all feature resolver objects.
 */
export const resolvers = mergeResolvers([
  baseResolvers,
  skuResolvers,
  authResolvers,
  rbacResolvers,
  // Master Data
  regionResolvers,
  deliveryScheduleResolvers,
  outletsResolvers,
  suppliersResolvers,
  stockUnitResolvers,
  racksResolvers,
]);
