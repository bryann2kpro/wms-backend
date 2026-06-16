/**
 * Inventory GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Inventory Movements.
 * Resolvers are in inventory.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Inventory Movement - record of a single inventory change (IN, OUT, ADJUSTMENT, etc.).
  """
  type InventoryMovement {
    id: ID!
    skuId: ID!
    regionId: ID
    movementType: InventoryMovementType!
    quantity: String!
    lossQty: String
    balanceAfter: String!
    referenceNo: String
    reason: String
    lotNo: String
    rackId: ID
    createdAt: String!
    createdBy: String!
    createdByUser: InventoryMovementAuditUser
  }

  """
  User info for audit fields (createdBy).
  """
  type InventoryMovementAuditUser {
    id: ID!
    displayName: String!
  }

  enum InventoryMovementType {
    INBOUND
    RESERVED
    SHIPMENT
    ADJUSTMENT
    DAMAGED
  }

  """
  Paginated Inventory Movements response
  """
  type InventoryMovementPaginatedResponse {
    query: [InventoryMovement!]!
    pagination: Pagination!
  }

  """
  Input for filtering inventory movements
  """
  input InventoryMovementFilterInput {
    id: ID
    skuId: ID
    skuIds: [ID!]
    movementType: InventoryMovementType
    movementTypes: [InventoryMovementType!]
    referenceNo: String
    reason: String
    regionId: ID
    regionIds: [ID!]
    dateFrom: String
    dateTo: String
  }

  """
  Per-batch, per-location stock breakdown for a SKU.
  Derived by aggregating inventory movements grouped by lot, expiry, and rack.
  """
  type SkuStockDetail {
    lotNo: String
    expiryDate: String
    rackId: ID
    rackRow: String
    rackColumn: String
    rackLevel: String
    """Net on-hand quantity at this batch/location (INBOUND+ADJUSTMENT minus SHIPMENT+DAMAGED)"""
    onHandQty: String!
    """Accumulated damaged/loss quantity recorded at this batch/location"""
    lossQty: String!
    """Currently reserved quantity at this batch/location"""
    reservedQty: String!
    """Earliest inbound date — used for FIFO/LIFO sort on the frontend"""
    firstInboundAt: String
  }

  """
  Response for skuStockDetails query.
  """
  type SkuStockDetailResponse {
    skuId: ID!
    details: [SkuStockDetail!]!
  }

  """
  Approved GRN line that has no matching INBOUND inventory_movement for this SKU.
  """
  type MissingGrnMovement {
    grnNo: String!
    grnItemId: ID!
    qty: String!
    receivedAt: String
  }

  """
  Shipped DO line that has no attributable SHIPMENT movement for this SKU.
  """
  type MissingDoMovement {
    poNo: String!
    doNo: String!
    doItemId: ID!
    qtyRequired: String!
  }

  """
  Stock adjustment line with no matching ADJUSTMENT/DAMAGED movement for this SKU.
  """
  type MissingAdjustmentMovement {
    adjustmentNo: String!
    stockAdjustmentId: ID!
    adjustmentItemId: ID!
    quantity: String!
    movementType: InventoryMovementType!
  }

  """
  Result of comparing GRNs, shipped DOs, and adjustments against inventory_movements.
  """
  type SkuIntegrityCheckResult {
    skuId: ID!
    missingGrnMovements: [MissingGrnMovement!]!
    missingDoMovements: [MissingDoMovement!]!
    missingAdjustmentMovements: [MissingAdjustmentMovement!]!
    totalMissing: Int!
  }

  """
  Reconcile stats returned inside backfill (no skuId — parent carries skuId).
  """
  type SkuReconcileSnapshot {
    movementsFixed: Int!
    finalOnHandQty: String!
    finalLossQty: String!
    finalReservedQty: String!
  }

  """
  Result of reconcileSkuBalance mutation.
  """
  type ReconcileSkuBalanceResult {
    skuId: ID!
    movementsFixed: Int!
    finalOnHandQty: String!
    finalLossQty: String!
    finalReservedQty: String!
  }

  """
  Result of backfillSkuMovements mutation.
  """
  type BackfillSkuMovementsResult {
    skuId: ID!
    backfilledCount: Int!
    reconcileResult: SkuReconcileSnapshot!
  }

  extend type Query {
    """
    Get inventory movements with optional filtering and pagination.
    """
    inventoryMovements(
      filter: InventoryMovementFilterInput
      pageSize: Int
      pageNumber: Int
      sortBy: String
      sortOrder: String
    ): InventoryMovementPaginatedResponse

    """
    Get a single inventory movement by ID.
    """
    inventoryMovement(id: ID!): InventoryMovement

    """
    Get per-batch, per-location stock details for a specific SKU.
    Aggregates all inventory movements to show current stock by lot/expiry/rack.
    """
    skuStockDetails(skuId: ID!): SkuStockDetailResponse @auth

    """
    Compare approved GRNs, shipped DOs, and stock adjustments to inventory_movements for a SKU.
    """
    skuIntegrityCheck(skuId: ID!): SkuIntegrityCheckResult! @auth
  }

  extend type Mutation {
    """
    Create missing inventory_movements for a SKU from integrity gaps, then reconcile balances.
    """
    backfillSkuMovements(skuId: ID!): BackfillSkuMovementsResult! @auth

    """
    Replay movements from zero, fix balanceAfter rows, and upsert inventory_balances for a SKU.
    """
    reconcileSkuBalance(skuId: ID!): ReconcileSkuBalanceResult! @auth
  }
`;