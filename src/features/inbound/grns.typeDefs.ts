/**
 * GRN GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for GRN (Goods Received Note) operations.
 * Resolvers are in grns.resolvers.ts
 */

export const typeDefs = `#graphql
    """
    Goods Received Note - Document issued by SME and sent to NetSuite after receiving goods from a supplier.
    """
    type Grn {
        id: ID!
        grnNo: String!
        supplierId: ID!
        supplierDeliveryId: ID
        supplierDeliveryNo: String
        poNo: String
        status: String!
        receivedAt: String
        approvedBy: ID
        approvedAt: String
        notes: String
        proofUrl: String
        warehouse: Warehouse
        nsError: String
        nsSentAt: String
        createdAt: String!
        updatedAt: String!
        createdByUser: GrnAuditUser
        updatedByUser: GrnAuditUser
        items: [GrnItem!]!
    }

    """
    User info for GRN audit fields (createdBy / updatedBy).
    """
    type GrnAuditUser {
        id: ID!
        displayName: String!
    }

    """
    GRN line item - a single SKU received as part of a GRN.
    """
    type GrnItem {
        id: ID!
        grnId: ID!
        skuId: ID!
        skuCode: String
        skuDescription: String
        qty: String!
        lossQty: String!
        remarks: String
        """Primary rack (first rackId if multiple are provided)."""
        rack: Rack
        """All rack IDs associated with this GRN item."""
        rackIds: [ID!]
        """Optional expiry date for this GRN item."""
        expiryDate: String
        """Lot number assigned by supplier/manufacturer to identify this production batch."""
        lotNo: String
        createdAt: String!
        updatedAt: String!
        createdBy: ID!
        updatedBy: ID
    }

    """
    Line item input when creating a GRN.
    Provide skuId to use an existing SKU; if it does not exist and skuCode, skuDescription, skuUom are provided, a new SKU is created.
    """
    input CreateGrnItemInput {
        skuId: ID
        qty: String!
        lossQty: String
        remarks: String
        """Deprecated: use rackIds instead."""
        rackId: ID
        """All rack IDs associated with this GRN item."""
        rackIds: [ID!]
        """Optional expiry date for this GRN item."""
        expiryDate: String
        """Lot number assigned by supplier/manufacturer to identify this production batch."""
        lotNo: String
        skuCode: String
        skuDescription: String
        skuUom: ID
    }

    """
    Input for creating a new GRN (with optional line items)
    """
    input CreateGrnInput {
        grnNo: String!
        supplierId: ID
        supplierDeliveryId: ID
        supplierDeliveryNo: String
        poNo: String
        receivedAt: String
        notes: String
        proofUrl: String
        warehouseId: ID
        status: String
        createdBy: String
        updatedBy: String
        items: [CreateGrnItemInput!]
    }

    """
    Input for updating an existing GRN.
    supplierDeliveryNo and items are accepted for form compatibility; only metadata fields are persisted on update.
    """
    input UpdateGrnInput {
        grnNo: String
        supplierId: ID
        supplierDeliveryId: ID
        supplierDeliveryNo: String
        poNo: String
        receivedAt: String
        notes: String
        proofUrl: String
        warehouseId: ID
        status: String
        approvedBy: ID
        approvedAt: String
        updatedBy: ID
        items: [CreateGrnItemInput!]
    }

    """
    Advance Shipping Notice received from NetSuite before goods arrive.
    Pending notices (not yet linked to a GRN) are shown in the Create GRN dropdown.
    """
    type AdvanceNotice {
        id: ID!
        tranid: String!
        entity: String!
        duedate: String!
        receivedAt: String!
        lines: [AdvanceNoticeLine!]!
    }

    """
    A single line item within an Advance Shipping Notice.
    """
    type AdvanceNoticeLine {
        lineuniquekey: Int!
        itemid: String!
        displayname: String
        quantity: Float!
        units: String!
        custrecord_r2o_order_code: String
        """NetSuite flag: T when the item is lot-tracked."""
        islotitem: String
        """First lot serial from ASN lots[0], for GRN prefill when lot-tracked."""
        lotNo: String
        """First lot expiry from ASN lots[0] (YYYY-MM-DD when provided)."""
        expiryDate: String
    }

    extend type Query {
        grns(filter: GrnFilterInput, pageSize: Int, pageNumber: Int): GrnPaginatedResponse
    }

    extend type Query {
        """
        List advance notices from NetSuite that have not yet been linked to a GRN.
        Used to populate the ASN dropdown when creating a new GRN.
        """
        listPendingAdvanceNotices: [AdvanceNotice!]! @auth
    }

    input GrnFilterInput {
        id: ID
        grnNo: String
        """Search across GRN number, PO reference, and Supplier DO (case-insensitive)."""
        search: String
        """When true and status is not set, omit draft GRNs from results (Draft / DRAFT)."""
        excludeDraft: Boolean
        status: String
        page: Int
        pageSize: Int
        pageNumber: Int
        """Sort field: GRN_NO, UPDATED_AT, CREATED_AT, STATUS, RECEIVED_AT. Default: UPDATED_AT"""
        sortBy: String
        """Sort direction: ASC or DESC. Default: DESC (latest first)"""
        sortOrder: String
    }

    extend type Query {
        """
        Get the next GRN number for a given date. If date is omitted, the server's current date is used.
        The format is GRN-YYYYMMDD-0001 and increments within the same day.
        """
        nextGrnNumber(date: String): String!
    }

    type GrnPaginatedResponse {
        query: [Grn!]!
        pagination: Pagination!
    }

    """
    Input for createInbound (same as createGrn flow; userId required; optional inboundQty + skuId to update SKU quantity).
    """
    input CreateInboundInput {
        userId: String!
        grnNo: String!
        supplierId: ID
        supplierDeliveryId: ID
        supplierDeliveryNo: String
        poNo: String
        receivedAt: String
        notes: String
        proofUrl: String
        warehouseId: ID
        status: String
        items: [CreateGrnItemInput!]
        inboundQty: Float
        skuId: ID
        """ID of the advance notice this GRN was created from. Optional — omit for manual GRNs."""
        advanceNoticeId: ID
    }

    extend type Mutation {  
        """
        Create a new GRN.
        Requires authentication.
        """
        createGrn(input: CreateGrnInput!): Grn! @auth

        """
        Create inbound (GRN + items). Same process as createGrn; use userId. Optional inboundQty + skuId to update SKU quantity.
        Requires authentication.
        """
        createInbound(input: CreateInboundInput!): Boolean! @auth

        """
        Update an existing GRN.
        Requires authentication.
        """
        updateGrn(id: ID!, input: UpdateGrnInput!): Grn @auth

        """
        Delete a GRN by ID.
        Requires authentication.
        """
        deleteGrn(id: ID!): Boolean! @auth

        """
        Manually trigger putaway bin assignment for all items in a GRN.
        Looks up each SKU's FIXED_BIN pick face strategy and sets grn_items.rackId.
        Returns count of items updated.
        """
        assignPutawayBins(grnId: ID!): Int! @auth
    }
`
