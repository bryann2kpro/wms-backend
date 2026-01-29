/**
 * Suppliers GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Supplier operations.
 * Resolvers are in suppliers.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Supplier - represents a product supplier
  """
  type Supplier {
    supplierId: ID!
    supplierName: String!
    supplierCode: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Supplier response
  """
  type SupplierPaginatedResponse {
    query: [Supplier!]!
    pagination: Pagination!
  }

  """
  Input for filtering suppliers
  """
  input SupplierFilterInput {
    supplierId: ID
    supplierIds: [ID!]
    supplierCode: String
    supplierCodes: [String!]
    supplierName: String
  }

  """
  Input for creating a new Supplier
  """
  input CreateSupplierInput {
    supplierName: String!
    supplierCode: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Supplier
  """
  input UpdateSupplierInput {
    supplierName: String
    supplierCode: String
    updatedBy: String!
  }

  extend type Query {
    """
    Get suppliers with optional filtering and pagination.
    Requires authentication.
    """
    suppliers(filter: SupplierFilterInput, pageSize: Int, pageNumber: Int): SupplierPaginatedResponse! @auth
    
    """
    Get a single supplier by ID.
    Requires authentication.
    """
    supplier(id: ID!): Supplier @auth
  }

  extend type Mutation {
    """
    Create a new supplier.
    Requires authentication.
    """
    createSupplier(input: CreateSupplierInput!): Supplier! @auth
    
    """
    Update an existing supplier.
    Requires authentication.
    """
    updateSupplier(id: ID!, input: UpdateSupplierInput!): Supplier @auth

    """
    Delete a supplier.
    Requires authentication.
    """
    deleteSupplier(id: ID!): Boolean! @auth
  }
`;
