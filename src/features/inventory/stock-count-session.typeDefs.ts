export const typeDefs = `#graphql
  """
  A named stock count run. Creating a session captures a point-in-time
  snapshot of all SKU opening quantities vs current inventory balances.
  """
  type StockCountSession {
    id: ID!
    organizationId: ID!
    name: String!
    status: String!
    countDate: String!
    createdBy: ID!
    createdAt: String!
    closedBy: ID
    closedAt: String
    """ Total number of SKU lines in this session """
    itemCount: Int!
    """ Lines not yet approved """
    pendingCount: Int!
  }

  type StockCountSessionPaginatedResponse {
    query: [StockCountSession!]!
    pagination: Pagination!
  }

  """
  One SKU line within a stock count session.
  """
  type StockCountItem {
    id: ID!
    sessionId: ID!
    organizationId: ID!
    skuId: ID!
    skuCode: String!
    skuDescription: String!
    openingQty: Float!
    openingLossQty: Float!
    onHandQty: Float!
    onHandLossQty: Float!
    reservedQty: Float!
    qtyDifference: Float!
    lossQtyDifference: Float!
    countedQty: Float
    countedLossQty: Float
    action: String
    notes: String
    imageUrl: String
    isApproved: Boolean!
    approvedBy: ID
    approvedAt: String
    createdAt: String!
    updatedAt: String!
  }

  type StockCountItemPaginatedResponse {
    query: [StockCountItem!]!
    pagination: Pagination!
  }

  input UpdateStockCountItemInput {
    action: String
    countedQty: Float
    countedLossQty: Float
    notes: String
    imageUrl: String
    isApproved: Boolean
  }

  extend type Query {
    """ List all stock count sessions for the current org """
    stockCountSessions(pageSize: Int, pageNumber: Int): StockCountSessionPaginatedResponse

    """ Fetch a single session header """
    stockCountSession(id: ID!): StockCountSession

    """ Paginated items for a session with optional search """
    stockCountSessionItems(
      sessionId: ID!
      search: String
      pageSize: Int
      pageNumber: Int
    ): StockCountItemPaginatedResponse
  }

  extend type Mutation {
    """ Create a new session and snapshot current inventory """
    createStockCountSession(name: String!): StockCountSession

    """ Update a single item's action / counted quantities / approval """
    updateStockCountItem(id: ID!, input: UpdateStockCountItemInput!): StockCountItem

    """ Close a session (set status = closed) """
    closeStockCountSession(id: ID!): StockCountSession

    """ Bulk-approve all ready items in a session (items with action set or zero diff). Returns count of newly approved items. """
    bulkApproveStockCountItems(sessionId: ID!): Int!
  }
`;
