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

  type MissingGrnMovement {
    grnNo: String!
    grnItemId: ID!
    qty: String!
    receivedAt: String
  }

  type MissingDoMovement {
    poNo: String!
    doNo: String!
    doItemId: ID!
    qtyRequired: String!
  }

  type MissingAdjustmentMovement {
    adjustmentNo: String!
    stockAdjustmentId: ID!
    adjustmentItemId: ID!
    quantity: String!
    movementType: InventoryMovementType!
  }

  type SkuIntegrityCheckResult {
    skuId: ID!
    missingGrnMovements: [MissingGrnMovement!]!
    missingDoMovements: [MissingDoMovement!]!
    missingAdjustmentMovements: [MissingAdjustmentMovement!]!
    totalMissing: Int!
  }

  type BackfillSkuMovementsResult {
    skuId: ID!
    backfilledCount: Int!
    reconcileResult: ReconcileSkuBalanceResult!
  }

  """
  Result of a SKU balance reconciliation.
  """
  type ReconcileSkuBalanceResult {
    skuId: ID!
    movementsFixed: Int!
    finalOnHandQty: String!
    finalLossQty: String!
    finalReservedQty: String!
  }

  extend type Mutation {
    """
    Replay all movements for a SKU from zero and recompute every balanceAfter.
    Also corrects inventory_balances to match. Runs in a single transaction.
    """
    reconcileSkuBalance(skuId: ID!): ReconcileSkuBalanceResult! @auth

    """
    Create missing inventory_movements for any approved GRNs, shipped DOs, and
    stock adjustments that were processed without a movement record, then reconcile.
    """
    backfillSkuMovements(skuId: ID!): BackfillSkuMovementsResult! @auth
  }

  extend type Query {
    """
    Check which approved GRNs, shipped DOs, and stock adjustments for a SKU
    are missing their corresponding inventory_movements records.
    """
    skuIntegrityCheck(skuId: ID!): SkuIntegrityCheckResult! @auth
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
  }
`;
