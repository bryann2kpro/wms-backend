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
    }

    extend type Mutation {
        """
        Create a delivery order. Validates line items (SKU resolution), checks stock,
        computes next delivery date, then creates the DO and items in a transaction.
        """
        createDeliveryOrder(input: CreateDeliveryOrderInput!): DeliveryOrder!
    }
`;
