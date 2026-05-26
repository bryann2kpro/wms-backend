export const typeDefs = `#graphql
  enum ZonePurpose {
    GENERAL
    WET
    DRY
    AMBIENT
    DAMAGED
  }

  type Zone {
    zoneId: ID!
    warehouseId: ID!
    zoneCode: String!
    zoneName: String!
    purpose: ZonePurpose!
    warehouseName: String
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type ZonePaginatedResponse {
    query: [Zone!]!
    pagination: Pagination!
  }

  input ZoneFilterInput {
    zoneId: ID
    warehouseId: ID
    purpose: ZonePurpose
  }

  input CreateZoneInput {
    warehouseId: ID!
    zoneCode: String!
    zoneName: String!
    purpose: ZonePurpose
    createdBy: String!
    updatedBy: String!
  }

  input UpdateZoneInput {
    zoneCode: String
    zoneName: String
    purpose: ZonePurpose
    updatedBy: String!
  }

  extend type Query {
    zones(filter: ZoneFilterInput, pageSize: Int, pageNumber: Int): ZonePaginatedResponse! @auth
    zone(id: ID!): Zone @auth
  }

  extend type Mutation {
    createZone(input: CreateZoneInput!): Zone! @auth
    updateZone(id: ID!, input: UpdateZoneInput!): Zone @auth
    deleteZone(id: ID!): Boolean! @auth
  }
`;
