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
