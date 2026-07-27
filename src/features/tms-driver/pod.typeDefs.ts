/**
 * POD (Proof of Delivery) GraphQL Type Definitions
 *
 * @description uploadPod mirrors TMS's exact existing contract (arg names,
 * return type) since tmsmobile's GraphQL operations are fixed. podRecords is
 * a WMS-only addition for the admin web UI to review submitted PODs.
 */

export const typeDefs = `#graphql
  type PodRecord {
    id: ID!
    doId: ID!
    doNo: String!
    outletName: String!
    driverId: ID
    driverName: String
    photoUrl: String!
    capturedAt: String!
    lat: String
    lng: String
    createdAt: String!
  }

  extend type Query {
    """List submitted POD records, optionally filtered by delivery order. Requires authentication."""
    podRecords(doId: ID): [PodRecord!]! @auth
  }

  extend type Mutation {
    """Submit a proof-of-delivery record. Callable by an admin, or an authenticated driver token."""
    uploadPod(
      doId: ID!
      doNo: String!
      outletName: String!
      photoUrl: String!
      driverId: ID
      lat: Float
      lng: Float
    ): Boolean!
  }
`;
