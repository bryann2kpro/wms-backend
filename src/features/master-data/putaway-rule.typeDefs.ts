export const typeDefs = `#graphql
  type PutawayRule {
    putawayRuleId: ID!
    warehouseId: ID!
    itemAttributeKey: String!
    itemAttributeValue: String!
    targetZonePurpose: String!
    priority: Int!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type PutawayRulePaginatedResponse {
    query: [PutawayRule!]!
    pagination: Pagination!
  }

  input PutawayRuleFilterInput {
    putawayRuleId: ID
    warehouseId: ID
    targetZonePurpose: String
  }

  input CreatePutawayRuleInput {
    warehouseId: ID!
    itemAttributeKey: String!
    itemAttributeValue: String!
    targetZonePurpose: String!
    priority: Int
    createdBy: String!
    updatedBy: String!
  }

  input UpdatePutawayRuleInput {
    itemAttributeKey: String
    itemAttributeValue: String
    targetZonePurpose: String
    priority: Int
    updatedBy: String!
  }

  extend type Query {
    putawayRules(filter: PutawayRuleFilterInput, pageSize: Int, pageNumber: Int): PutawayRulePaginatedResponse! @auth
    putawayRule(id: ID!): PutawayRule @auth
  }

  extend type Mutation {
    createPutawayRule(input: CreatePutawayRuleInput!): PutawayRule! @auth
    updatePutawayRule(id: ID!, input: UpdatePutawayRuleInput!): PutawayRule @auth
    deletePutawayRule(id: ID!): Boolean! @auth
  }
`;
