/**
 * Stock Quant GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for stock quant rows (SKU quantity per rack).
 * Resolvers should map to stock-quant.repository.ts.
 */

export const typeDefs = `#graphql
  """
  Stock Quant - quantity of a SKU stored in a specific rack.
  """
  type StockQuant {
    id: ID!
    skuId: ID!
    skuCode: String
    description: String
    quantity: String!
    rackId: ID!
    rackLabel: String
    organizationId: ID!
    createdAt: String!
    updatedAt: String!
    createdBy: ID!
    updatedBy: ID
  }

  """
  Paginated Stock Quant response
  """
  type StockQuantPaginatedResponse {
    query: [StockQuant!]!
    pagination: Pagination!
  }

  """
  Input for filtering stock quants
  """
  input StockQuantFilterInput {
    id: ID
    skuId: ID
    skuIds: [ID!]
    rackId: ID
    rackIds: [ID!]
  }

  """
  Input for creating a stock quant row
  """
  input CreateStockQuantInput {
    skuId: ID!
    description: String
    quantity: String!
    rackId: ID!
  }

  """
  Input for updating a stock quant row
  """
  input UpdateStockQuantInput {
    description: String
    quantity: String
    rackId: ID
  }

  """
  Result of a putaway (rack-to-rack) stock quant move.
  """
  type PutawayTransferStockResult {
    success: Boolean!
    message: String!
  }

  input PutawayTransferStockInput {
    """Stock quant row on the source rack (identifies SKU + source rack + available qty)."""
    sourceStockQuantId: ID!
    destinationRackId: ID!
    quantity: String!
  }

  extend type Query {
    """
    Get stock quants with optional filtering and pagination.
    """
    stockQuants(
      filter: StockQuantFilterInput
      pageSize: Int
      pageNumber: Int
    ): StockQuantPaginatedResponse

    """
    Get a single stock quant by ID.
    """
    stockQuant(id: ID!): StockQuant
  }

  extend type Mutation {
    """
    Create a stock quant row.
    """
    createStockQuant(input: CreateStockQuantInput!): StockQuant!

    """
    Update a stock quant row.
    """
    updateStockQuant(id: ID!, input: UpdateStockQuantInput!): StockQuant

    """
    Delete a stock quant row.
    """
    deleteStockQuant(id: ID!): Boolean!

    """
    Move quantity from a source stock quant row to the destination rack (same SKU).
    Validates source row exists and quantity; updates or creates destination stock quant.
    """
    putawayTransferStock(input: PutawayTransferStockInput!): PutawayTransferStockResult!
  }
`;
