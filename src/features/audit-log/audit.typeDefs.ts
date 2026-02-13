/**
 * Audit Log GraphQL Type Definitions
 *  
 * @description GraphQL schema definitions for audit log operations.
 * Resolvers are in audit.resolvers.ts
 */

export const typeDefs = `#graphql
  """
  Audit Log - represents a change to the database
  """
  type AuditLog {
    auditLogId: ID!
    userId: ID
    action: String!
    entity: String!
    entityId: ID
    oldData: JSON
    newData: JSON
    ipAddress: String!
    userAgent: String!
    createdAt: String!
  }

  """
  Paginated Audit Log response
  """
  type AuditLogPaginatedResponse {
    query: [AuditLog!]!
    pagination: Pagination!
  }

  """
  Input for filtering audit logs
  """
  input AuditLogFilterInput {
    dateFrom: String
    dateTo: String
    userId: ID
    entity: String
    entityId: ID
    action: String
  }

  extend type Query {
    """
    Get audit logs with optional filtering and pagination.
    Requires authentication.
    """
    auditLogs(filter: AuditLogFilterInput, pageSize: Int, pageNumber: Int): AuditLogPaginatedResponse! @auth
  }
`;