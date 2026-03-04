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
        outletId: ID!
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

    extend type Mutation {
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
