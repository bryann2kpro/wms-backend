/**
 * Transport GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Transport operations.
 * Resolvers are in transport.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Transport - represents a transport/vehicle configuration with dimensional and weight constraints
  """
  type Transport {
    id: ID!
    code: String!
    description: String
    storageBinId: String
    location: String
    minLengthMm: String
    minWidthMm: String
    minHeightMm: String
    minWeightKg: String
    maxLengthMm: String
    maxWidthMm: String
    maxHeightMm: String
    maxWeightKg: String
    numberOfPallets: Int
    """Resolved tonnage class from code, e.g. 3T for WTH4155 (3 TON)."""
    capacityClass: String
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Transport response
  """
  type TransportPaginatedResponse {
    query: [Transport!]!
    pagination: Pagination!
  }

  """
  Input for filtering transports
  """
  input TransportFilterInput {
    id: ID
    code: String
  }

  """
  Input for creating a new Transport
  """
  input CreateTransportInput {
    code: String!
    description: String
    storageBinId: String
    location: String
    minLengthMm: String
    minWidthMm: String
    minHeightMm: String
    minWeightKg: String
    maxLengthMm: String
    maxWidthMm: String
    maxHeightMm: String
    maxWeightKg: String
    numberOfPallets: Int
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Transport
  """
  input UpdateTransportInput {
    code: String
    description: String
    storageBinId: String
    location: String
    minLengthMm: String
    minWidthMm: String
    minHeightMm: String
    minWeightKg: String
    maxLengthMm: String
    maxWidthMm: String
    maxHeightMm: String
    maxWeightKg: String
    numberOfPallets: Int
    updatedBy: String!
  }

  extend type Query {
    """
    Get transports with optional filtering and pagination.
    Requires authentication.
    """
    transports(filter: TransportFilterInput, pageSize: Int, pageNumber: Int): TransportPaginatedResponse! @auth

    """
    Get a single transport by ID.
    Requires authentication.
    """
    transport(id: ID!): Transport @auth
  }

  extend type Mutation {
    """
    Create a new transport.
    Requires authentication.
    """
    createTransport(input: CreateTransportInput!): Transport! @auth

    """
    Update an existing transport.
    Requires authentication.
    """
    updateTransport(id: ID!, input: UpdateTransportInput!): Transport @auth

    """
    Delete a transport.
    Requires authentication.
    """
    deleteTransport(id: ID!): Boolean! @auth
  }
`;
