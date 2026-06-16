/**
 * Outbound GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for Outbound operations (Delivery Orders).
 * Resolvers are in outbound.resolvers.ts
 */

export const typeDefs = `#graphql
    """
    Delivery Order - represents an outbound delivery order
    """
    type DeliveryOrder {
        id: ID!
        doNo: String!
        poNo: String!
        status: String!
        "Whether this is an emergency delivery (bypassed normal cutoff time)"
        isEmergency: Boolean!
        createdAt: String!
        updatedAt: String!
        createdBy: ID!
        updatedBy: ID
    }

    """
    A single batch allocation for a delivery order item pick list.
    Tells the warehouse keeper which GRN batch/rack to pick from and how much.
    """
    type DoItemAllocation {
        id: ID!
        doItemId: ID!
        grnItemId: ID!
        "GRN number this batch came from (for display)"
        grnNo: String
        "Rack ID where the batch is stored"
        rackId: ID
        "Rack location display (e.g. row-column-level)"
        rackName: String
        "Batch expiry date (ISO string), null if not tracked"
        expiryDate: String
        "Lot number from the GRN item, null if not recorded"
        lotNo: String
        "Quantity to pick from this batch"
        qtyAllocated: String!
        "Whether this batch was flagged as priority by admin"
        priorityFlag: Boolean!
    }

    """
    Delivery Order Item with SKU and inventory details - for work queue views
    """
    type DeliveryOrderItemWithDetails {
        id: ID!
        purchaseOrderId: ID!
        purchaseOrderNo: String!
        skuId: ID!
        qtyRequired: String!
        qtyPicked: String
        qtyPacked: String
        "Lot / batch number on the DO line (used to prefill return capture)"
        lotNo: String
        "Expiry date of the DO line lot (ISO 8601), used to prefill return capture"
        expiryDate: String
        createdAt: String!
        updatedAt: String!
        createdBy: ID!
        updatedBy: ID
        "SKU code from master data"
        skuCode: String
        "SKU description from master data"
        skuDescription: String
        "Delivery order ID"
        doId: ID
        "Delivery order number"
        doNo: String
        "Delivery order status"
        doStatus: String
        "On-hand quantity from inventory balance"
        onHandQty: String
        "Loss quantity from inventory balance"
        lossQty: String
        "Reserved quantity from inventory balance"
        reservedQty: String
        "Pick list allocations — which GRN batches to pick from and how much (populated after allocatePickList)"
        allocations: [DoItemAllocation!]!
    }

    """
    Paginated response for delivery order items with details
    """
    type DeliveryOrderItemWithDetailsPaginatedResponse {
        query: [DeliveryOrderItemWithDetails!]!
        pagination: Pagination!
    }

    """
    Filter parameters for querying delivery order items with details
    """
    input DeliveryOrderItemFilterInput {
        id: ID
        purchaseOrderNo: String
        doNo: String
        doStatus: String
        doStatuses: [String!]
        search: String
        "Filter by outlet region ID (uuid)"
        regionId: ID
        "Filter by any of these outlet region IDs (when non-empty, used instead of regionId)"
        regionIds: [ID!]
        "Filter by DO expected delivery date range (inclusive, ISO date string)"
        scheduledDeliveryDateFrom: String
        scheduledDeliveryDateTo: String
    }

    """
    Minimal user info for audit fields on a Purchase Order.
    """
    type PurchaseOrderUser {
        id: ID!
        displayName: String!
        email: String!
    }

    """
    A line item on a Purchase Order.
    """
    type PurchaseOrderItem {
        id: ID!
        skuCode: String!
        skuDescription: String
        qtyRequired: String!
    }

    """
    Purchase Order - transfer/purchase order pulled from NetSuite.
    """
    type PurchaseOrder {
        id: ID!
        purchaseOrderNo: String!
        amount: String!
        """
        Resolved outlet (master data) for this purchase order. Request with: purchaseOrders { query { outlet { outletName outletCode regionName } } }
        """
        outlet: Outlet
        """
        Delivery order created for this purchase order (one-to-one). Request deliveryOrder { id status } to show step and advance.
        """
        deliveryOrder: DeliveryOrder
        status: String!
        scheduledDeliveryDate: String
        createdAt: String!
        updatedAt: String!
        createdBy: ID
        updatedBy: ID
        createdByUser: PurchaseOrderUser
        updatedByUser: PurchaseOrderUser
        items: [PurchaseOrderItem!]!
    }

    """
    Input for a single line item when creating a delivery order.
    Provide either skuId or skuCode (or both); qtyRequired is required.
    """
    input CreateDeliveryOrderItemInput {
        skuId: ID
        skuCode: String
        qtyRequired: Float!
    }

    """
    Input for creating a new Delivery Order
    """
    input CreateDeliveryOrderInput {
        purchaseOrderNo: String!
        deliveryOrderNo: String!
        outletId: ID!
        orderCreatedAt: String
        items: [CreateDeliveryOrderItemInput!]!
    }

    extend type Query {
        _outboundHealth: String

        """
        Get delivery orders with optional filters and pagination.
        """
        deliveryOrders(filter: DeliveryOrderFilterInput, pageSize: Int, pageNumber: Int): DeliveryOrderPaginatedResponse

        """
        Get delivery order items with SKU and inventory details.
        Used for work queue views where staff need to see item details.
        """
        deliveryOrderItems(filter: DeliveryOrderItemFilterInput, pageSize: Int, pageNumber: Int): DeliveryOrderItemWithDetailsPaginatedResponse

        """
        Get purchase orders with optional filters and pagination.
        """
        purchaseOrders(filter: PurchaseOrderFilterInput, pageSize: Int, pageNumber: Int): PurchaseOrderPaginatedResponse

        """
        Get purchase orders for a week, grouped by date (scheduled delivery date, UTC).
        Default: from today (UTC) through 7 days. Override with filter.scheduledDeliveryDateFrom / scheduledDeliveryDateTo.
        Returns one entry per day; dates use DD/MM/YYYY (UTC). Frontend can key by date: Object.fromEntries(result.map(e => [e.date, e.orders])).
        """
        purchaseOrdersByWeek(filter: PurchaseOrderWeekFilterInput): [PurchaseOrdersByDateEntry!]!
    }

    """
    Filter parameters for querying delivery orders.
    """
    input DeliveryOrderFilterInput {
        id: ID
        doNo: String
        toId: ID
        status: String
        "Filter by emergency delivery status"
        isEmergency: Boolean
        createdBy: ID
        createdAtFrom: String
        createdAtTo: String
        page: Int
        pageSize: Int
        pageNumber: Int
    }

    """
    Filter parameters for querying purchase orders.
    """
    input PurchaseOrderFilterInput {
        id: ID
        purchaseOrderNo: String
        outletId: ID
        status: String
        requestedDeliveryDateFrom: String
        requestedDeliveryDateTo: String
        scheduledDeliveryDateFrom: String
        scheduledDeliveryDateTo: String
        createdAtFrom: String
        createdAtTo: String
        page: Int
        pageSize: Int
        pageNumber: Int
    }

    """
    Paginated response for delivery orders.
    """
    type DeliveryOrderPaginatedResponse {
        query: [DeliveryOrder!]!
        pagination: Pagination!
    }

    """
    Paginated response for purchase orders.
    """
    type PurchaseOrderPaginatedResponse {
        query: [PurchaseOrder!]!
        pagination: Pagination!
    }

    """
    Optional filter for purchaseOrdersByWeek. When omitted, week is today (UTC) through 7 days.
    Dates are ISO strings (e.g. YYYY-MM-DD or full ISO); range is inclusive.
    """
    input PurchaseOrderWeekFilterInput {
        scheduledDeliveryDateFrom: String
        scheduledDeliveryDateTo: String
        outletId: ID
        status: String
    }

    """
    One day's worth of purchase orders for the week view. date is DD/MM/YYYY (UTC).
    """
    type PurchaseOrdersByDateEntry {
        date: String!
        orders: [PurchaseOrder!]!
    }

    """
    Input for a single line item when creating a purchase order.
    """
    input CreatePurchaseOrderLineItemInput {
        skuCode: String!
        skuId: ID
        qtyRequired: Float!
        """Specific stock_quant row to reserve from (required from UI)."""
        stockQuantId: ID
    }

    """
    Input for creating a new Purchase Order (manual create from UI).
    """
    input CreatePurchaseOrderInput {
        purchaseOrderNo: String!
        outletId: ID!
        items: [CreatePurchaseOrderLineItemInput!]!
        "If true, bypasses delivery schedule cutoff and assigns to the next delivery day"
        isEmergency: Boolean
    }

    """
    Input for a single line item when updating a purchase order.
    """
    input UpdatePurchaseOrderItemInput {
        id: ID!
        qtyRequired: Float!
    }

    """
    Input for a new line item to add to an existing purchase order.
    """
    input NewPurchaseOrderItemInput {
        skuId: ID!
        skuCode: String!
        qtyRequired: Float!
    }

    """
    Input for updating an existing Purchase Order (partial update from UI).
    Only the fields provided will be changed.
    """
    input UpdatePurchaseOrderInput {
        scheduledDeliveryDate: String
        outletId: ID
        items: [UpdatePurchaseOrderItemInput!]
        "New line items to add to the PO and its linked DO"
        newItems: [NewPurchaseOrderItemInput!]
        "IDs of existing PO items to remove (also removes linked DO item and releases inventory reservation)"
        removedItemIds: [ID!]
    }

    """
    Input for updating a delivery order (partial update).
    Status must follow the flow: NEW -> PACKING -> SHIPPED -> DELIVERED.
    """
    input UpdateDeliveryOrderInput {
        "Whether this is an emergency delivery"
        isEmergency: Boolean
        "Next step status: NEW | PACKING | SHIPPED | DELIVERED (only valid transition allowed)"
        status: String
    }

    extend type Mutation {
        """
        Create a purchase order and its line items. Used when creating POs from the UI.
        """
        createPurchaseOrder(input: CreatePurchaseOrderInput!): PurchaseOrder!

        """
        Update an existing purchase order. Editable fields: notes, scheduledDeliveryDate, outletId, item quantities.
        PO status, DO status, NetSuite status, and createdBy are not editable via this mutation.
        """
        updatePurchaseOrder(id: ID!, input: UpdatePurchaseOrderInput!): PurchaseOrder!

        """
        Cancel a purchase order and its linked delivery order.
        Releases all inventory reservations and recalculates the QOM group charge for any
        remaining sibling POs going to the same outlet on the same delivery date.
        POs in SHIPPED or DELIVERED status cannot be cancelled.
        """
        cancelPurchaseOrder(id: ID!): PurchaseOrder!

        """
        Create a delivery order. Validates line items (SKU resolution), checks stock,
        computes next delivery date, then creates the DO and items in a transaction.
        """
        createDeliveryOrder(input: CreateDeliveryOrderInput!): DeliveryOrder!

        """
        Update a delivery order (e.g. isEmergency).
        """
        updateDeliveryOrder(id: ID!, input: UpdateDeliveryOrderInput!): DeliveryOrder!

        """
        Mark a delivery order as completed.
        """
        completeDeliveryOrder(id: ID!): DeliveryOrder!

        """
        Advance delivery order to the next step: NEW -> PACKING -> SHIPPED -> DELIVERED. When DO becomes SHIPPED, the linked PO is set to Shipped.
        """
        advanceDeliveryOrderStatus(id: ID!): DeliveryOrder!

        """
        Mark a delivery order item as picked. Sets qtyPicked to the specified value.
        Used in work queue when staff picks an item.
        """
        markDeliveryOrderItemPicked(id: ID!, qtyPicked: String!): DeliveryOrderItemWithDetails!

        """
        Apply emergency delivery to an existing purchase order.
        Re-computes the scheduledDeliveryDate ignoring normal cutoff rules,
        moving it to the next available delivery day for the outlet's region.
        """
        applyEmergencyDelivery(id: ID!): PurchaseOrder!

        """
        Submit proof of delivery for a SHIPPED delivery order.
        Saves a signed DO document record and advances the DO status to DELIVERED.
        Optionally captures returned goods (damaged / about-to-expire) handed to
        the driver at the outlet - the return document is created in the same
        transaction as the DELIVERED flip.
        """
        submitDeliveryProof(
            doId: ID!
            fileUrl: String!
            fileName: String!
            fileSizeBytes: Int!
            mimeType: String!
            returns: [ReturnLineInput!]
            returnNotes: String
        ): DeliveryOrder!

        """
        Compute and store the pick list for a delivery order.
        Called when warehouse keeper begins picking (first item checked).
        Determines which GRN batches to use for each item based on the SKU's
        picking strategy (FIFO/LIFO/FEFO) and any priority flags on batches.
        Returns the updated delivery order items with allocations.
        """
        allocatePickList(deliveryOrderId: ID!): [DeliveryOrderItemWithDetails!]!
    }
`;
