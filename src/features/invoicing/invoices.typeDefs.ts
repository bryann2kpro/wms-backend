/**
 * Invoicing GraphQL Type Definitions
 *
 * @description GraphQL schema definitions for invoices.
 * Resolvers are in invoices.resolver.ts
 */

export const typeDefs = `#graphql
  """
  Invoice issued by SME for a delivery order.
  """
  type Invoice {
    id: ID!
    invoiceNo: String!
    doId: ID!
    doNo: String
    poId: ID
    poNo: String

    billingAddressId: ID
    deliveryAddressId: ID
    customerAccount: String
    salesExecutive: String
    pageNo: String
    dateIssued: String

    totalExclTax: String
    taxAmount: String
    totalInclTax: String
    taxRate: String

    status: String!
    issuedBy: ID
    issuedAt: String

    createdAt: String!
    updatedAt: String!
    createdBy: ID!
    updatedBy: ID

    items: [InvoiceItem!]!
  }

  """
  Invoice line item.
  """
  type InvoiceItem {
    id: ID!
    invoiceId: ID!
    itemNo: String
    skuId: ID!
    skuCode: String
    description: String
    qty: String!
    unitPrice: String!
    subTotal: String!
    createdAt: String!
    updatedAt: String!
    createdBy: ID!
    updatedBy: ID
  }

  """
  Filter input for invoices query.
  """
  input InvoiceFilterInput {
    id: ID
    invoiceNo: String
    doId: ID
    poId: ID
    status: String
    search: String
    dateIssuedFrom: String
    dateIssuedTo: String
    createdAtFrom: String
    createdAtTo: String
    pageSize: Int
    pageNumber: Int
    page: Int
  }

  """
  Summary counts for invoices.
  """
  type InvoiceSummary {
    issued: Int!
    sent: Int!
    cancelled: Int!
    totalAmount: String!
  }

  """
  Paginated response for invoices.
  """
  type InvoicesPaginatedResponse {
    query: [Invoice!]!
    pagination: Pagination!
    summary: InvoiceSummary!
  }

  extend type Mutation {
    """
    Update the status of an invoice (e.g. ISSUED → SENT).
    """
    updateInvoiceStatus(id: ID!, status: String!): Invoice
  }

  extend type Query {
    _invoicingHealth: String

    """
    List invoices with optional filters and pagination.
    """
    invoices(filter: InvoiceFilterInput, pageSize: Int, pageNumber: Int): InvoicesPaginatedResponse!

    """
    Get a single invoice by id.
    """
    invoice(id: ID!): Invoice

    """
    Get a single invoice by delivery order id.
    """
    invoiceByDoId(doId: ID!): Invoice
  }
`;

