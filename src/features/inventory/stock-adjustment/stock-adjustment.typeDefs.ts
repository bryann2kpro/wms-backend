/**
 * Stock Adjustment GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Stock Adjustment operations.
 * Resolvers are in stock-adjustment.resolver.ts
 */

export const typeDefs = `#graphql
    """
    Stock Adjustment - Manual inventory correction record.
    Each adjustment can contain multiple line items; the same SKU may appear
    more than once with different lot numbers or expiry dates.
    Adjustments are applied immediately on creation.
    """
    type StockAdjustment {
        id: ID!
        adjustmentNo: String!
        reason: String
        notes: String
        createdAt: String!
        updatedAt: String!
        createdByUser: StockAdjustmentAuditUser
        items: [StockAdjustmentItem!]!
    }

    """
    User info for stock adjustment audit fields.
    """
    type StockAdjustmentAuditUser {
        id: ID!
        displayName: String!
    }

    """
    Stock Adjustment line item - a single SKU adjustment within a stock adjustment.
    """
    type StockAdjustmentItem {
        id: ID!
        stockAdjustmentId: ID!
        skuId: ID!
        skuCode: String
        skuDescription: String
        """Bin location for this line (WMS capture)."""
        rackId: ID
        rack: Rack
        """Lot / batch number for this line (optional)."""
        lotNo: String
        """Expiry date for this lot line (ISO 8601), optional."""
        expiryDate: String
        movementType: String!
        quantity: String!
        remarks: String
        createdAt: String!
    }

    input CreateStockAdjustmentItemInput {
        skuId: ID!
        """Rack bin where this adjustment applies."""
        rackId: ID!
        """Lot / batch number (optional). Same SKU may repeat with different lots."""
        lotNo: String
        """Expiry date ISO 8601 (optional)."""
        expiryDate: String
        """ADJUSTMENT or DAMAGED"""
        movementType: String!
        """Positive or negative for ADJUSTMENT; always positive for DAMAGED"""
        quantity: String!
        remarks: String
    }

    input CreateStockAdjustmentInput {
        reason: String
        notes: String
        items: [CreateStockAdjustmentItemInput!]!
    }

    input StockAdjustmentFilterInput {
        id: ID
        adjustmentNo: String
        """Search across adjustment number (case-insensitive)."""
        search: String
        """Sort field: ADJUSTMENT_NO, CREATED_AT, UPDATED_AT. Default: CREATED_AT"""
        sortBy: String
        """Sort direction: ASC or DESC. Default: DESC"""
        sortOrder: String
    }

    type StockAdjustmentPaginatedResponse {
        query: [StockAdjustment!]!
        pagination: Pagination!
    }

    extend type Query {
        """
        List stock adjustments with optional filtering and pagination.
        Requires authentication.
        """
        stockAdjustments(filter: StockAdjustmentFilterInput, pageSize: Int, pageNumber: Int): StockAdjustmentPaginatedResponse @auth
    }

    extend type Mutation {
        """
        Create a stock adjustment with line items.
        Immediately creates inventory movements and updates inventory balances.
        Requires authentication.
        """
        createStockAdjustment(input: CreateStockAdjustmentInput!): StockAdjustment! @auth
    }
`;
