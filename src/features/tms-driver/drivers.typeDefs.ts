/**
 * Drivers GraphQL Type Definitions
 *
 * @description Driver roster synced from TMS, plus a lightweight driver-auth
 * surface (driverLogin) intended for the tmsmobile app to call directly.
 * Resolvers are in drivers.resolvers.ts
 */

export const typeDefs = `#graphql
  type Driver {
    id: ID!
    name: String!
    phone: String!
    licenseNumber: String!
    licenseExpiry: String!
    status: String!
    plateNumber: String
    vehicleType: String
    fleetCategory: String
    barcode: String
    clockedInAt: String
    email: String
    btm: String
    bdm: String
    payload: String
    length: String
    width: String
    height: String
    pallet4x3: String
    createdAt: String!
    updatedAt: String!
  }

  type DriverPaginatedResponse {
    query: [Driver!]!
    pagination: Pagination!
  }

  type DriverAuthPayload {
    accessToken: String!
    driver: Driver!
  }

  input DriverFilterInput {
    id: ID
    name: String
    status: String
  }

  input CreateDriverInput {
    name: String!
    phone: String!
    licenseNumber: String!
    licenseExpiry: String!
    status: String
    plateNumber: String
    vehicleType: String
    fleetCategory: String
    barcode: String
    email: String
    btm: String
    bdm: String
    payload: String
    length: String
    width: String
    height: String
    pallet4x3: String
  }

  input UpdateDriverInput {
    name: String
    phone: String
    licenseNumber: String
    licenseExpiry: String
    status: String
    plateNumber: String
    vehicleType: String
    fleetCategory: String
    barcode: String
    email: String
    btm: String
    bdm: String
    payload: String
    length: String
    width: String
    height: String
    pallet4x3: String
  }

  extend type Query {
    """Get drivers with optional filtering and pagination. Requires authentication."""
    drivers(filter: DriverFilterInput, pageSize: Int, pageNumber: Int): DriverPaginatedResponse! @auth

    """Get a single driver by ID. Requires authentication."""
    driver(id: ID!): Driver @auth
  }

  extend type Mutation {
    """Create a new driver. Requires authentication."""
    createDriver(input: CreateDriverInput!): Driver! @auth

    """Update an existing driver. Requires authentication."""
    updateDriver(id: ID!, input: UpdateDriverInput!): Driver @auth

    """Delete a driver. Requires authentication."""
    deleteDriver(id: ID!): Boolean! @auth

    """Toggle a driver's clock in/out state. Requires authentication (either admin, or the driver's own token)."""
    setDriverClock(id: ID!, clockedIn: Boolean!): Driver!

    """Driver-app login (email + password) — issues a driver-scoped token for tmsmobile."""
    driverLogin(email: String!, password: String!): DriverAuthPayload!
  }
`;
