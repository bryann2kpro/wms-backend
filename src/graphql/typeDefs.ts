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
import { typeDefs as invoicesTypeDefs } from "@/features/invoicing/invoices.typeDefs";
import { typeDefs as inventoryTypeDefs } from '@/features/inventory/inventory-movement/inventory.typeDefs';
import { typeDefs as inventoryBalanceTypeDefs } from '@/features/inventory/inventory-balance/inventory.typeDefs';
import { typeDefs as stockCountTypeDefs } from '@/features/inventory/stock-count.typeDefs';
import { typeDefs as stockCountSessionTypeDefs } from '@/features/inventory/stock-count-session.typeDefs';
import { typeDefs as stockAdjustmentTypeDefs } from '@/features/inventory/stock-adjustment/stock-adjustment.typeDefs';
import { typeDefs as stockQuantTypeDefs } from '@/features/stock-quant/stock-quant.typeDefs';
import { typeDefs as stockQuantTransactionTypeDefs } from '@/features/stock-quant/stock-quant-transaction/stock-quant-transaction.typeDefs';
import { typeDefs as putawayTypeDefs } from '@/features/stock-quant/putaway/putaway.typeDefs';
import { typeDefs as stockTransferTypeDefs } from '@/features/stock-quant/stock-transfer/stock-transfer.typeDefs';
// Master Data typeDefs
import { typeDefs as organizationTypeDefs } from '@/features/master-data/organization.typeDefs';
import { typeDefs as regionTypeDefs } from '@/features/master-data/region.typeDefs';
import { typeDefs as deliveryScheduleTypeDefs } from '@/features/master-data/delivery-schedule.typeDefs';
import { typeDefs as outletsTypeDefs } from '@/features/master-data/outlets.typeDefs';
import { typeDefs as skuAssignmentTypeDefs } from '@/features/sku-assignment/sku-assignment.typeDefs';
import { typeDefs as suppliersTypeDefs } from '@/features/master-data/suppliers.typeDefs';
import { typeDefs as stockUnitTypeDefs } from '@/features/master-data/stock-unit.typeDefs';
import { typeDefs as racksTypeDefs } from '@/features/master-data/racks.typeDefs';
import { typeDefs as warehousesTypeDefs } from '@/features/master-data/warehouses.typeDefs';
import { typeDefs as mapTypeDefs } from '@/features/master-data/map.typeDefs';
import { typeDefs as areaTypeDefs } from '@/features/master-data/area.typeDefs';
import { typeDefs as setupAreaTypeDefs } from '@/features/master-data/setup-area.typeDefs';
import { typeDefs as pickFaceStrategyTypeDefs } from '@/features/master-data/pick-face-strategy.typeDefs';
import { typeDefs as pickupCriteriaTypeDefs } from '@/features/master-data/pickup-criteria.typeDefs';
import { typeDefs as palletLabelTypeDefs } from '@/features/master-data/pallet-label.typeDefs';
import { typeDefs as transportTypeDefs } from '@/features/master-data/transport.typeDefs';
import { typeDefs as zoneTypeDefs } from '@/features/master-data/zone.typeDefs';
import { typeDefs as binTypeDefs } from '@/features/master-data/bin.typeDefs';
import { typeDefs as putawayRuleTypeDefs } from '@/features/master-data/putaway-rule.typeDefs';
import { typeDefs as pickingCriteriaTypeDefs } from '@/features/master-data/picking-criteria.typeDefs';
import { typeDefs as endUserTypeDefs } from '@/features/master-data/enduser.typeDefs';
import { typeDefs as reportTypeDefs } from '@/features/report/report.typeDefs';
import { typeDefs as documentsTypeDefs } from '@/features/documents/documents.typeDefs';
import { typeDefs as dashboardTypeDefs } from '@/features/dashboard/dashboard.typeDefs';
import { typeDefs as emailSettingsTypeDefs } from '@/features/notifications/email-settings.typeDefs';
import { typeDefs as esTypeDefs } from '@/features/es/es.typeDefs';
import { typeDefs as whatsAppTypeDefs } from '@/features/whatsapp/whatsapp.typeDefs';
import { typeDefs as reservationTypeDefs } from '@/features/reservation/reservation.typeDefs';
import { typeDefs as returnsTypeDefs } from '@/features/returns/returns.typeDefs';

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
  invoicesTypeDefs,
  inventoryTypeDefs,
  inventoryBalanceTypeDefs,
  stockCountTypeDefs,
  stockCountSessionTypeDefs,
  stockAdjustmentTypeDefs,
  stockQuantTypeDefs,
  stockQuantTransactionTypeDefs,
  putawayTypeDefs,
  stockTransferTypeDefs,
  // Master Data
  organizationTypeDefs,
  regionTypeDefs,
  deliveryScheduleTypeDefs,
  outletsTypeDefs,
  skuAssignmentTypeDefs,
  suppliersTypeDefs,
  stockUnitTypeDefs,
  racksTypeDefs,
  warehousesTypeDefs,
  mapTypeDefs,
  areaTypeDefs,
  setupAreaTypeDefs,
  pickFaceStrategyTypeDefs,
  pickupCriteriaTypeDefs,
  palletLabelTypeDefs,
  transportTypeDefs,
  zoneTypeDefs,
  binTypeDefs,
  putawayRuleTypeDefs,
  pickingCriteriaTypeDefs,
  endUserTypeDefs,
  reportTypeDefs,
  documentsTypeDefs,
  auditLogTypeDefs,
  dashboardTypeDefs,
  emailSettingsTypeDefs,
  esTypeDefs,
  whatsAppTypeDefs,
  reservationTypeDefs,
  returnsTypeDefs,
];
