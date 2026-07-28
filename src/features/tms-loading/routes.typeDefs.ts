/**
 * Routes GraphQL Type Definitions
 *
 * @description Named delivery routes — mirrors TMS's own Routing page shape
 * (which has no real backend behind it in TMS itself; this is a working
 * from-scratch implementation of the same idea).
 */

export const typeDefs = `#graphql
  type TmsRoute {
    id: ID!
    name: String!
    origin: String!
    destination: String!
    distanceKm: String!
    estimatedDurationMins: String!
    status: String!
    createdAt: String!
    updatedAt: String!
  }

  input CreateTmsRouteInput {
    name: String!
    origin: String!
    destination: String!
    distanceKm: String!
    estimatedDurationMins: String!
    status: String
  }

  input UpdateTmsRouteInput {
    name: String
    origin: String
    destination: String
    distanceKm: String
    estimatedDurationMins: String
    status: String
  }

  extend type Query {
    """List defined routes. Requires authentication."""
    tmsRoutes: [TmsRoute!]! @auth
  }

  extend type Mutation {
    """Create a named delivery route."""
    createTmsRoute(input: CreateTmsRouteInput!): TmsRoute! @auth

    """Update a named delivery route."""
    updateTmsRoute(id: ID!, input: UpdateTmsRouteInput!): TmsRoute @auth

    """Delete a named delivery route."""
    deleteTmsRoute(id: ID!): Boolean! @auth
  }
`;
