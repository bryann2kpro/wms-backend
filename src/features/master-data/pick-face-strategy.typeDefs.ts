import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type PickFaceStrategy {
    id: ID!
    skuId: ID!
    storageBinId: ID!
    binType: String!
    itemCode: String!
    storageBin: String
    skuDescription: String
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type PickFaceStrategyPaginatedResponse {
    query: [PickFaceStrategy!]!
    pagination: Pagination!
  }

  input PickFaceStrategyFilterInput {
    id: ID
    skuId: ID
    storageBinId: ID
    binType: String
    """Partial match on item code, SKU description, or storage bin."""
    search: String
  }

  input PickFaceStrategySortInput {
    sortBy: String
    sortOrder: String
  }

  input CreatePickFaceStrategyInput {
    skuId: ID!
    storageBinId: ID!
    itemCode: String!
    binType: String
    createdBy: String!
    updatedBy: String!
  }

  input UpdatePickFaceStrategyInput {
    skuId: ID
    storageBinId: ID
    binType: String
    isActive: Boolean
    updatedBy: String!
  }

  extend type Query {
    pickFaceStrategies(filter: PickFaceStrategyFilterInput, sort: PickFaceStrategySortInput, pageSize: Int, pageNumber: Int): PickFaceStrategyPaginatedResponse! @auth
    pickFaceStrategy(id: ID!): PickFaceStrategy @auth
  }

  extend type Mutation {
    createPickFaceStrategy(input: CreatePickFaceStrategyInput!): PickFaceStrategy! @auth
    updatePickFaceStrategy(id: ID!, input: UpdatePickFaceStrategyInput!): PickFaceStrategy @auth
    deletePickFaceStrategy(id: ID!): Boolean! @auth
  }
`;
