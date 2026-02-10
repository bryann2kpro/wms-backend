/**
 * SKU GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for SKU (Stock Keeping Unit) operations.
 * Resolvers are in sku.resolvers.ts
 */

export const typeDefs = `#graphql
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
    skuSuppliers: [Supplier!]!
    skuUom: String!
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
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
    skuSuppliers: [ID!]!
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
    skuSuppliers: [ID!]
    skuUom: String
    isActive: Boolean
    updatedBy: String!
  }

  extend type Query {
    """
    Get all SKUs.
    Requires authentication.
    """
    skus: [Sku!]! @auth
    
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
