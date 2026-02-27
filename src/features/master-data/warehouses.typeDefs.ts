/**
 * Warehouses GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Warehouse operations.
 * Resolvers are in warehouses.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Warehouse - represents a physical storage location
  """
  type Warehouse {
    warehouseId: ID!
    warehouseName: String!
    warehouseCode: String
    warehouseAddress: String
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
    createdByUser: AuditUser
    updatedByUser: AuditUser
  }

  """
  Lightweight user info for audit fields
  """
  type AuditUser {
    id: ID!
    displayName: String!
  }

  """
  Paginated Warehouse response
  """
  type WarehousePaginatedResponse {
    query: [Warehouse!]!
    pagination: Pagination!
  }

  """
  Input for filtering warehouses
  """
  input WarehouseFilterInput {
    warehouseId: ID
    warehouseIds: [ID!]
    warehouseCode: String
    warehouseCodes: [String!]
    warehouseName: String
  }

  """
  Input for creating a new Warehouse
  """
  input CreateWarehouseInput {
    warehouseName: String!
    warehouseCode: String
    warehouseAddress: String
  }

  """
  Input for updating an existing Warehouse
  """
  input UpdateWarehouseInput {
    warehouseName: String
    warehouseCode: String
    warehouseAddress: String
  }

  extend type Query {
    """
    Get warehouses with optional filtering and pagination.
    Requires authentication.
    """
    warehouses(filter: WarehouseFilterInput, pageSize: Int, pageNumber: Int): WarehousePaginatedResponse! @auth

    """
    Get a single warehouse by ID.
    Requires authentication.
    """
    warehouse(id: ID!): Warehouse @auth
  }

  extend type Mutation {
    """
    Create a new warehouse.
    Requires authentication.
    """
    createWarehouse(input: CreateWarehouseInput!): Warehouse! @auth

    """
    Update an existing warehouse.
    Requires authentication.
    """
    updateWarehouse(id: ID!, input: UpdateWarehouseInput!): Warehouse @auth

    """
    Delete a warehouse.
    Requires authentication.
    """
    deleteWarehouse(id: ID!): Boolean! @auth
  }
`;

