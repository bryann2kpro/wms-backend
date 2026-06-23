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
    barcode: String
    brand: String
    category: String
    manufacturer: String
    caseRate: Float
    caseExtLengthMm: Float
    caseExtWidthMm: Float
    caseExtHeightMm: Float
    caseGrossWeightKg: Float
    casesPerLayer: Float
    noOfLayers: Float
    skuExpiryDate: String
    """Stock picking strategy for outbound allocation: FIFO (default) | LIFO | FEFO"""
    pickingStrategy: String!
    """When true, lot numbers are required/tracked for this SKU."""
    isLotControlled: Boolean!
    """When true, expiry dates are required/tracked; enables FEFO picking strategy."""
    isExpiryControlled: Boolean!
    """Number of loose items per unit of measure (e.g. pieces per carton)."""
    looseQuantity: Float
    """
    Optional per-expiry / per-rack batch details for this SKU.
    Each entry represents a distinct expiry date and the rack IDs where that batch is stored.
    """
    skuBatches: [SkuBatch!]
    skuSuppliers: [SkuSupplier!]
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
    barcode: String
    brand: String
    category: String
    manufacturer: String
    caseRate: Float
    caseExtLengthMm: Float
    caseExtWidthMm: Float
    caseExtHeightMm: Float
    caseGrossWeightKg: Float
    casesPerLayer: Float
    noOfLayers: Float
    skuExpiryDate: String
    skuBatches: [SkuBatchInput!]
    skuSuppliers: [SkuSupplierInput!]
    skuUom: String!
    isActive: Boolean!
    """Picking strategy: FIFO (default) | LIFO | FEFO"""
    pickingStrategy: String
    """Number of loose items per unit of measure (e.g. pieces per carton)."""
    looseQuantity: Float
    """Optional initial on-hand quantity for inventory balance (used during import/stock initialization)"""
    initialOnHandQty: Float
    createdBy: String
    updatedBy: String
  }

  """
  Input for updating an existing SKU
  """
  input UpdateSkuInput {
    skuCode: String
    skuDescription: String
    barcode: String
    brand: String
    category: String
    manufacturer: String
    caseRate: Float
    caseExtLengthMm: Float
    caseExtWidthMm: Float
    caseExtHeightMm: Float
    caseGrossWeightKg: Float
    casesPerLayer: Float
    noOfLayers: Float
    skuExpiryDate: String
    skuBatches: [SkuBatchInput!]
    skuSuppliers: [SkuSupplierInput!]
    skuUom: String
    isActive: Boolean
    """Picking strategy: FIFO | LIFO | FEFO"""
    pickingStrategy: String
    isLotControlled: Boolean
    isExpiryControlled: Boolean
    """Number of loose items per unit of measure (e.g. pieces per carton)."""
    looseQuantity: Float
    updatedBy: String
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
    """Free-text search across skuCode and skuDescription (case-insensitive, partial match)"""
    search: String
    isActive: Boolean
    """Sort field: SKU_CODE, SKU_DESCRIPTION, UPDATED_AT, CREATED_AT. Default: SKU_CODE"""
    sortBy: String
    """Sort direction: ASC or DESC. Default: ASC"""
    sortOrder: String
  }

  """
  Per-expiry / per-rack batch details for a SKU.
  """
  type SkuBatch {
    expiryDate: String
    rackIds: [ID!]
  }

  """
  Input type for per-expiry / per-rack batch details when creating or updating a SKU.
  """
  input SkuBatchInput {
    expiryDate: String
    rackIds: [ID!]
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
    
    """
    Delete a SKU by ID.
    Requires authentication.
    """
    deleteSku(id: ID!): Boolean! @auth
  }
`;
