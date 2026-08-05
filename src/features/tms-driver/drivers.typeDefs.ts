/**
 * Drivers GraphQL Type Definitions
 *
 * @description Driver roster synced from TMS. This schema intentionally mirrors
 * TMS's own driver API shape exactly (field names, arg names, return types) —
 * the tmsmobile app's GraphQL operations are fixed/already deployed to real
 * drivers' phones, so WMS matches TMS's contract rather than the other way
 * around. Resolvers are in drivers.resolvers.ts
 */

export const typeDefs = `#graphql
  type Driver {
    id: ID!
    name: String!
    phone: String!
    """Null for WhatsApp self-registered drivers until an admin fills it in."""
    licenseNumber: String
    """Null for WhatsApp self-registered drivers until an admin fills it in."""
    licenseExpiry: String
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

  type DriverAuthPayload {
    accessToken: String!
    driver: Driver!
  }

  type DriverLocation {
    driverId: ID!
    lat: Float!
    lng: Float!
    capturedAt: String!
  }

  type DriverOtpVerifyResult {
    """True when this phone number has no driver record yet — client should prompt for a name and call completeDriverRegistration."""
    isNewDriver: Boolean!
    """Present only when isNewDriver is true. Proves the phone was OTP-verified; pass it to completeDriverRegistration."""
    registrationToken: String
    """Present only when isNewDriver is false — same as driverLogin's payload."""
    accessToken: String
    driver: Driver
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
    """Get drivers, optionally filtered by status (e.g. "ACTIVE"). Requires authentication."""
    drivers(status: String): [Driver!]! @auth

    """Get a single driver by ID. Requires authentication."""
    driver(id: ID!): Driver @auth

    """Known vehicle type names (e.g. "3-Ton Lorry") for the WhatsApp self-registration picker. Public — no auth required, since it's needed before a driver has a session."""
    vehicleTypes: [String!]!

    """A driver's most recent GPS ping, or null if none recorded yet (e.g. not clocked in today). Requires authentication."""
    driverLatestLocation(driverId: ID!): DriverLocation @auth

    """Full GPS ping history for a driver, oldest first, optionally bounded to one day (YYYY-MM-DD). Requires authentication."""
    driverLocationHistory(driverId: ID!, date: String): [DriverLocation!]! @auth
  }

  extend type Mutation {
    """Create a new driver. Requires authentication."""
    createDriver(input: CreateDriverInput!): Driver! @auth

    """Update an existing driver. Requires authentication."""
    updateDriver(id: ID!, input: UpdateDriverInput!): Driver @auth

    """Delete a driver. Requires authentication."""
    deleteDriver(id: ID!): Boolean! @auth

    """Toggle a driver's clock state. action is "IN" or "OUT". Callable by an admin, or the driver's own token."""
    setDriverClock(driverId: ID!, action: String!): Driver!

    """Set/reset a driver's password. Requires authentication (admin or the driver's own token)."""
    setDriverPassword(driverId: ID!, password: String!): Boolean!

    """Driver-app login (email + password) — issues a driver-scoped token for tmsmobile."""
    driverLogin(email: String!, password: String!): DriverAuthPayload!

    """Sends a 6-digit login code to the given phone over WhatsApp — works for phones with no driver record yet too (self-registration). Returns false if a code was already sent within the last minute (cooldown) or the send failed."""
    sendDriverOtp(phone: String!): Boolean!

    """Verifies a WhatsApp OTP code. If the phone already has a driver record, logs them in directly (like driverLogin). Otherwise returns isNewDriver: true with a registrationToken — call completeDriverRegistration next with a name to finish."""
    verifyDriverOtp(phone: String!, code: String!): DriverOtpVerifyResult!

    """Finishes WhatsApp self-registration for a phone verified by verifyDriverOtp — creates the driver record (auto-filling BTM/BDM/payload/dimensions/pallet4x3 from vehicleType) and issues a token, same shape as driverLogin."""
    completeDriverRegistration(registrationToken: String!, name: String!, plateNumber: String!, vehicleType: String!): DriverAuthPayload!

    """Records one raw GPS ping for the calling driver (device-native coordinates — no Google Geocoding/Directions API involved). Callable only with a driver-scoped token; records against that token's own driverId."""
    recordDriverLocation(lat: Float!, lng: Float!): Boolean! @auth
  }
`;
