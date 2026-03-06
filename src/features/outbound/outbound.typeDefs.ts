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
        createdAt: String!
        updatedAt: String!
        createdBy: ID!
        updatedBy: ID
    }

    """
    Purchase Order - transfer/purchase order pulled from NetSuite.
    """
    type PurchaseOrder {
        id: ID!
        purchaseOrderNo: String!
        """
        Resolved outlet (master data) for this purchase order. Request with: purchaseOrders { query { outlet { outletName outletCode regionName } } }
        """
        outlet: Outlet
        status: String!
        scheduledDeliveryDate: String
        createdAt: String!
        updatedAt: String!
        createdBy: ID
        updatedBy: ID
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
    }

    """
    Input for creating a new Purchase Order (manual create from UI).
    """
    input CreatePurchaseOrderInput {
        purchaseOrderNo: String!
        outletId: ID!
        items: [CreatePurchaseOrderLineItemInput!]!
    }

    extend type Mutation {
        """
        Create a purchase order and its line items. Used when creating POs from the UI.
        """
        createPurchaseOrder(input: CreatePurchaseOrderInput!): PurchaseOrder!

        """
        Create a delivery order. Validates line items (SKU resolution), checks stock,
        computes next delivery date, then creates the DO and items in a transaction.
        """
        createDeliveryOrder(input: CreateDeliveryOrderInput!): DeliveryOrder!

        """
        Mark a delivery order as completed.
        """
        completeDeliveryOrder(id: ID!): DeliveryOrder!
    }
`;
