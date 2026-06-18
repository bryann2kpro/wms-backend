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
    warehouseId: ID
    zoneId: ID
    areaId: ID
    rackRow: String!
    rackColumn: String!
    rackLevel: String!
    binCode: String
    barCode: String
    binType: String!
    length: String
    width: String
    height: String
    weight: String
    maxPallet: String
    isActive: Boolean!
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
  Aggregated capacity/usage for a rack, derived from m_racks dimensions and
  current stock_quant + m_skus data. Volumes are m³, weights are kg.
  """
  type RackUtilization {
    rackId: ID!
    volCapacity: Float
    volCurrent: Float!
    weightCapacity: Float
    weightCurrent: Float!
    """Total on-hand cartons on this rack (sum of stock_quant quantities)."""
    cartonCount: Int!
  }

  """
  Input for sorting racks
  """
  input RackSortInput {
    sortBy: String
    sortOrder: String
  }

  """
  Input for filtering racks
  """
  input RackFilterInput {
    rackId: ID
    warehouseId: ID
    rackRow: String
    rackColumn: String
    rackLevel: String
    binCode: String
    binType: String
    isActive: Boolean
    """Partial match on rack row/level/column, bin code, or row-level-column label."""
    search: String
  }

  """
  Input for creating a new Rack
  """
  input CreateRackInput {
    warehouseId: ID
    zoneId: ID
    areaId: ID
    rackRow: String!
    rackColumn: String!
    rackLevel: String!
    binCode: String
    barCode: String
    binType: String
    length: String
    width: String
    height: String
    weight: String
    maxPallet: String
    isActive: Boolean
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Rack
  """
  input UpdateRackInput {
    warehouseId: ID
    zoneId: ID
    areaId: ID
    rackRow: String
    rackColumn: String
    rackLevel: String
    binCode: String
    barCode: String
    binType: String
    length: String
    width: String
    height: String
    weight: String
    maxPallet: String
    isActive: Boolean
    updatedBy: String!
  }

  extend type Query {
    """
    Get racks with optional filtering and pagination.
    Requires authentication.
    """
    racks(filter: RackFilterInput, sort: RackSortInput, pageSize: Int, pageNumber: Int): RackPaginatedResponse! @auth
    
    """
    Get a single rack by ID.
    Requires authentication.
    """
    rack(id: ID!): Rack @auth

    """
    Get aggregated volume/weight capacity and current usage for all racks
    in the caller's organization.
    Requires authentication.
    """
    rackUtilization: [RackUtilization!]! @auth
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
