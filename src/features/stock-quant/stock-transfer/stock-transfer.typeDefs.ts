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
    - DRAFT: saved, awaiting approval; no stock movement yet.
    - AWAITING_DISPATCH: W2W approved, awaiting source dispatch (no stock moved yet).
    - IN_TRANSIT: dispatched, awaiting receive (source debited). B2B on approve; W2W on dispatch.
    - COMPLETED: terminal. B2B and W2W reach this on receive.
    - CANCELLED: terminal. IN_TRANSIT cancel re-credits source; AWAITING_DISPATCH cancel is no-op.
    """
    enum StockTransferStatus {
        DRAFT
        AWAITING_DISPATCH
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
    """Loose (LOSS) units moved on this line."""
    lossQuantity: String!
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
        """Quantity to move (numeric string). May be \"0\" when moving loose only."""
        quantity: String!
        """Loose (LOSS) units to move (numeric string). Defaults to \"0\"."""
        lossQuantity: String
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
        """IN_TRANSIT, AWAITING_DISPATCH, COMPLETED, CANCELLED or DRAFT"""
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
        Save a stock transfer as draft. No stock is moved until approved.
        Requires authentication.
        """
        createStockTransfer(input: CreateStockTransferInput!): StockTransfer! @auth
        """
        Approve a draft transfer. B2B debits source and sets IN_TRANSIT.
        W2W sets AWAITING_DISPATCH with no stock movement (dispatch debits source).
        Requires authentication.
        """
        approveStockTransfer(id: ID!): StockTransfer! @auth
        """
        Dispatch a W2W transfer awaiting dispatch: debit source racks and set
        IN_TRANSIT. Requires authentication.
        """
        dispatchStockTransfer(id: ID!): StockTransfer! @auth
        """
        Reject a draft transfer without moving stock. Marks the document CANCELLED.
        Requires authentication.
        """
        rejectStockTransfer(id: ID!): StockTransfer! @auth
        """
        Receive an in-transit transfer: credit the destination racks and
        complete the document. Requires authentication.
        """
        receiveStockTransfer(id: ID!): StockTransfer! @auth
        """
        Cancel an in-transit or awaiting-dispatch transfer. IN_TRANSIT re-credits
        source racks; AWAITING_DISPATCH cancels without stock movement.
        Requires authentication.
        """
        cancelStockTransfer(id: ID!, reason: String!): StockTransfer! @auth
    }
`;
