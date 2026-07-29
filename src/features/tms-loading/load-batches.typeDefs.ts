/**
 * Load Batches GraphQL Type Definitions
 *
 * @description Mirrors TMS's loading-pipeline API shape (query/mutation names)
 * where practical, minus the priority-tier grouping and paid Google Routes
 * traffic-ETA call, which were intentionally scoped out for v1.
 */

export const typeDefs = `#graphql
  type LoadBatchStop {
    doId: ID!
    doNo: String!
    outletId: ID
    outletName: String
    outletCode: String
    outletAddress: String
    """Not tracked in WMS — always null. Kept for tmsmobile query-shape compatibility."""
    outletPhone: String
    stagingBin: String
    loadOrder: Int
    loadedAt: String
    lat: Float
    lng: Float
    """Not tracked in WMS (priority tiers intentionally out of scope) — always null. Kept for tmsmobile query-shape compatibility."""
    priority: String
    """Alias for stagingBin — tmsmobile's own field name for this concept."""
    zone: String
    """Not wired up in WMS yet — always null. Kept for tmsmobile query-shape compatibility."""
    podUrl: String
  }

  type WarehouseCoords {
    lat: Float!
    lng: Float!
  }

  type LoadBatch {
    id: ID!
    date: String!
    regionId: ID!
    regionName: String
    regionCode: String
    """Alias for regionCode — tmsmobile's own field name for this concept."""
    zone: String
    status: String!
    assignedAt: String
    createdAt: String!
    """Not computed in WMS yet — always null. Kept for tmsmobile query-shape compatibility."""
    legDurationsSeconds: [Int!]
    driver: Driver
    stops: [LoadBatchStop!]!
  }

  extend type Query {
    """List load batches, optionally filtered by date (YYYY-MM-DD). Requires authentication."""
    loadBatches(date: String): [LoadBatch!]! @auth

    """The warehouse depot's geocoded coordinates, for rendering routes on a map."""
    warehouseCoords: WarehouseCoords @auth
  }

  extend type Mutation {
    """Assign a specific driver to a batch — computes route order via geocoding + nearest-neighbour/3-opt."""
    assignBatchDriver(batchId: ID!, driverId: ID!): LoadBatch! @auth

    """Assign the first available clocked-in driver to a batch."""
    autoAssignBatchDriver(batchId: ID!): LoadBatch @auth

    """Remove the driver from a batch, reverting it to PENDING_DRIVER."""
    unassignBatchDriver(batchId: ID!): LoadBatch! @auth

    """Mark a single DO as physically loaded (or not) onto the vehicle."""
    markBatchItemLoaded(doId: ID!, loaded: Boolean!): Boolean! @auth

    """Bulk-confirm which DOs in a batch were loaded."""
    confirmBatchLoading(batchId: ID!, loadedDoIds: [ID!]!): Boolean! @auth

    """Mark a batch as fully DONE (vehicle departed)."""
    completeBatch(batchId: ID!): Boolean! @auth

    """Undo a batch back to PENDING_DRIVER — clears driver and load confirmations."""
    undoLoadBatch(batchId: ID!): Boolean! @auth
  }
`;
