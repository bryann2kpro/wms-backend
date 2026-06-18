/**
 * Inventory Balance GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Inventory Balances.
 * Resolvers are in inventory.resolver.ts
 */

export const typeDefs = `#graphql
  """
  Inventory Balance - on-hand and reserved quantities per SKU.
  Available Quantity = onHandQty - reservedQty
  """
  type InventoryBalance {
    id: ID!
    skuId: ID!
    onHandQty: String!
    lossQty: String!
    reservedQty: String!
    updatedAt: String!
    skuCode: String!
    skuDescription: String!
    pickingStrategy: String!
    isExpiryControlled: Boolean!
    skuExpiryDate: String
    unitCode: String
    unitName: String
  }

  """
  Inventory lot balance - on-hand quantity per SKU and lot, aggregated from stock_quant.
  Rows without lot_no are merged into one line per SKU (lotKey = __no_lot__).
  """
  type InventoryLotBalance {
    id: ID!
    skuId: ID!
    lotKey: String!
    lotNo: String
    onHandQty: String!
    lossQty: String!
    reservedQty: String!
    updatedAt: String!
    skuCode: String!
    skuDescription: String!
    pickingStrategy: String!
    isExpiryControlled: Boolean!
    skuExpiryDate: String
    unitCode: String
    unitName: String
  }

  """
  Paginated Inventory Balances response
  """
  type InventoryBalancePaginatedResponse {
    query: [InventoryBalance!]!
    pagination: Pagination!
  }

  """
  Paginated inventory lot balances response
  """
  type InventoryLotBalancePaginatedResponse {
    query: [InventoryLotBalance!]!
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
    search: String
    recordedDate: String
  }

  extend type Query {
    """
    Get inventory balances with optional filtering and pagination.
    Joins with SKU and stock unit data.
    """
    inventoryBalances(
      filter: InventoryBalanceFilterInput
      pageSize: Int
      pageNumber: Int
      sortBy: String
      sortOrder: String
    ): InventoryBalancePaginatedResponse

    """
    Get inventory lot balances aggregated from stock_quant by SKU and lot.
    Empty lot_no rows merge into one line per SKU.
    """
    inventoryLotBalances(
      filter: InventoryBalanceFilterInput
      pageSize: Int
      pageNumber: Int
      sortBy: String
      sortOrder: String
    ): InventoryLotBalancePaginatedResponse

    """
    Get inventory balances for the given SKU IDs.
    """
    inventoryBalancesBySkuIds(skuIds: [ID!]!): [InventoryBalance!]
  }
`;
