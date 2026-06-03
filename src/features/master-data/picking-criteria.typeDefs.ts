export const typeDefs = `#graphql
  type PickingCriteria {
    id: ID!
    userId: String!
    category: String!
    chain: String!
    channel: String!
    debtor: String!
    deliveryPoint: String!
    storageClass: String!
    brand: String!
    itemCategory: String!
    manufacturer: String!
    item: String!
    minExpiryMonth: Int!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type PickingCriteriaPaginatedResponse {
    query: [PickingCriteria!]!
    pagination: Pagination!
  }

  input PickingCriteriaSortInput {
    sortBy: String
    sortOrder: String
  }

  input PickingCriteriaFilterInput {
    id: ID
    userId: String
    category: String
    chain: String
    channel: String
    debtor: String
    deliveryPoint: String
    storageClass: String
    brand: String
    itemCategory: String
    manufacturer: String
    item: String
  }

  input CreatePickingCriteriaInput {
    userId: String!
    category: String!
    chain: String!
    channel: String!
    debtor: String!
    deliveryPoint: String!
    storageClass: String!
    brand: String!
    itemCategory: String!
    manufacturer: String!
    item: String!
    minExpiryMonth: Int!
    createdBy: String!
    updatedBy: String!
  }

  input UpdatePickingCriteriaInput {
    userId: String
    category: String
    chain: String
    channel: String
    debtor: String
    deliveryPoint: String
    storageClass: String
    brand: String
    itemCategory: String
    manufacturer: String
    item: String
    minExpiryMonth: Int
    updatedBy: String!
  }

  extend type Query {
    pickingCriterias(filter: PickingCriteriaFilterInput, sort: PickingCriteriaSortInput, pageSize: Int, pageNumber: Int): PickingCriteriaPaginatedResponse! @auth
    pickingCriteria(id: ID!): PickingCriteria @auth
  }

  extend type Mutation {
    createPickingCriteria(input: CreatePickingCriteriaInput!): PickingCriteria! @auth
    updatePickingCriteria(id: ID!, input: UpdatePickingCriteriaInput!): PickingCriteria @auth
    deletePickingCriteria(id: ID!): Boolean! @auth
  }
`;
