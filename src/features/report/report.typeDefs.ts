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
  Input for generating a report
  """
  input GenerateReportInput {
    """Report type (e.g. INVOICE_SUMMARY, MOVEMENT_REPORT)"""
    type: ReportType!
    """Optional start date filter (ISO date string)"""
    dateFrom: String
    """Optional end date filter (ISO date string)"""
    dateTo: String
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

  extend type Mutation {
    """
    Generate a report PDF. Returns base64-encoded PDF and filename for download.
    Requires authentication.
    """
    generateReport(input: GenerateReportInput!): GenerateReportPayload! @auth
  }
`;
