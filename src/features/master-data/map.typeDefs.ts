/**
 * Map GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Map operations.
 * Resolvers are in map.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Map - represents a warehouse section that groups Areas
  """
  type Map {
    mapId: ID!
    mapCode: String!
    mapName: String!
    mapDescription: String
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Map response
  """
  type MapPaginatedResponse {
    query: [Map!]!
    pagination: Pagination!
  }

  """
  Input for filtering maps
  """
  input MapFilterInput {
    mapId: ID
    mapCode: String
    mapName: String
  }

  """
  Input for creating a new Map
  """
  input CreateMapInput {
    mapCode: String!
    mapName: String!
    mapDescription: String
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Map
  """
  input UpdateMapInput {
    mapCode: String
    mapName: String
    mapDescription: String
    updatedBy: String!
  }

  extend type Query {
    """
    Get maps with optional filtering and pagination.
    Requires authentication.
    """
    maps(filter: MapFilterInput, pageSize: Int, pageNumber: Int): MapPaginatedResponse! @auth

    """
    Get a single map by ID.
    Requires authentication.
    """
    map(id: ID!): Map @auth
  }

  extend type Mutation {
    """
    Create a new map.
    Requires authentication.
    """
    createMap(input: CreateMapInput!): Map! @auth

    """
    Update an existing map.
    Requires authentication.
    """
    updateMap(id: ID!, input: UpdateMapInput!): Map @auth

    """
    Delete a map.
    Requires authentication.
    """
    deleteMap(id: ID!): Boolean! @auth
  }
`;
