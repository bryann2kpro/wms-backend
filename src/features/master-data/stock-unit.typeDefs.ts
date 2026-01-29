/**
 * Stock Unit GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Stock Unit (UOM) operations.
 * Resolvers are in stock-unit.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Stock Unit - represents a unit of measurement (UOM)
  """
  type StockUnit {
    stockUnitId: ID!
    unitName: String!
    unitCode: String!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Stock Unit response
  """
  type StockUnitPaginatedResponse {
    query: [StockUnit!]!
    pagination: Pagination!
  }

  """
  Input for filtering stock units
  """
  input StockUnitFilterInput {
    stockUnitId: ID
    stockUnitIds: [ID!]
    unitCode: String
    unitCodes: [String!]
    unitName: String
    isActive: Boolean
  }

  """
  Input for creating a new Stock Unit
  """
  input CreateStockUnitInput {
    unitName: String!
    unitCode: String!
    isActive: Boolean
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Stock Unit
  """
  input UpdateStockUnitInput {
    unitName: String
    unitCode: String
    isActive: Boolean
    updatedBy: String!
  }

  extend type Query {
    """
    Get stock units with optional filtering and pagination.
    Requires authentication.
    """
    stockUnits(filter: StockUnitFilterInput, pageSize: Int, pageNumber: Int): StockUnitPaginatedResponse! @auth
    
    """
    Get a single stock unit by ID.
    Requires authentication.
    """
    stockUnit(id: ID!): StockUnit @auth
  }

  extend type Mutation {
    """
    Create a new stock unit.
    Requires authentication.
    """
    createStockUnit(input: CreateStockUnitInput!): StockUnit! @auth
    
    """
    Update an existing stock unit.
    Requires authentication.
    """
    updateStockUnit(id: ID!, input: UpdateStockUnitInput!): StockUnit @auth

    """
    Toggle stock unit active status.
    Requires authentication.
    """
    toggleStockUnitActive(id: ID!, isActive: Boolean!, updatedBy: String!): StockUnit @auth

    """
    Delete a stock unit.
    Requires authentication.
    """
    deleteStockUnit(id: ID!): Boolean! @auth
  }
`;
