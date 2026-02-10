/**
 * SKU GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for SKU (Stock Keeping Unit) operations.
 * Resolvers are in sku.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Supplier reference with original SKU code
  """
  type SkuSupplier {
    supplierId: ID!
    supplier: Supplier!
    originalSkuCode: String
  }

  """
  Stock Keeping Unit - represents a product in the inventory
  """
  type Sku {
    skuId: ID!
    skuCode: String!
    skuDescription: String!
    skuPrice: Float!
    skuQuantity: Float!
    skuExpiryDate: String!
    skuSuppliers: [SkuSupplier!]!
    skuUom: String!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for supplier reference when creating/updating SKU
  """
  input SkuSupplierInput {
    supplierId: ID!
    originalSkuCode: String
  }

  """
  Input for creating a new SKU
  """
  input CreateSkuInput {
    skuCode: String!
    skuDescription: String!
    skuPrice: Float!
    skuQuantity: Float!
    skuExpiryDate: String!
    skuSuppliers: [SkuSupplierInput!]!
    skuUom: String!
    isActive: Boolean!
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing SKU
  """
  input UpdateSkuInput {
    skuCode: String
    skuDescription: String
    skuPrice: Float
    skuQuantity: Float
    skuExpiryDate: String
    skuSuppliers: [SkuSupplierInput!]
    skuUom: String
    isActive: Boolean
    updatedBy: String!
  }

  """
  Paginated SKU response
  """
  type SkuPaginatedResponse {
    query: [Sku!]!
    pagination: Pagination!
  }

  """
  Input for filtering SKUs
  """
  input SkuFilterInput {
    skuId: ID
    skuIds: [ID!]
    skuCode: String
    skuCodes: [String!]
    skuDescription: String
    isActive: Boolean
  }

  extend type Query {
    """
    Get SKUs with optional filtering and pagination.
    If pageSize and pageNumber are not provided, returns all matching SKUs.
    Requires authentication.
    """
    skus(filter: SkuFilterInput, pageSize: Int, pageNumber: Int): SkuPaginatedResponse! @auth
    
    """
    Get a single SKU by ID.
    Requires authentication.
    """
    sku(id: ID!): Sku @auth
  }

  extend type Mutation {
    """
    Create a new SKU.
    Requires authentication.
    """
    createSku(input: CreateSkuInput!): Sku! @auth
    
    """
    Update an existing SKU.
    Requires authentication.
    """
    updateSku(id: ID!, input: UpdateSkuInput!): Sku @auth
  }
`;
