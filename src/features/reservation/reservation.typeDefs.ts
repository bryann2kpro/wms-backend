export const typeDefs = `#graphql
  """
  A stock reservation holds qty against a SKU for a specific customer
  during a time window, reducing available-to-promise.
  """
  type StockReservation {
    id: ID!
    organizationId: ID!
    reservationNo: String!
    customerCode: String!
    skuId: ID!
    """
    When set, the reservation is pinned to a specific GRN batch (lot/expiry).
    Null means any batch of the SKU is eligible to satisfy this hold.
    """
    grnItemId: ID
    inventoryBalanceId: ID!
    qtyReserved: String!
    qtyConsumed: String!
    reserveStart: String!
    reserveEnd: String!
    """
    When true, flagged batches are consumed first (overrides FIFO/LIFO/FEFO).
    """
    priorityFlag: Boolean!
    """
    ACTIVE | CONSUMED | EXPIRED | CANCELLED | RELEASED
    """
    status: String!
    sourceType: String
    sourceId: String
    notes: String
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String
  }

  """
  Tenant-wide ranked customer list used by the allocation engine.
  Lower rank = higher priority (1 is highest).
  """
  type CustomerPriority {
    id: ID!
    organizationId: ID!
    customerCode: String!
    customerName: String
    rank: Int!
    isActive: Boolean!
    notes: String
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String
  }

  # ─── Inputs ────────────────────────────────────────────────────────────────

  input CreateReservationInput {
    "Customer code matching customer_priority.customer_code (e.g. ES, LH, UAB)"
    customerCode: String!
    skuId: ID!
    "Pin to a specific GRN batch (optional; omit for SKU-level hold)"
    grnItemId: ID
    "Quantity to hold. Must be > 0 and ≤ available ATP."
    qtyReserved: Float!
    "ISO-8601 datetime — start of the reserve window (inclusive)"
    reserveStart: String!
    "ISO-8601 datetime — end of the reserve window (exclusive)"
    reserveEnd: String!
    "Promote flagged batches ahead of normal picking order"
    priorityFlag: Boolean
    "Originating document type, e.g. PO / DO / MANUAL"
    sourceType: String
    "Originating document ID"
    sourceId: String
    notes: String
  }

  input UpdateReservationInput {
    "Adjust the held quantity. Must be ≥ qtyConsumed."
    qtyReserved: Float
    "Shift the reserve window start"
    reserveStart: String
    "Shift the reserve window end"
    reserveEnd: String
    priorityFlag: Boolean
    "Re-assign to a different customer code"
    customerCode: String
    "Change or clear the pinned GRN batch"
    grnItemId: ID
    notes: String
  }

  input StockReservationFilterInput {
    id: ID
    ids: [ID!]
    reservationNo: String
    customerCode: String
    customerCodes: [String!]
    skuId: ID
    skuIds: [ID!]
    grnItemId: ID
    grnItemIds: [ID!]
    status: String
    statuses: [String!]
  }

  input UpsertCustomerPriorityInput {
    customerCode: String!
    customerName: String
    rank: Int
    isActive: Boolean
    notes: String
  }

  input CustomerPriorityRankInput {
    customerCode: String!
  }

  type StockReservationPaginatedResponse {
    query: [StockReservation!]!
    pagination: Pagination!
  }

  # ─── Queries ───────────────────────────────────────────────────────────────

  extend type Query {
    """
    Fetch a single reservation by internal UUID.
    """
    reservation(id: ID!): StockReservation

    """
    List reservations with optional filters (status, customer, SKU) and pagination.
    """
    reservations(
      filter: StockReservationFilterInput
      pageSize: Int
      pageNumber: Int
    ): StockReservationPaginatedResponse!

    """
    Ranked customer priority list for the current organization (rank 1 = highest).
    """
    customerPriorities: [CustomerPriority!]!
  }

  # ─── Mutations ─────────────────────────────────────────────────────────────

  extend type Mutation {
    """
    Reserve stock for a customer.
    Validates that qtyReserved ≤ (onHandQty − reservedQty) on inventory_balances,
    creates the reservation row, and atomically bumps reservedQty on the balance.
    """
    createReservation(input: CreateReservationInput!): StockReservation!

    """
    Update an ACTIVE reservation's quantity or time window.
    Increasing qty validates headroom; decreasing releases the delta back to ATP.
    """
    updateReservation(id: ID!, input: UpdateReservationInput!): StockReservation!

    """
    Cancel a reservation and release unconsumed qty back to available-to-promise.
    Idempotent check: already-cancelled / released reservations return an error.
    """
    cancelReservation(id: ID!): StockReservation!

    """
    Create or update a customer priority row for the tenant.
    """
    upsertCustomerPriority(input: UpsertCustomerPriorityInput!): CustomerPriority!

    """
    Rewrite the full customer priority ordering atomically (ranks 1..n).
    Must include every existing customer code exactly once.
    """
    reorderCustomerPriorities(ranking: [CustomerPriorityRankInput!]!): [CustomerPriority!]!
  }
`;
