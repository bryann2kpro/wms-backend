export const typeDefs = `#graphql
  type SkuAssignmentOutlet {
    outletId: ID!
    outletName: String!
    outletCode: String!
    chain: String
    channel: String
    debtor: String
  }

  type SkuAssignmentSku {
    skuId: ID!
    skuCode: String!
    skuDescription: String!
    brand: String
    category: String
    manufacturer: String
  }

  type SkuAssignment {
    id: ID!
    outlet: SkuAssignmentOutlet!
    sku: SkuAssignmentSku!
    minExpiryMonth: Int!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type SkuAssignmentPaginatedResponse {
    query: [SkuAssignment!]!
    pagination: Pagination!
  }

  input CreateSkuAssignmentInput {
    outletId: ID!
    skuId: ID!
    minExpiryMonth: Int!
    createdBy: String!
    updatedBy: String!
  }

  input UpdateSkuAssignmentInput {
    outletId: ID
    skuId: ID
    minExpiryMonth: Int
    updatedBy: String!
  }

  extend type Query {
    skuAssignments(pageSize: Int, pageNumber: Int): SkuAssignmentPaginatedResponse! @auth
  }

  extend type Mutation {
    createSkuAssignment(input: CreateSkuAssignmentInput!): SkuAssignment! @auth
    updateSkuAssignment(id: ID!, input: UpdateSkuAssignmentInput!): SkuAssignment! @auth
    deleteSkuAssignment(id: ID!): Boolean! @auth
  }
`;
