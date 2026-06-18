export const typeDefs = `#graphql
  type EndUser {
    endUserId: ID!
    userName: String!
  }

  type EndUserPaginatedResponse {
    query: [EndUser!]!
    pagination: Pagination!
  }

  input EndUserFilterInput {
    userName: String
  }

  input CreateEndUserInput {
    userName: String!
  }

  input UpdateEndUserInput {
    userName: String!
  }

  extend type Query {
    endUsers(filter: EndUserFilterInput, pageSize: Int, pageNumber: Int): EndUserPaginatedResponse! @auth
    endUser(id: ID!): EndUser @auth
  }

  extend type Mutation {
    createEndUser(input: CreateEndUserInput!): EndUser! @auth
    updateEndUser(id: ID!, input: UpdateEndUserInput!): EndUser @auth
    deleteEndUser(id: ID!): Boolean! @auth
  }
`;
