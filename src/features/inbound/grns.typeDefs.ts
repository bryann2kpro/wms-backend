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
        remarks: String
        warehouseId: ID
        warehouseName: String
        warehouseAddress: String
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
        remarks: String
        warehouseId: ID
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
        status: String
        approvedBy: ID
        approvedAt: String
        updatedBy: ID
        items: [CreateGrnItemInput!]
    }

    extend type Query {
        grns(filter: GrnFilterInput, pageSize: Int, pageNumber: Int): GrnPaginatedResponse
    }

    input GrnFilterInput {
        id: ID
        grnNo: String
        status: String
        page: Int
        pageSize: Int
        pageNumber: Int
    }

    type GrnPaginatedResponse {
        query: [Grn!]!
        pagination: Pagination!
    }

    extend type Mutation {  
        """
        Create a new GRN.
        Requires authentication.
        """
        createGrn(input: CreateGrnInput!): Grn! @auth

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
    }
`
