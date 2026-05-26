/**
 * Setup Area GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for WMS Setup > Area master data (m_area).
 * Resolvers are in setup-area.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  SetupArea - simple master-data lookup (code + description) for WMS Setup > Area
  """
  type SetupArea {
    id: ID!
    code: String!
    description: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated SetupArea response
  """
  type SetupAreaPaginatedResponse {
    query: [SetupArea!]!
    pagination: Pagination!
  }

  """
  Input for filtering setup areas
  """
  input SetupAreaFilterInput {
    id: ID
    code: String
    description: String
  }

  """
  Input for creating a new SetupArea
  """
  input CreateSetupAreaInput {
    code: String!
    description: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing SetupArea
  """
  input UpdateSetupAreaInput {
    code: String
    description: String
    updatedBy: String!
  }

  extend type Query {
    """
    Get setup areas with optional filtering and pagination.
    Requires authentication.
    """
    setupAreas(filter: SetupAreaFilterInput, pageSize: Int, pageNumber: Int): SetupAreaPaginatedResponse! @auth

    """
    Get a single setup area by ID.
    Requires authentication.
    """
    setupArea(id: ID!): SetupArea @auth
  }

  extend type Mutation {
    """
    Create a new setup area.
    Requires authentication.
    """
    createSetupArea(input: CreateSetupAreaInput!): SetupArea! @auth

    """
    Update an existing setup area.
    Requires authentication.
    """
    updateSetupArea(id: ID!, input: UpdateSetupAreaInput!): SetupArea @auth

    """
    Delete a setup area.
    Requires authentication.
    """
    deleteSetupArea(id: ID!): Boolean! @auth
  }
`;
