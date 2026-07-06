/**
 * Stock Quant GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for stock quant rows (SKU quantity per rack).
 * Resolvers should map to stock-quant.repository.ts.
 */

export const typeDefs = `#graphql
  """
  Stock Quant - quantity of a SKU stored in a specific rack.
  """
  type StockQuant {
    id: ID!
    skuId: ID!
    skuCode: String
    """SKU stock unit code (e.g. CTN, PCS) from master UOM."""
    stockUnitCode: String
    description: String
    quantity: String!
    reservedQty: String!
    """Loose units stored on this quant row."""
    lossQty: String!
    rackId: ID!
    rackLabel: String
    """Bin type of the rack this quant is stored on (e.g. LOOSE_STORAGE, FIXED, PALLET_STORAGE). Lets the UI distinguish loose stock from carton/pallet stock."""
    rackBinType: String
    lotNo: String
    expiryDate: String
    organizationId: ID!
    createdAt: String!
    updatedAt: String!
    createdBy: ID!
    updatedBy: ID
  }

  """
  Paginated Stock Quant response
  """
  type StockQuantPaginatedResponse {
    query: [StockQuant!]!
    pagination: Pagination!
    """Sum of quantity across all rows matching the current filter (not just the current page)."""
    totalQuantity: String!
  }

  """
  Input for filtering stock quants
  """
  input StockQuantFilterInput {
    id: ID
    skuId: ID
    skuIds: [ID!]
    skuCode: String
    rackId: ID
    rackIds: [ID!]
    rackLabel: String
  }

  """
  Input for creating a stock quant row
  """
  input CreateStockQuantInput {
    skuId: ID!
    description: String
    quantity: String!
    rackId: ID!
  }

  """
  Input for updating a stock quant row
  """
  input UpdateStockQuantInput {
    description: String
    quantity: String
    """Loose units on this quant row."""
    lossQty: String
    rackId: ID
  }

  extend type Query {
    """
    Get stock quants with optional filtering and pagination.
    """
    stockQuants(
      filter: StockQuantFilterInput
      pageSize: Int
      pageNumber: Int
    ): StockQuantPaginatedResponse

    """
    Get a single stock quant by ID.
    """
    stockQuant(id: ID!): StockQuant
  }

  """
  One row from the warehouse stock balance Excel file.
  """
  input StockBalanceSyncRowInput {
    "Storage bin code, e.g. I1-L2-04 (must match a rack row-level-column label)"
    binCode: String!
    "Item code, e.g. RAW-E0013"
    skuCode: String!
    "Expiry date (ISO string) or null when the file has no expiry"
    expiryDate: String
    "Unit quantity in this bin"
    qty: Float!
    description: String
  }

  type StockBalanceSyncSkippedRow {
    binCode: String!
    skuCode: String!
    reason: String!
  }

  type StockBalanceSyncResult {
    "stock_quant rows whose quantity was updated"
    updated: Int!
    "New stock_quant rows created"
    inserted: Int!
    "Existing stock_quant rows zeroed because they are not in the file"
    zeroed: Int!
    "inventory_balances rows updated"
    balancesUpdated: Int!
    "Open DO picklist items reassigned to a batch that still covers them"
    reassignedDoItems: Int!
    skipped: [StockBalanceSyncSkippedRow!]!
  }

  extend type Mutation {
    """
    Create a stock quant row.
    """
    createStockQuant(input: CreateStockQuantInput!): StockQuant!

    """
    Sync warehouse stock balance from the daily Excel file. FULL REPLACE:
    the file is the source of truth. Upserts stock_quant (qty per rack per
    expiry batch), zeroes all batches and balances missing from the file
    (including SKUs the file does not mention), sets inventory_balances
    on-hand totals, logs ADJUSTMENT movements, and re-validates open DO
    picklist batch assignments.
    """
    syncStockBalance(rows: [StockBalanceSyncRowInput!]!): StockBalanceSyncResult!

    """
    Update a stock quant row.
    """
    updateStockQuant(id: ID!, input: UpdateStockQuantInput!): StockQuant

    """
    Delete a stock quant row.
    """
    deleteStockQuant(id: ID!): Boolean!
  }
`;
