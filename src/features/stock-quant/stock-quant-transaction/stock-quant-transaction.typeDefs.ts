/**
 * Stock Quant Transaction GraphQL Type Definitions
 *
 * @description GraphQL schema for `stock_quant_transaction` (SKU quantity moves between racks).
 * Resolvers map to stock-quant-transaction.repository.ts.
 */

export const typeDefs = `#graphql
  """
  Stock quant transaction — a quantity movement of a SKU from one rack to another.
  """
  type StockQuantTransaction {
    id: ID!
    skuId: ID!
    skuCode: String
    lotNo: String
    description: String
    quantity: String!
    sourceRackId: ID!
    sourceRackLabel: String
    destinationRackId: ID
    destinationRackLabel: String
    type: String
    organizationId: ID!
    createdAt: String!
    updatedAt: String!
    createdBy: ID!
    updatedBy: ID
  }

  """
  Paginated stock quant transaction response
  """
  type StockQuantTransactionPaginatedResponse {
    query: [StockQuantTransaction!]!
    pagination: Pagination!
  }

  input StockQuantTransactionFilterInput {
    id: ID
    skuId: ID
    skuIds: [ID!]
    sourceRackId: ID
    sourceRackIds: [ID!]
    destinationRackId: ID
    destinationRackIds: [ID!]
    type: String
  }

  input CreateStockQuantTransactionInput {
    skuId: ID!
    lotNo: String
    description: String
    quantity: String!
    sourceRackId: ID!
    destinationRackId: ID
    type: String
  }

  input UpdateStockQuantTransactionInput {
    lotNo: String
    description: String
    quantity: String
    sourceRackId: ID
    destinationRackId: ID
    type: String
  }

  extend type Query {
    """
    List stock quant transactions with optional filters and pagination.
    """
    stockQuantTransactions(
      filter: StockQuantTransactionFilterInput
      pageSize: Int
      pageNumber: Int
    ): StockQuantTransactionPaginatedResponse

    """
    Get a single stock quant transaction by ID.
    """
    stockQuantTransaction(id: ID!): StockQuantTransaction
  }

  extend type Mutation {
    createStockQuantTransaction(input: CreateStockQuantTransactionInput!): StockQuantTransaction!

    updateStockQuantTransaction(id: ID!, input: UpdateStockQuantTransactionInput!): StockQuantTransaction

    deleteStockQuantTransaction(id: ID!): Boolean!
  }
`;
