/**
 * ES Integration GraphQL Type Definitions
 *
 * @description GraphQL schema for querying ES (Empire Sushi / NetSuite) API log records.
 * Covers inbound advance notice request logs and outbound item receipt records.
 * Resolvers are in es.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Log of every inbound advance notice request received from NetSuite (success and failures).
  """
  type EsAdvanceNoticeLog {
    id: ID!
    receivedAt: String!
    apiKeyId: ID
    rawPayload: JSON!
    status: String!
    errorMessage: String
    advanceNoticeId: ID
  }

  """
  Paginated response for advance notice logs.
  """
  type EsAdvanceNoticeLogPaginatedResponse {
    query: [EsAdvanceNoticeLog!]!
    pagination: Pagination!
  }

  """
  Filter input for advance notice logs.
  """
  input EsAdvanceNoticeLogFilterInput {
    dateFrom: String
    dateTo: String
    status: String
  }

  """
  Outbound item receipt record sent to NetSuite.
  """
  type EsItemReceipt {
    id: ID!
    poNumber: String
    esAdvanceNoticeId: ID
    payload: JSON!
    sentAt: String!
    nsResponse: JSON
  }

  """
  Paginated response for item receipts.
  """
  type EsItemReceiptPaginatedResponse {
    query: [EsItemReceipt!]!
    pagination: Pagination!
  }

  """
  Filter input for item receipts.
  """
  input EsItemReceiptFilterInput {
    dateFrom: String
    dateTo: String
    poNumber: String
    status: String
  }

  extend type Query {
    """
    List all inbound advance notice requests (including failures). Requires authentication.
    """
    esAdvanceNoticeLogs(
      filter: EsAdvanceNoticeLogFilterInput
      pageSize: Int
      pageNumber: Int
    ): EsAdvanceNoticeLogPaginatedResponse! @auth

    """
    List all outbound item receipts sent to NetSuite. Requires authentication.
    """
    esItemReceipts(
      filter: EsItemReceiptFilterInput
      pageSize: Int
      pageNumber: Int
    ): EsItemReceiptPaginatedResponse! @auth
  }
`;
