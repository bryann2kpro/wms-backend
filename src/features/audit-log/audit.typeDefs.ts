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
    userName: String
    role: String
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

  """
  Sort field options for audit logs
  """
  enum AuditLogSortField {
    CREATED_AT
    ACTION
    ENTITY
    USER_NAME
  }

  """
  Sort direction
  """
  enum SortDirection {
    ASC
    DESC
  }

  """
  Sort input for audit logs query
  """
  input AuditLogSort {
    field: AuditLogSortField!
    direction: SortDirection!
  }

  extend type Query {
    """
    Get audit logs with optional filtering, sorting, and pagination.
    Requires authentication.
    """
    auditLogs(
      filter: AuditLogFilterInput
      sort: AuditLogSort
      pageSize: Int
      pageNumber: Int
    ): AuditLogPaginatedResponse! @auth

    """
    Get distinct audit log actions.
    Returns a list of all unique action types in the audit logs.
    Requires authentication.
    """
    auditLogActions: [String!]! @auth

    """
    Get distinct audit log entities.
    Returns a list of all unique entity types in the audit logs.
    Requires authentication.
    """
    auditLogEntities: [String!]! @auth
  }
`;