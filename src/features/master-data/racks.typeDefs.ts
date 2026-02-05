/**
 * Racks GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Rack operations.
 * Resolvers are in racks.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Rack - represents a rack location
  """
  type Rack {
    rackId: ID!
    rackRow: String!
    rackColumn: String!
    rackLevel: String!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Rack response
  """
  type RackPaginatedResponse {
    query: [Rack!]!
    pagination: Pagination!
  }

  """
  Input for filtering racks
  """
  input RackFilterInput {
    rackId: ID
    rackRow: String
    rackColumn: String
    rackLevel: String
  }

  """
  Input for creating a new Rack
  """
  input CreateRackInput {
    rackRow: String!
    rackColumn: String!
    rackLevel: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Rack
  """
  input UpdateRackInput {
    rackRow: String
    rackColumn: String
    rackLevel: String
    updatedBy: String!
  }

  extend type Query {
    """
    Get racks with optional filtering and pagination.
    Requires authentication.
    """
    racks(filter: RackFilterInput, pageSize: Int, pageNumber: Int): RackPaginatedResponse! @auth
    
    """
    Get a single rack by ID.
    Requires authentication.
    """
    rack(id: ID!): Rack @auth
  }

  extend type Mutation {
    """
    Create a new rack.
    Requires authentication.
    """
    createRack(input: CreateRackInput!): Rack! @auth
    
    """
    Update an existing rack.
    Requires authentication.
    """
    updateRack(id: ID!, input: UpdateRackInput!): Rack @auth

    """
    Assign an rack to a region.
    Requires authentication.
    """
    assignRackToRegion(rackId: ID!, regionId: ID, updatedBy: String!): Rack @auth

    """
    Bulk assign racks to a region.
    Requires authentication.
    """
    bulkAssignRacksToRegion(rackIds: [ID!]!, regionId: ID, updatedBy: String!): [Rack!]! @auth

    """
    Delete an rack.
    Requires authentication.
    """
    deleteRack(id: ID!): Boolean! @auth
  }
`;
