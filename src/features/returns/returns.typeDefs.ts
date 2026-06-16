/**
 * Returns GraphQL Type Definitions
 *
 * @description GraphQL schema for Return Management (goods returned by ES
 * outlets at delivery time). Resolvers are in returns.resolvers.ts
 */

export const typeDefs = `#graphql
    """Reason a line was returned by the outlet."""
    enum ReturnReason {
        DAMAGED
        ABOUT_TO_EXPIRE
    }

    """Return document status: RECEIVED (driver captured) -> COMPLETED (all items put away)."""
    enum ReturnStatus {
        RECEIVED
        COMPLETED
    }

    """Return item status: PENDING (awaiting putaway) -> ASSIGNED (fully put away)."""
    enum ReturnItemStatus {
        PENDING
        ASSIGNED
    }

    """
    Return document - one per delivery order. Captured by the lorry driver at
    the outlet during proof-of-delivery (or afterwards via createReturn).
    Stock re-enters the books only when the warehouse keeper assigns items to racks.
    """
    type Return {
        id: ID!
        returnNo: String!
        doId: ID!
        doNo: String!
        purchaseOrderId: ID!
        poNo: String!
        status: String!
        receivedBy: ID
        receivedByUser: ReturnAuditUser
        receivedAt: String!
        completedAt: String
        notes: String
        createdAt: String!
        updatedAt: String!
        items: [ReturnItem!]!
    }

    """User info for return audit fields."""
    type ReturnAuditUser {
        id: ID!
        displayName: String!
    }

    """A single returned SKU line. Disposition is deterministic by reason."""
    type ReturnItem {
        id: ID!
        returnId: ID!
        doItemId: ID
        skuId: ID!
        skuCode: String
        skuDescription: String
        lotNo: String
        """ISO 8601 expiry of the returned lot (kept so FEFO re-picks it first)."""
        expiryDate: String
        qtyReturned: String!
        reason: String!
        conditionNotes: String
        status: String!
        """Quantity already put away (partial putaway accumulates here)."""
        qtyPutaway: String!
        assignedRackId: ID
        """Display label of the last assigned rack (row-level-column)."""
        assignedRackLabel: String
        assignedBy: ID
        assignedAt: String
        """Photos captured by the driver (documents with docType RETURN_PHOTO)."""
        photos: [ReturnPhoto!]!
        createdAt: String!
    }

    """Photo evidence attached to a return item."""
    type ReturnPhoto {
        id: ID!
        fileName: String!
        url: String
        mimeType: String!
        uploadedAt: String!
    }

    """Photo metadata for a file already uploaded via POST /v1/upload."""
    input ReturnPhotoInput {
        fileUrl: String!
        fileName: String!
        fileSizeBytes: Int!
        mimeType: String!
    }

    """One returned SKU line captured by the driver."""
    input ReturnLineInput {
        doItemId: ID
        skuId: ID!
        lotNo: String
        """ISO 8601 (optional)."""
        expiryDate: String
        qtyReturned: String!
        """DAMAGED or ABOUT_TO_EXPIRE"""
        reason: String!
        conditionNotes: String
        photos: [ReturnPhotoInput!]
    }

    input ReturnFilter {
        id: ID
        doId: ID
        status: String
        """Returns containing at least one item with this reason."""
        reason: String
        """Matches return number / DO number / PO number."""
        search: String
        receivedAtFrom: String
        receivedAtTo: String
    }

    type ReturnPaginatedResponse {
        query: [Return!]!
        pagination: Pagination!
    }

    """Aggregate counts for the Return Management page header."""
    type ReturnsStats {
        receivedCount: Int!
        completedCount: Int!
        pendingItemCount: Int!
        damagedItemCount: Int!
        aboutToExpireItemCount: Int!
    }

    extend type Query {
        """List return documents with filtering and pagination."""
        returns(filter: ReturnFilter, pageSize: Int, pageNumber: Int): ReturnPaginatedResponse @auth

        """Fetch a single return document with its items."""
        returnDoc(id: ID!): Return @auth

        """Aggregate counts for the Return Management page header."""
        returnsStats: ReturnsStats! @auth
    }

    extend type Mutation {
        """
        Capture a return for a DELIVERED delivery order (escape hatch when the
        return was not captured during proof-of-delivery). One return per DO.
        No stock is written - putaway happens via assignReturnItemToRack.
        """
        createReturn(doId: ID!, items: [ReturnLineInput!]!, notes: String): Return! @auth

        """
        Warehouse-keeper putaway for a return item. qty defaults to remaining.
        ABOUT_TO_EXPIRE: rack must NOT be in a DAMAGED zone; credits stock_quant
        and creates a RETURN_IN movement (onHand += qty).
        DAMAGED: rack MUST be in a DAMAGED zone; creates a RETURN_DAMAGED
        movement only (loss += qty), no stock_quant credit.
        """
        assignReturnItemToRack(returnItemId: ID!, rackId: ID!, qty: String): ReturnItem! @auth
    }
`;
