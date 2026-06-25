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
        """
        Whether this GRN's PO/ASN is fully received yet. null = nothing to enforce
        (no linked ASN, or GRN isn't Approved yet — send button not relevant).
        true/false only computed once Approved, to gate the "Send to ES" action —
        a partially-received PO is guaranteed to be rejected by NetSuite.
        """
        endUserId: ID
        poFulfilled: Boolean
        """
        True when Send to ES must be hidden — no real ES ASN for this End User PO
        (synthetic/manual ASN or PO not ingested from NetSuite).
        """
        manualInbound: Boolean!
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
        """Rack designated for loose/loss items (LOOSE_STORAGE bin type)."""
        lossRackId: ID
        remarks: String
        """Primary rack (first rackId if multiple are provided)."""
        rack: Rack
        """All rack IDs associated with this GRN item."""
        rackIds: [ID!]
        """Per-rack carton allocations for this GRN item."""
        rackAllocations: [GrnRackAllocation!]
        """Per-rack loose/loss allocations for this GRN item's lossQty."""
        lossRackAllocations: [GrnLossRackAllocation!]
        """Optional expiry date for this GRN item."""
        expiryDate: String
        """Lot number assigned by supplier/manufacturer to identify this production batch."""
        lotNo: String
        """
        Snapshot of cartons still owed against the linked PO/ASN, taken when this GRN was
        submitted for approval. Null when not linked to a PO/ASN line.
        """
        remainingCtn: Float
        """Loose pieces still owed, alongside remainingCtn (see m_skus.loose_quantity)."""
        remainingLoosePcs: Float
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
        """Rack designated for loose/loss items (LOOSE_STORAGE bin type)."""
        lossRackId: ID
        remarks: String
        """Deprecated: use rackIds instead."""
        rackId: ID
        """All rack IDs associated with this GRN item."""
        rackIds: [ID!]
        """Per-rack carton allocations (preferred over rackIds when splitting putaway)."""
        rackAllocations: [GrnRackAllocationInput!]
        """Per-rack loose/loss allocations (preferred over lossRackId when splitting loose storage)."""
        lossRackAllocations: [GrnLossRackAllocationInput!]
        """Optional expiry date for this GRN item."""
        expiryDate: String
        """Lot number assigned by supplier/manufacturer to identify this production batch."""
        lotNo: String
        orderedQty: String
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
        endUserId: ID
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
        endUserId: ID
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
        """
        PENDING = no GRN created yet for this PO. PARTIAL = a GRN exists but quantities
        remain outstanding (more deliveries expected for this PO).
        """
        fulfillmentStatus: String!
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
        """GRN lines still owed against their PO/ASN (remainingCtn/remainingLoosePcs snapshot)."""
        grnRemainingReport: [GrnRemainingLine!]!
    }

    """One outstanding line on the Remaining Quantity report."""
    type GrnRemainingLine {
        grnId: ID!
        grnNo: String!
        poNo: String
        receivedAt: String
        supplierName: String
        endUserName: String
        skuCode: String!
        skuDescription: String!
        """Null when this line has no PO/ASN to compare against (manual GRN line)."""
        remainingCtn: Float
        remainingLoosePcs: Float
    }

    """
    Capacity of a rack for a specific SKU (cartons / cases).
    currentQuantity reflects all SKUs on the rack, converted to equivalent cartons of this SKU using case volume/weight.
    """
    type RackSkuCapacity {
        rackId: ID!
        maxCapacity: Float
        currentQuantity: Float!
        availableCapacity: Float
    }

    """
    Rack suggestion for inbound putaway (pick-face default with capacity check).
    """
    type InboundRackSuggestion {
        rackId: ID
        rackLabel: String
        """DEFAULT = pick-face bin; FALLBACK_EMPTY = alternate empty rack; NONE = no suggestion"""
        source: String!
        defaultRackId: ID
        isDefaultFull: Boolean!
        maxCapacity: Float
        currentQuantity: Float
        availableCapacity: Float
        message: String
        """When forRackId is passed to suggestInboundRack, capacity for that selected rack."""
        capacityForRack: RackSkuCapacity
    }

    """
    One rack location in a multi-rack inbound putaway plan.
    """
    type InboundPutawayAllocation {
        rackId: ID!
        rackLabel: String!
        quantity: Float!
        maxCapacity: Float
        availableCapacity: Float
        """DEFAULT | UNASSIGNED_EMPTY | FALLBACK"""
        source: String!
    }

    """Rack with available capacity for a given SKU and quantity (used for manual rack selection)."""
    type RackCapacityOption {
        rackId: ID!
        rackRow: String!
        rackLevel: String!
        rackColumn: String!
        availableCapacity: Float
    }

    """
    Multi-rack putaway plan when received quantity exceeds a single rack capacity.
    """
    type InboundPutawayPlan {
        allocations: [InboundPutawayAllocation!]!
        totalAllocated: Float!
        remainingQty: Float!
        message: String
        defaultRackId: ID
        capacityForRack: RackSkuCapacity
    }

    """
    Rack allocation for a GRN line (rack + carton qty).
    """
    type GrnRackAllocation {
        rackId: ID!
        quantity: Float!
        rackLabel: String
    }

    input GrnRackAllocationInput {
        rackId: ID!
        quantity: Float!
    }

    """
    Loose/loss rack allocation for a GRN line (loose-storage rack + qty).
    """
    type GrnLossRackAllocation {
        rackId: ID!
        quantity: Float!
        rackLabel: String
    }

    input GrnLossRackAllocationInput {
        rackId: ID!
        quantity: Float!
    }

    extend type Query {
        """
        List outstanding advance notices for the Create GRN picker.
        Without search: paginated pending (unlinked) ASNs only.
        With search: pending + partially-fulfilled linked ASNs matching PO, entity, due date, or SKU.
        """
        listPendingAdvanceNotices(search: String, pageSize: Int, pageNumber: Int): AdvanceNoticePaginatedResponse! @auth

        """
        Look up the advance notice (linked or not) for a given PO/tranid.
        Used on GRN create to compute remaining-to-receive qty against prior deliveries.
        """
        advanceNoticeByPoNo(poNo: String!): AdvanceNotice @auth
    }

    input GrnFilterInput {
        id: ID
        grnNo: String
        """Exact PO reference match — used to look up fulfillment history for a PO."""
        poNo: String
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

    extend type Query {
        """
        Suggest a rack for inbound putaway for a SKU and quantity.
        Uses pick-face strategy default rack; falls back to an empty rack when full.
        Requires authentication.
        """
        suggestInboundRack(skuId: ID, skuCode: String, quantity: Float!, forRackId: ID): InboundRackSuggestion! @auth

        """
        Suggest multiple rack locations for inbound putaway when quantity exceeds one rack.
        Fills pick-face default first, then empty racks not assigned in pick-face table, then any rack with capacity.
        """
        suggestInboundPutawayPlan(skuId: ID, skuCode: String, quantity: Float!, forRackId: ID, excludeRackIds: [ID!]): InboundPutawayPlan! @auth
        """List racks that have enough capacity for the given SKU and quantity (for manual rack picker)."""
        listRacksWithCapacity(skuId: ID, skuCode: String, quantity: Float!, excludeRackIds: [ID!]): [RackCapacityOption!]! @auth
    }

    type GrnPaginatedResponse {
        query: [Grn!]!
        pagination: Pagination!
    }

    type AdvanceNoticePaginatedResponse {
        query: [AdvanceNotice!]!
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
        endUserId: ID
        status: String
        items: [CreateGrnItemInput!]
        inboundQty: Float
        skuId: ID
        poFulfilled: Boolean
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
