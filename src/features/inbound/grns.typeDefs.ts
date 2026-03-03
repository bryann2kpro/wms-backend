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
        rack: Rack
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
        rackId: ID
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
        """Sort field: GRN_NO, UPDATED_AT, CREATED_AT, STATUS, RECEIVED_AT. Default: UPDATED_AT"""
        sortBy: String
        """Sort direction: ASC or DESC. Default: DESC (latest first)"""
        sortOrder: String
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
    }
`
