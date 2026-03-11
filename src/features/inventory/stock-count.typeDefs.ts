/**
 * Stock Count GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Stock Count.
 * Resolvers are in stock-count.resolver.ts
 */

export const typeDefs = `#graphql
  """
  Stock Count - snapshot view of SKU opening quantities vs current balances.
  """
  type StockCount {
    skuId: ID!
    skuCode: String!
    skuDescription: String!
    openingQty: Float!
    openingLossQty: Float!
    onHandQty: Float!
    reservedQty: Float!
    lossQty: Float!
    skuExpiryDate: String
    qtyDifference: Float!
    lossQtyDifference: Float!
  }

  """
  Paginated Stock Count response
  """
  type StockCountPaginatedResponse {
    query: [StockCount!]!
    pagination: Pagination!
  }

  """
  Input for filtering stock counts
  """
  input StockCountFilterInput {
    skuId: ID
    skuCode: String
    skuDescription: String
    search: String
  }

  extend type Query {
    """
    Get stock counts with optional filtering and pagination.
    """
    stockCounts(
      filter: StockCountFilterInput
      pageSize: Int
      pageNumber: Int
    ): StockCountPaginatedResponse
  }
`;
