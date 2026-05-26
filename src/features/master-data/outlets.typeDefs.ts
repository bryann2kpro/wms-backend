/**
 * Outlets GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Outlet operations.
 * Resolvers are in outlets.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Outlet - represents a store/outlet location
  """
  type Outlet {
    outletId: ID!
    outletName: String!
    outletCode: String!
    address: String
    chain: String
    channel: String
    debtor: String
    regionId: ID
    """
    Flattened region name (from JOIN). For full region object, use 'region' field.
    """
    regionName: String
    """
    Flattened region code (from JOIN). For full region object, use 'region' field.
    """
    regionCode: String
    """
    Full region object. Resolved via DataLoader to avoid N+1.
    """
    region: Region
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  """
  Paginated Outlet response
  """
  type OutletPaginatedResponse {
    query: [Outlet!]!
    pagination: Pagination!
  }

  """
  Input for filtering outlets
  """
  input OutletFilterInput {
    outletId: ID
    outletIds: [ID!]
    outletCode: String
    outletCodes: [String!]
    outletName: String
    regionId: ID
    regionIds: [ID!]
    unassignedOnly: Boolean
  }

  """
  Input for creating a new Outlet
  """
  input CreateOutletInput {
    outletName: String!
    outletCode: String!
    address: String
    chain: String
    channel: String
    debtor: String
    regionId: ID
    createdBy: String!
    updatedBy: String!
  }

  """
  Input for updating an existing Outlet
  """
  input UpdateOutletInput {
    outletName: String
    outletCode: String
    address: String
    chain: String
    channel: String
    debtor: String
    regionId: ID
    updatedBy: String!
  }

  extend type Query {
    """
    Get outlets with optional filtering and pagination.
    Requires authentication.
    """
    outlets(filter: OutletFilterInput, pageSize: Int, pageNumber: Int): OutletPaginatedResponse! @auth
    
    """
    Get a single outlet by ID.
    Requires authentication.
    """
    outlet(id: ID!): Outlet @auth
  }

  extend type Mutation {
    """
    Create a new outlet.
    Requires authentication.
    """
    createOutlet(input: CreateOutletInput!): Outlet! @auth
    
    """
    Update an existing outlet.
    Requires authentication.
    """
    updateOutlet(id: ID!, input: UpdateOutletInput!): Outlet @auth

    """
    Assign an outlet to a region.
    Requires authentication.
    """
    assignOutletToRegion(outletId: ID!, regionId: ID, updatedBy: String!): Outlet @auth

    """
    Bulk assign outlets to a region.
    Requires authentication.
    """
    bulkAssignOutletsToRegion(outletIds: [ID!]!, regionId: ID, updatedBy: String!): [Outlet!]! @auth

    """
    Delete an outlet.
    Requires authentication.
    """
    deleteOutlet(id: ID!): Boolean! @auth
  }
`;
