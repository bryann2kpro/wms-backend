/**
 * Report GraphQL Type Definitions
 *
 * @description Schema for generating reports (e.g. Invoices Summary, Movement Report) and returning PDF.
 */

export const typeDefs = `#graphql
  """
  Supported report types for PDF generation
  """
  enum ReportType {
    INVOICE_SUMMARY
    MOVEMENT_REPORT
  }

  """
  Sort direction for invoice summary delivery dates.
  """
  enum DeliveryDateSortOrder {
    ASC
    DESC
  }

  """
  Input for generating a report
  """
  input GenerateReportInput {
    """Report type (e.g. INVOICE_SUMMARY, MOVEMENT_REPORT)"""
    type: ReportType!
    """Start date filter (ISO date string) (required)"""
    dateFrom: String!
    """End date filter (ISO date string) (required)"""
    dateTo: String!
    """Region ID to filter or display (e.g. for movement report header) (required)"""
    regionId: ID!
    """Optional delivery date sort order for invoice summary reports"""
    deliveryDateSortOrder: DeliveryDateSortOrder
    """If true, upload the generated PDF to S3 and return s3Url"""
    saveToS3: Boolean
  }

  """
  Result of report generation: PDF as base64 and suggested filename
  """
  type GenerateReportPayload {
    """PDF file content as base64 string"""
    pdfBase64: String!
    """Suggested download filename (e.g. Movement_Report_2026-02-04.pdf)"""
    filename: String!
    """S3 URL of the uploaded report (only when saveToS3 was true)"""
    s3Url: String
  }

  """
  Result of stock count checklist generation: PDF as base64 and suggested filename
  """
  type GenerateChecklistPayload {
    """PDF file content as base64 string"""
    pdfBase64: String!
    """Suggested download filename"""
    filename: String!
  }

  """
  Optional filter for DO picking list generation
  """
  input DoPickingListFilterInput {
    "Filter by outlet region ID (uuid)"
    regionId: ID
    "Filter by any of these outlet region IDs (when non-empty, used instead of regionId)"
    regionIds: [ID!]
    "Filter by item search text (SKU, description, DO, or PO)"
    search: String
    "Filter by expected delivery date range start (ISO date string, inclusive)"
    scheduledDeliveryDateFrom: String
    "Filter by expected delivery date range end (ISO date string, inclusive)"
    scheduledDeliveryDateTo: String
  }

  """
  Optional filter for Internal Transfer Work Queue PDF generation
  """
  input StockTransferWorkQueueFilterInput {
    "Filter by transfer number search text"
    search: String
  }

  """
  Row item for Proforma Invoice Summary export data.
  """
  type InvoiceSummaryReportRow {
    proformaId: String!
    invoiceDate: String!
    deliveryDate: String!
    poNumber: String!
    doNumber: String!
    outlet: String!
    region: String!
    ctn: Int!
    beforeTaxAmount: Float!
    afterTaxAmount: Float!
    amount: Float!
  }

  """
  Variant for Stock Balance report — without or with rack locations.
  """
  enum InventoryBalanceReportType {
    WITHOUT_RACK
    WITH_RACK
  }

  """
  A single row in the Stock Balance report.
  rackLocations is empty for WITHOUT_RACK variant.
  """
  type InventoryBalanceReportRow {
    skuCode: String!
    skuDescription: String!
    unitCode: String!
    onHandQty: Float!
    rackLocations: [String!]!
  }

  extend type Query {
    """
    Fetch Proforma Invoice Summary rows for Excel export.
    """
    invoiceSummaryReportData(
      dateFrom: String!
      dateTo: String!
      regionId: ID!
      deliveryDateSortOrder: DeliveryDateSortOrder
    ): [InvoiceSummaryReportRow!]! @auth

    """
    Fetch Stock Balance rows for Excel export.
    WITHOUT_RACK: SKU Code, Description, UOM, On-Hand Qty.
    WITH_RACK: same plus rack location labels.
    """
    inventoryBalanceReportData(type: InventoryBalanceReportType!): [InventoryBalanceReportRow!]! @auth
  }

  extend type Mutation {
    """
    Generate a report PDF. Returns base64-encoded PDF and filename for download.
    Requires authentication.
    """
    generateReport(input: GenerateReportInput!): GenerateReportPayload! @auth

    """
    Generate a stock count checklist PDF for the given session.
    Returns a blank write-in sheet (no system quantities) for the storekeeper.
    """
    generateStockCountChecklist(sessionId: ID!): GenerateChecklistPayload! @auth

    """
    Generate a DO Picking List PDF — SKU-grouped summary of all active delivery orders.
    Optionally filter by region and/or expected delivery date range.
    Returns a printable picking reference for the storekeeper.
    """
    generateDoPickingList(filter: DoPickingListFilterInput): GenerateChecklistPayload! @auth

    """
    Generate an Internal Transfer Work Queue PDF — approved IN_TRANSIT / AWAITING_DISPATCH transfers.
    Returns a printable work queue list for the storekeeper.
    """
    generateStockTransferWorkQueueList(filter: StockTransferWorkQueueFilterInput): GenerateChecklistPayload! @auth

    """
    Generate a Stock Balance PDF. Returns base64-encoded PDF and suggested filename.
    WITHOUT_RACK: principal-facing summary. WITH_RACK: includes rack location labels.
    """
    generateStockBalanceReport(type: InventoryBalanceReportType!): GenerateReportPayload! @auth

    """
    Generate the GRN Remaining Quantity Report PDF — every GRN line still owed
    against its PO/ASN (remainingCtn/remainingLoosePcs snapshot taken at submission).
    """
    generateGrnRemainingReportPdf: GenerateChecklistPayload! @auth
  }
`;
