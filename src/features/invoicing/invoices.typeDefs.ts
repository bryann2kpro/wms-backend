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
    poAmount: String
    poAmountCalcSnapshot: JSON

    billingAddressId: ID
    deliveryAddressId: ID
    customerAccount: String
    salesExecutive: String
    pageNo: String
    dateIssued: String
    deliveryDate: String

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
    statuses: [String!]
    search: String
    dateIssuedFrom: String
    dateIssuedTo: String
    createdAtFrom: String
    createdAtTo: String
    deliveryDateFrom: String
    deliveryDateTo: String
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

  """
  Result of single-invoice proforma PDF generation.
  """
  type ProformaInvoicePdfPayload {
    pdfBase64: String!
    filename: String!
  }

  """
  Payload returned immediately when a bulk PDF job is initiated.
  Progress and result are streamed via Socket.IO to room job:{jobId}.
  """
  type BulkProformaPdfJobPayload {
    jobId: String!
  }

  extend type Mutation {
    """
    Update the status of an invoice (e.g. ISSUED → SENT).
    """
    updateInvoiceStatus(id: ID!, status: String!): Invoice

    """
    Generate a Proforma Invoice PDF for a single invoice (one PO / one DO).
    Returns base64-encoded PDF and filename for download.
    """
    generateProformaInvoicePdf(invoiceId: ID!): ProformaInvoicePdfPayload! @auth

    """
    Kick off bulk proforma invoice PDF generation for up to 50 invoices.
    Returns a jobId immediately. Progress is streamed via Socket.IO
    to room job:{jobId} with events: bulk-pdf:progress, bulk-pdf:complete, bulk-pdf:error.
    """
    bulkGenerateProformaInvoicesPdf(invoiceIds: [ID!]!): BulkProformaPdfJobPayload! @auth
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

