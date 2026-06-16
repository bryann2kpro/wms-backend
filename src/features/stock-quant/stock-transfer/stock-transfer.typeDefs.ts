/**
 * Stock Transfer GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Stock Transfer operations
 * (bin-to-bin and warehouse-to-warehouse). Resolvers are in
 * stock-transfer.resolvers.ts.
 */

export const typeDefs = `#graphql
    """
    Stock transfer type.
    - BIN_TO_BIN: source and destination racks resolve to the same warehouse
      (or both unzoned). Completes instantly.
    - WAREHOUSE_TO_WAREHOUSE: source and destination resolve to different
      warehouses. Models in-transit state (debit source on dispatch, credit
      destination on receive).
    """
    enum StockTransferType {
        BIN_TO_BIN
        WAREHOUSE_TO_WAREHOUSE
    }

    """
    Stock transfer status.
    - IN_TRANSIT: W2W dispatched, awaiting receive (source already debited).
    - COMPLETED: terminal. B2B is created directly as COMPLETED; W2W reaches it on receive.
    - CANCELLED: terminal. Only reachable from IN_TRANSIT (W2W); source is re-credited.
    """
    enum StockTransferStatus {
        IN_TRANSIT
        COMPLETED
        CANCELLED
    }

    """
    Stock Transfer - Document header for a bin-to-bin or warehouse-to-warehouse
    stock move. Each transfer can contain multiple line items.
    """
    type StockTransfer {
        id: ID!
        organizationId: ID!
        transferNo: String!
        type: StockTransferType!
        status: StockTransferStatus!
        """Derived source warehouse for the racks on this transfer (null when unzoned)."""
        sourceWarehouseId: ID
        """Derived destination warehouse for the racks on this transfer (null when unzoned)."""
        destinationWarehouseId: ID
        remarks: String
        dispatchedAt: String
        receivedAt: String
        receivedBy: ID
        cancelledAt: String
        cancelledBy: ID
        cancelReason: String
        createdAt: String!
        updatedAt: String!
        createdBy: ID!
        updatedBy: ID
        createdByUser: StockTransferAuditUser
        items: [StockTransferItem!]!
    }

    """
    User info for stock transfer audit fields.
    """
    type StockTransferAuditUser {
        id: ID!
        displayName: String!
    }

    """
    Stock Transfer line item - a single SKU+lot+expiry move from a source rack
    to a destination rack.
    """
    type StockTransferItem {
        id: ID!
        stockTransferId: ID!
        skuId: ID!
        skuCode: String
        skuDescription: String
        """Lot / batch number for this line (optional)."""
        lotNo: String
        """Expiry date for this lot line (ISO 8601), optional."""
        expiryDate: String
        quantity: String!
        """Source bin location for this line."""
        sourceRackId: ID!
        sourceRack: Rack
        """Destination bin location for this line."""
        destinationRackId: ID!
        destinationRack: Rack
        """Snapshot id of the source stock_quant row debited at create time."""
        sourceStockQuantId: ID!
        createdAt: String!
    }

    """
    A single line on a create-transfer request.
    """
    input CreateStockTransferLineInput {
        """Snapshot id of the source stock_quant row to debit."""
        sourceStockQuantId: ID!
        """Destination rack to credit (must differ from the source rack)."""
        destinationRackId: ID!
        """Quantity to move (numeric string)."""
        quantity: String!
    }

    input CreateStockTransferInput {
        remarks: String
        lines: [CreateStockTransferLineInput!]!
    }

    input StockTransferFilterInput {
        id: ID
        transferNo: String
        """BIN_TO_BIN or WAREHOUSE_TO_WAREHOUSE"""
        type: StockTransferType
        """IN_TRANSIT, COMPLETED or CANCELLED"""
        status: StockTransferStatus
        """Search across transfer number (case-insensitive)."""
        search: String
        """Sort field: TRANSFER_NO, CREATED_AT, UPDATED_AT. Default: CREATED_AT"""
        sortBy: String
        """Sort direction: ASC or DESC. Default: DESC"""
        sortOrder: String
    }

    type StockTransferPaginatedResponse {
        query: [StockTransfer!]!
        pagination: Pagination!
    }

    extend type Query {
        """
        List stock transfers with optional filtering and pagination.
        Requires authentication.
        """
        stockTransfers(filter: StockTransferFilterInput, pageSize: Int, pageNumber: Int): StockTransferPaginatedResponse @auth
        """
        Fetch a single stock transfer by id (with line items).
        Requires authentication.
        """
        stockTransfer(id: ID!): StockTransfer @auth
    }

    extend type Mutation {
        """
        Create and execute a stock transfer. B2B completes instantly; W2W is
        dispatched IN_TRANSIT (source debited, destination credited on receive).
        Requires authentication.
        """
        createStockTransfer(input: CreateStockTransferInput!): StockTransfer! @auth
        """
        Receive an in-transit (W2W) transfer: credit the destination racks and
        complete the document. Requires authentication.
        """
        receiveStockTransfer(id: ID!): StockTransfer! @auth
        """
        Cancel an in-transit (W2W) transfer: re-credit the source racks and mark
        the document CANCELLED. Requires authentication.
        """
        cancelStockTransfer(id: ID!, reason: String!): StockTransfer! @auth
    }
`;
