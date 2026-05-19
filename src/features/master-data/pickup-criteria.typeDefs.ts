/**
 * Pickup Criteria GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for PickupCriteria operations.
 * Resolvers are in pickup-criteria.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  PickupCriteria - represents a pickup strategy configuration for a SKU
  """
  type PickupCriteria {
    id: ID!
    skuId: ID!
    strategy: String!
    priorityOverride: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated PickupCriteria response
  """
  type PickupCriteriaPaginatedResponse {
    query: [PickupCriteria!]!
    pagination: Pagination!
  }

  """
  Input for filtering pickup criterias
  """
  input PickupCriteriaFilterInput {
    id: ID
    skuId: ID
    strategy: String
  }

  """
  Input for creating a new PickupCriteria
  """
  input CreatePickupCriteriaInput {
    skuId: ID!
    strategy: String
    priorityOverride: Boolean
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing PickupCriteria
  """
  input UpdatePickupCriteriaInput {
    strategy: String
    priorityOverride: Boolean
    updatedBy: String!
  }

  extend type Query {
    """
    Get pickup criterias with optional filtering and pagination.
    Requires authentication.
    """
    pickupCriterias(filter: PickupCriteriaFilterInput, pageSize: Int, pageNumber: Int): PickupCriteriaPaginatedResponse! @auth

    """
    Get a single pickup criteria by ID.
    Requires authentication.
    """
    pickupCriteria(id: ID!): PickupCriteria @auth
  }

  extend type Mutation {
    """
    Create a new pickup criteria.
    Requires authentication.
    """
    createPickupCriteria(input: CreatePickupCriteriaInput!): PickupCriteria! @auth

    """
    Update an existing pickup criteria.
    Requires authentication.
    """
    updatePickupCriteria(id: ID!, input: UpdatePickupCriteriaInput!): PickupCriteria @auth

    """
    Delete a pickup criteria.
    Requires authentication.
    """
    deletePickupCriteria(id: ID!): Boolean! @auth
  }
`;
