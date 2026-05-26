import { gql } from 'graphql-tag';

export const typeDefs = gql`
  enum StorageBinItemSortBy {
    STORAGE_BIN
    ITEM_CODE
    DESCRIPTION
    ITEM_DESC_02
    UPDATED_AT
    CREATED_AT
  }

  enum StorageBinItemSortDirection {
    ASC
    DESC
  }

  type PalletLabel {
    id: ID!
    itemCode: String!
    barCode: String
    referenceNo: String
    storageBinId: ID
    storageBinCode: String
    labelCode: String!
    description: String
    itemDesc02: String
    printedCount: Int!
    firstPrintedAt: String
    lastPrintedAt: String
    isActive: Boolean!
    isDeleted: Boolean!
    deletedAt: String
    version: Int!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type BulkDeletePalletLabelResult {
    requestedCount: Int!
    deletedCount: Int!
    failedIds: [ID!]!
  }

  type PalletLabelPaginatedResponse {
    query: [PalletLabel!]!
    pagination: Pagination!
  }

  input PalletLabelFilterInput {
    id: ID
    storageBinId: ID
    search: String
    labelCode: String
    itemCode: String
    barCode: String
    referenceNo: String
    description: String
    itemDesc02: String
    includeDeleted: Boolean
  }

  input StorageBinItemSortInput {
    sortBy: StorageBinItemSortBy = UPDATED_AT
    direction: StorageBinItemSortDirection = DESC
  }

  input CreatePalletLabelInput {
    itemCode: String!
    barCode: String
    referenceNo: String
    storageBinId: ID
    labelCode: String!
    description: String
    itemDesc02: String
    createdBy: String!
    updatedBy: String!
  }

  input UpdatePalletLabelInput {
    itemCode: String
    barCode: String
    referenceNo: String
    storageBinId: ID
    labelCode: String
    description: String
    itemDesc02: String
    isActive: Boolean
    version: Int!
    updatedBy: String!
  }

  extend type Query {
    palletLabels(filter: PalletLabelFilterInput, sort: StorageBinItemSortInput, pageSize: Int, pageNumber: Int): PalletLabelPaginatedResponse! @requirePermission(module: "Inventory", permission: "Read")
    palletLabel(id: ID!): PalletLabel @requirePermission(module: "Inventory", permission: "Read")
  }

  extend type Mutation {
    createPalletLabel(input: CreatePalletLabelInput!): PalletLabel! @requirePermission(module: "Inventory", permission: "create")
    updatePalletLabel(id: ID!, input: UpdatePalletLabelInput!): PalletLabel @requirePermission(module: "Inventory", permission: "update")
    deletePalletLabel(id: ID!, updatedBy: String!): Boolean! @requirePermission(module: "Inventory", permission: "delete")
    deletePalletLabels(ids: [ID!]!, updatedBy: String!): BulkDeletePalletLabelResult! @requirePermission(module: "Inventory", permission: "delete")
  }
`;
