import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type PalletLabel {
    id: ID!
    storageBinId: ID
    labelCode: String!
    description: String
    isActive: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type PalletLabelPaginatedResponse {
    query: [PalletLabel!]!
    pagination: Pagination!
  }

  input PalletLabelFilterInput {
    id: ID
    storageBinId: ID
    labelCode: String
  }

  input CreatePalletLabelInput {
    storageBinId: ID
    labelCode: String!
    description: String
    createdBy: String!
    updatedBy: String!
  }

  input UpdatePalletLabelInput {
    storageBinId: ID
    labelCode: String
    description: String
    isActive: Boolean
    updatedBy: String!
  }

  extend type Query {
    palletLabels(filter: PalletLabelFilterInput, pageSize: Int, pageNumber: Int): PalletLabelPaginatedResponse! @auth
    palletLabel(id: ID!): PalletLabel @auth
  }

  extend type Mutation {
    createPalletLabel(input: CreatePalletLabelInput!): PalletLabel! @auth
    updatePalletLabel(id: ID!, input: UpdatePalletLabelInput!): PalletLabel @auth
    deletePalletLabel(id: ID!): Boolean! @auth
  }
`;
