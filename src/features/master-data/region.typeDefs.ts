/**
 * Region GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Region operations.
 * Resolvers are in region.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Flat delivery rate configured per region.
  Rate is per carton (CTN). effectiveQty = MAX(totalQty, minQty).
  SST = totalExclTax × sstRate.
  """
  type RegionPricing {
    id: ID!
    regionId: ID!
    rate: String!
    minQty: String!
    sstRate: String!
    isActive: Boolean!
    updatedAt: String!
  }

  """
  Region - represents a delivery region
  """
  type Region {
    regionId: ID!
    regionName: String!
    regionCode: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
    "Active pricing configuration for this region (null if not yet configured)"
    pricing: RegionPricing
  }

  """
  Paginated Region response
  """
  type RegionPaginatedResponse {
    query: [Region!]!
    pagination: Pagination!
  }

  """
  Input for filtering regions
  """
  input RegionFilterInput {
    regionId: ID
    regionIds: [ID!]
    regionCode: String
    regionCodes: [String!]
    regionName: String
  }

  """
  Input for creating a new Region
  """
  input CreateRegionInput {
    regionName: String!
    regionCode: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Region
  """
  input UpdateRegionInput {
    regionName: String
    regionCode: String
    updatedBy: String!
  }

  """
  Input for creating or updating pricing for a region.
  """
  input UpsertRegionPricingInput {
    "Delivery rate per CTN (MYR)"
    rate: Float!
    "Minimum qty threshold — charge as if this many units when totalQty < minQty (default 5)"
    minQty: Float
    "SST rate as a decimal, e.g. 0.06 = 6% (default 0.06)"
    sstRate: Float
    isActive: Boolean
  }

  extend type Query {
    """
    Get regions with optional filtering and pagination.
    Requires authentication.
    """
    regions(filter: RegionFilterInput, pageSize: Int, pageNumber: Int): RegionPaginatedResponse! @auth
    
    """
    Get a single region by ID.
    Requires authentication.
    """
    region(id: ID!): Region @auth
  }

  extend type Mutation {
    """
    Create a new region.
    Requires authentication.
    """
    createRegion(input: CreateRegionInput!): Region! @auth
    
    """
    Update an existing region.
    Requires authentication.
    """
    updateRegion(id: ID!, input: UpdateRegionInput!): Region @auth

    """
    Delete a region.
    Requires authentication.
    """
    deleteRegion(id: ID!): Boolean! @auth

    """
    Create or update the pricing configuration for a region.
    Requires authentication.
    """
    upsertRegionPricing(regionId: ID!, input: UpsertRegionPricingInput!): RegionPricing! @auth
  }
`;
