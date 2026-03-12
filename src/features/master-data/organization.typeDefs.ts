/**
 * Organization GraphQL Type Definitions
 */

export const typeDefs = `#graphql
  """
  Organization Type
  Represents a tenant/organization in the multi-tenant system
  """
  type Organization {
    id: ID!
    organizationName: String!
    organizationCode: String!
    status: String!
    createdAt: String!
    updatedAt: String!
  }

  """
  Organization Paginated Response
  """
  type OrganizationPaginatedResponse {
    query: [Organization!]!
    pagination: Pagination!
  }

  """
  Organization Filter Input
  """
  input OrganizationFilterInput {
    organizationCode: String
    organizationName: String
    status: String
    search: String
  }

  """
  Create Organization Input
  """
  input CreateOrganizationInput {
    organizationName: String!
    organizationCode: String!
  }

  """
  Update Organization Input
  """
  input UpdateOrganizationInput {
    organizationName: String
    status: String
  }

  extend type Query {
    """
    Get all organizations (Super Admin only)
    """
    organizations(
      filter: OrganizationFilterInput
      pageSize: Int
      pageNumber: Int
    ): OrganizationPaginatedResponse!

    """
    Get a single organization by ID (Super Admin or org members)
    """
    organization(id: ID!): Organization

    """
    Get current user's organization
    """
    currentOrganization: Organization! @auth
  }

  extend type Mutation {
    """
    Create a new organization (Super Admin only)
    """
    createOrganization(input: CreateOrganizationInput!): Organization!

    """
    Update an organization (Super Admin only)
    """
    updateOrganization(id: ID!, input: UpdateOrganizationInput!): Organization
  }
`;
