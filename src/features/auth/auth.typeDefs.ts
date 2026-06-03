/**
 * Auth GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for authentication and user operations.
 * Resolvers are in auth.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  User account in the WMS system
  """
  type User {
    id: ID!
    email: String!
    displayName: String!
    contactNo: String
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String
    updatedBy: String
    roles: [UserRoleInfo!]!
  }

  """
  Role information attached to a user
  """
  type UserRoleInfo {
    roleId: ID!
    roleName: String!
  }

  """
  Filter input for users query
  """
  input UserFilter {
    email: String
    displayName: String
    isActive: Boolean
    roleId: ID
  }

  """
  Sort field options for users
  """
  enum UserSortField {
    EMAIL
    DISPLAY_NAME
    CREATED_AT
    UPDATED_AT
  }

  """
  Sort direction
  """
  enum SortDirection {
    ASC
    DESC
  }

  """
  Sort input for users query
  """
  input UserSort {
    field: UserSortField!
    direction: SortDirection!
  }

  """
  Pagination input
  """
  input PaginationInput {
    page: Int
    pageSize: Int
  }

  """
  Paginated users response
  """
  type UsersResponse {
    data: [User!]!
    pagination: PaginationInfo!
  }

  """
  Pagination info in response
  """
  type PaginationInfo {
    currentPage: Int!
    pageSize: Int!
    totalCount: Int!
    totalPages: Int!
    hasNextPage: Boolean!
    hasPrevPage: Boolean!
  }

  """
  Login input
  """
  input LoginInput {
    email: String!
    password: String!
  }

  """
  Input for creating a new user.
  Password is required; backend hashes it before storing.
  """
  input CreateUserInput {
    email: String!
    displayName: String!
    password: String!
    roleId: ID!
    organizationId: ID!
    contactNo: String
  }

  """
  Input for updating an existing user.
  Only provided fields are updated. To change role, pass roleId; to set new password, pass password.
  """
  input UpdateUserInput {
    displayName: String
    contactNo: String
    isActive: Boolean
    roleId: ID
    password: String
  }

  """
  Authentication response with tokens
  """
  type AuthResponse {
    accessToken: String!
    refreshToken: String!
    expiresAt: String!
    user: User!
  }

  extend type Query {
    """
    Get all users with optional filtering, sorting, and pagination.
    Requires authentication.
    """
    users(
      filter: UserFilter
      sort: UserSort
      pagination: PaginationInput
    ): UsersResponse! @auth
    
    """
    Get a single user by ID.
    Requires authentication.
    """
    user(id: ID!): User @auth
    
    """
    Get a user by email.
    Requires authentication.
    """
    userByEmail(email: String!): User @auth
  }

  extend type Mutation {
    """
    Login with email and password.
    Returns JWT tokens on success.
    This is a public endpoint (no auth required).
    """
    login(input: LoginInput!): AuthResponse!

    """
    Create a new user and assign a role. Requires authentication.
    """
    createUser(input: CreateUserInput!): User! @auth

    """
    Update an existing user (displayName, contactNo, isActive, role, or password). Requires authentication.
    """
    updateUser(id: ID!, input: UpdateUserInput!): User @auth
  }
`;
