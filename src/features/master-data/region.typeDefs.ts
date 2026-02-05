/**
 * Region GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Region operations.
 * Resolvers are in region.resolvers.ts
 */

export const typeDefs = `#graphql
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
  }
`;
