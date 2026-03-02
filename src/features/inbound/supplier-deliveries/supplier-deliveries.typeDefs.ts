/**
 * Supplier Deliveries GraphQL Type Definitions
 * 
 * @description GraphQL schema definitions for Supplier Deliveries operations.
 * Resolvers are in supplier-deliveries.resolvers.ts
 */

export const typeDefs = `#graphql
    """
    Supplier Delivery - represents a delivery from a supplier
    """
    type SupplierDelivery {
        id: ID!
        supplierId: ID!
        supplierDeliveryNo: String!
        deliveryDate: String!
        transporter: String
        lorryPlate: String
        account: String
        poNo: String
        jtNo: String
        orderDate: String
        status: String!
        createdAt: String!
        updatedAt: String!
        createdBy: ID!
        updatedBy: ID
        items: [SupplierDeliveryItem!]!
    }

    """
    Supplier Delivery Item - represents an item in a supplier delivery
    """
    type SupplierDeliveryItem {
        id: ID!
        supplierDeliveryId: ID!
        skuId: ID!
        skuCode: String
        skuDescription: String
        itemId: String
        itemName: String
        qtyDelivered: Float!
        lossQty: Float!
        qtyOrdered: Float
        qtyToFollow: Float
        remarks: String
        createdAt: String!
        updatedAt: String!
        createdBy: ID!
        updatedBy: ID
    }

    """
    Input for creating a new Supplier Delivery (with optional line items)
    """
    input CreateSupplierDeliveryInput {
        supplierDeliveryNo: String!
        deliveryDate: String!
        transporter: String
        lorryPlate: String
        account: String
        poNo: String
        jtNo: String
    }

    """
    Input for updating an existing Supplier Delivery (optionally with item updates)
    """
    input UpdateSupplierDeliveryInput {
        deliveryDate: String
        transporter: String
        lorryPlate: String
        account: String
        poNo: String
        jtNo: String
        orderDate: String
        status: String
        updatedBy: ID
        items: [UpdateSupplierDeliveryItemInDeliveryInput!]
    }

    """
    Input for creating a new Supplier Delivery Item
    """
    input CreateSupplierDeliveryItemInput {
        skuId: ID!
        itemId: String
        itemName: String
        qtyDelivered: Float!
        lossQty: Float
        qtyOrdered: Float
        qtyToFollow: Float
        remarks: String
    }

    """
    Input for updating an existing Supplier Delivery Item (standalone mutation)
    """
    input UpdateSupplierDeliveryItemInput {
        skuId: ID
        itemId: String
        itemName: String
        qtyDelivered: Float
        qtyOrdered: Float
        qtyToFollow: Float
        remarks: String
        updatedBy: ID
    }

    """
    Input for updating a supplier delivery item when nested inside updateSupplierDelivery (includes item id)
    """
    input UpdateSupplierDeliveryItemInDeliveryInput {
        id: ID!
        skuId: ID
        itemId: String
        itemName: String
        qtyDelivered: Float
        lossQty: Float
        qtyOrdered: Float
        qtyToFollow: Float
        remarks: String
        updatedBy: ID
    }

    """
    Paginated Supplier Delivery response
    """
    type SupplierDeliveryPaginatedResponse {
        query: [SupplierDelivery!]!
        pagination: Pagination!
    }

    """
    Input for filtering supplier deliveries
    """
    input SupplierDeliveryFilterInput {
        id: ID
        supplierName: String
        supplierCode: String
        supplierDeliveryNo: String
        deliveryDate: String
        transporter: String
        lorryPlate: String
        account: String
        poNo: String
        jtNo: String
        status: String
    }

    extend type Query {
        supplierDeliveries(filter: SupplierDeliveryFilterInput, pageSize: Int, pageNumber: Int): SupplierDeliveryPaginatedResponse!
        supplierDelivery(id: ID!): SupplierDelivery!
    }

    extend type Mutation {
        createSupplierDelivery(input: CreateSupplierDeliveryInput!): SupplierDelivery!
        updateSupplierDelivery(id: ID!, input: UpdateSupplierDeliveryInput!): SupplierDelivery!
        deleteSupplierDelivery(id: ID!): Boolean!
        createSupplierDeliveryItem(input: CreateSupplierDeliveryItemInput!): SupplierDeliveryItem!
        updateSupplierDeliveryItem(id: ID!, input: UpdateSupplierDeliveryItemInput!): SupplierDeliveryItem!
        deleteSupplierDeliveryItem(id: ID!): Boolean!
    }
`