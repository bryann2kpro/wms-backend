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
  }

  """
  Input for creating a new Warehouse
  """
  input CreateWarehouseInput {
    warehouseName: String!
    warehouseCode: String
    warehouseAddress: String
    createdBy: String!
    updatedBy: String!
  }

  extend type Mutation {
    """
    Create a new warehouse.
    Requires authentication.
    """
    createWarehouse(input: CreateWarehouseInput!): Warehouse! @auth
  }
`;

