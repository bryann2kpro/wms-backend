/**
 * GraphQL Resolvers Aggregator
 * 
 * @description Merges all feature resolvers into a single resolver map for Apollo Server.
 * Uses @graphql-tools/merge to deep merge resolver objects.
 */

import { mergeResolvers } from '@graphql-tools/merge';
import { GraphQLScalarType, Kind } from 'graphql';

// Feature resolvers (separated from typeDefs for proper layer separation)
import { resolvers as skuResolvers } from '@/features/master-data/sku.resolvers';
import { resolvers as authResolvers } from '@/features/auth/auth.resolvers';
import { resolvers as rbacResolvers } from '@/features/rbac/rbac.resolvers';
import { resolvers as auditResolvers } from '@/features/audit-log/audit.resolvers';
import { resolvers as grnsResolvers } from '@/features/inbound/grns.resolvers';
import { resolvers as supplierDeliveriesResolvers } from '@/features/inbound/supplier-deliveries/supplier-deliveries.resolvers';
import { resolvers as outboundResolvers } from '@/features/outbound/outbound.resolvers';
import { resolvers as invoicesResolvers } from "@/features/invoicing/invoices.resolver";
import { resolvers as inventoryResolvers } from '@/features/inventory/inventory-movement/inventory.resolvers';
import { resolvers as inventoryBalanceResolvers } from '@/features/inventory/inventory-balance/inventory.resolver';
import { resolvers as stockCountResolvers } from '@/features/inventory/stock-count.resolver';
import { resolvers as stockCountSessionResolvers } from '@/features/inventory/stock-count-session.resolver';
import { resolvers as stockAdjustmentResolvers } from '@/features/inventory/stock-adjustment/stock-adjustment.resolver';
import { resolvers as stockQuantResolvers } from '@/features/stock-quant/stock-quant.resolvers';
import { resolvers as stockQuantTransactionResolvers } from '@/features/stock-quant/stock-quant-transaction/stock-quant-transaction.resolvers';
import { resolvers as putawayResolvers } from '@/features/stock-quant/putaway/putaway.resolvers';
import { resolvers as stockTransferResolvers } from '@/features/stock-quant/stock-transfer/stock-transfer.resolvers';
// Master Data resolvers
import { resolvers as organizationResolvers } from '@/features/master-data/organization.resolver';
import { resolvers as regionResolvers } from '@/features/master-data/region.resolvers';
import { resolvers as deliveryScheduleResolvers } from '@/features/master-data/delivery-schedule.resolvers';
import { resolvers as outletsResolvers } from '@/features/master-data/outlets.resolvers';
import { resolvers as skuAssignmentResolvers } from '@/features/sku-assignment/sku-assignment.resolvers';
import { resolvers as suppliersResolvers } from '@/features/master-data/suppliers.resolvers';
import { resolvers as stockUnitResolvers } from '@/features/master-data/stock-unit.resolvers';
import { resolvers as racksResolvers } from '@/features/master-data/racks.resolvers';
import { resolvers as warehousesResolvers } from '@/features/master-data/warehouses.resolvers';
import { resolvers as mapResolvers } from '@/features/master-data/map.resolvers';
import { resolvers as areaResolvers } from '@/features/master-data/area.resolvers';
import { resolvers as setupAreaResolvers } from '@/features/master-data/setup-area.resolvers';
import { resolvers as pickFaceStrategyResolvers } from '@/features/master-data/pick-face-strategy.resolvers';
import { resolvers as pickupCriteriaResolvers } from '@/features/master-data/pickup-criteria.resolvers';
import { resolvers as palletLabelResolvers } from '@/features/master-data/pallet-label.resolvers';
import { resolvers as transportResolvers } from '@/features/master-data/transport.resolvers';
import { resolvers as zoneResolvers } from '@/features/master-data/zone.resolver';
import { resolvers as binResolvers } from '@/features/master-data/bin.resolver';
import { resolvers as putawayRuleResolvers } from '@/features/master-data/putaway-rule.resolver';
import { resolvers as pickingCriteriaResolvers } from '@/features/master-data/picking-criteria.resolvers';
import { resolvers as endUserResolvers } from '@/features/master-data/enduser.resolvers';
import { resolvers as reportResolvers } from '@/features/report/report.resolvers';
import { resolvers as documentsResolvers } from '@/features/documents/documents.resolvers';
import { resolvers as dashboardResolvers } from '@/features/dashboard/dashboard.resolver';
import { resolvers as emailSettingsResolvers } from '@/features/notifications/email-settings.resolver';
import { resolvers as esResolvers } from '@/features/es/es.resolvers';
import { resolvers as whatsAppResolvers } from '@/features/whatsapp/whatsapp.resolver';
import { resolvers as reservationResolvers } from '@/features/reservation/reservation.resolvers';
import { resolvers as returnsResolvers } from '@/features/returns/returns.resolvers';

// ============================================
// BASE RESOLVERS
// ============================================

/**
 * Custom JSON scalar type for handling arbitrary JSON data
 */
const JSONScalar: GraphQLScalarType = new GraphQLScalarType({
  name: 'JSON',
  description: 'Custom scalar type for JSON data',
  serialize(value: unknown): unknown {
    return value;
  },
  parseValue(value: unknown): unknown {
    return value;
  },
  parseLiteral(ast: any): unknown {
    switch (ast.kind) {
      case Kind.STRING:
        return JSON.parse(ast.value);
      case Kind.INT:
      case Kind.FLOAT:
        return Number(ast.value);
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.NULL:
        return null;
      case Kind.LIST:
        return ast.values.map((v: any) => JSONScalar.parseLiteral(v, {}));
      case Kind.OBJECT:
        const obj: Record<string, unknown> = {};
        ast.fields.forEach((field: any) => {
          obj[field.name.value] = JSONScalar.parseLiteral(field.value, {});
        });
        return obj;
      default:
        return null;
    }
  },
});

/**
 * Base resolvers for root Query and Mutation types.
 */
const baseResolvers = {
  JSON: JSONScalar,
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
  auditResolvers,
  grnsResolvers,
  supplierDeliveriesResolvers,
  outboundResolvers,
  invoicesResolvers,
  inventoryResolvers,
  inventoryBalanceResolvers,
  stockCountResolvers,
  stockCountSessionResolvers,
  stockAdjustmentResolvers,
  stockQuantResolvers,
  stockQuantTransactionResolvers,
  putawayResolvers,
  stockTransferResolvers,
  // Master Data
  organizationResolvers,
  regionResolvers,
  deliveryScheduleResolvers,
  outletsResolvers,
  skuAssignmentResolvers,
  suppliersResolvers,
  stockUnitResolvers,
  racksResolvers,
  warehousesResolvers,
  mapResolvers,
  areaResolvers,
  setupAreaResolvers,
  pickFaceStrategyResolvers,
  pickupCriteriaResolvers,
  palletLabelResolvers,
  transportResolvers,
  zoneResolvers,
  binResolvers,
  putawayRuleResolvers,
  pickingCriteriaResolvers,
  endUserResolvers,
  reportResolvers,
  documentsResolvers,
  dashboardResolvers,
  emailSettingsResolvers,
  esResolvers,
  whatsAppResolvers,
  reservationResolvers,
  returnsResolvers,
]);
