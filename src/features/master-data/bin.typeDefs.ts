export const typeDefs = `#graphql
  type Bin {
    binId: ID!
    rackId: ID!
    binCode: String!
    level: String!
    column: String!
    capacityVolume: Float
    capacityWeight: Float
    currentVolume: Float!
    currentWeight: Float!
    isPickFace: Boolean!
    createdAt: String!
    updatedAt: String!
    createdBy: String!
    updatedBy: String!
  }

  type BinPaginatedResponse {
    query: [Bin!]!
    pagination: Pagination!
  }

  input BinFilterInput {
    binId: ID
    rackId: ID
    rackIds: [ID]
    isPickFace: Boolean
  }

  input CreateBinInput {
    rackId: ID!
    binCode: String!
    level: String!
    column: String!
    capacityVolume: Float
    capacityWeight: Float
    isPickFace: Boolean
    createdBy: String!
    updatedBy: String!
  }

  input UpdateBinInput {
    binCode: String
    level: String
    column: String
    capacityVolume: Float
    capacityWeight: Float
    isPickFace: Boolean
    updatedBy: String!
  }

  extend type Query {
    bins(filter: BinFilterInput, pageSize: Int, pageNumber: Int): BinPaginatedResponse! @auth
    bin(id: ID!): Bin @auth
  }

  extend type Mutation {
    createBin(input: CreateBinInput!): Bin! @auth
    updateBin(id: ID!, input: UpdateBinInput!): Bin @auth
    deleteBin(id: ID!): Boolean! @auth
  }
`;
