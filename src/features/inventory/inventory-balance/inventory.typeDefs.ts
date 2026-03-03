/**
 * Inventory Balance GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Inventory Balances.
 * Resolvers are in inventory.resolver.ts
 */

export const typeDefs = `#graphql
  """
  Inventory Balance - on-hand and reserved quantities per SKU at a point in time.
  Available Quantity = onHandQty - reservedQty
  """
  type InventoryBalance {
    id: ID!
    skuId: ID!
    skuCode: String!
    recordedDate: String!
    onHandQty: String!
    lossQty: String!
    reservedQty: String!
  }

  """
  Paginated Inventory Balances response
  """
  type InventoryBalancePaginatedResponse {
    query: [InventoryBalance!]!
    pagination: Pagination!
  }

  """
  Input for filtering inventory balances
  """
  input InventoryBalanceFilterInput {
    skuId: ID
    skuIds: [ID!]
    skuCode: String
    skuCodes: [String!]
    recordedDate: String
  }

  extend type Query {
    """
    Get inventory balances with optional filtering and pagination.
    """
    inventoryBalances(
      filter: InventoryBalanceFilterInput
      pageSize: Int
      pageNumber: Int
      sortBy: String
      sortOrder: String
    ): InventoryBalancePaginatedResponse

    """
    Get inventory balances for the given SKU IDs at the latest recorded date.
    """
    inventoryBalancesBySkuIds(skuIds: [ID!]!): [InventoryBalance!]
  }
`;
