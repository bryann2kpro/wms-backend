/**
 * Areas GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Area operations.
 * Resolvers are in area.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Area - represents a warehouse zone that groups Storage Bins
  """
  type Area {
    areaId: ID!
    mapId: ID
    areaCode: String!
    areaName: String!
    areaDescription: String
    warehouseName: String
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Area response
  """
  type AreaPaginatedResponse {
    query: [Area!]!
    pagination: Pagination!
  }

  """
  Input for filtering areas
  """
  input AreaFilterInput {
    areaId: ID
    mapId: ID
    areaCode: String
    areaName: String
  }

  """
  Input for creating a new Area
  """
  input CreateAreaInput {
    mapId: ID
    areaCode: String!
    areaName: String!
    areaDescription: String
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Area
  """
  input UpdateAreaInput {
    mapId: ID
    areaCode: String
    areaName: String
    areaDescription: String
    updatedBy: String!
  }

  extend type Query {
    """
    Get areas with optional filtering and pagination.
    Requires authentication.
    """
    areas(filter: AreaFilterInput, pageSize: Int, pageNumber: Int): AreaPaginatedResponse! @auth

    """
    Get a single area by ID.
    Requires authentication.
    """
    area(id: ID!): Area @auth
  }

  extend type Mutation {
    """
    Create a new area.
    Requires authentication.
    """
    createArea(input: CreateAreaInput!): Area! @auth

    """
    Update an existing area.
    Requires authentication.
    """
    updateArea(id: ID!, input: UpdateAreaInput!): Area @auth

    """
    Delete an area.
    Requires authentication.
    """
    deleteArea(id: ID!): Boolean! @auth
  }
`;
