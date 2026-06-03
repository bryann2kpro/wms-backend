/**
 * Documents GraphQL Type Definitions
 *
 * @description Schema for document generation (e.g. Delivery Order PDF).
 */

export const typeDefs = `#graphql
  """
  Result of delivery order PDF generation: public URL after upload to object storage.
  """
  type GenerateDeliveryOrderPdfPayload {
    """HTTPS URL of the uploaded PDF (S3 or CDN)."""
    s3Url: String!
  }

  """
  Result of starting a bulk delivery order PDF job. The client tracks progress via Socket.IO room job:{jobId}.
  """
  type BulkGenerateDeliveryOrdersPdfPayload {
    jobId: String!
  }

  extend type Mutation {
    """
    Generate a Delivery Order PDF (no pricing), upload to storage, and return the public URL.
    Requires authentication.
    """
    generateDeliveryOrderPdf(deliveryOrderId: ID!): GenerateDeliveryOrderPdfPayload! @auth

    """
    Start a bulk Delivery Order PDF generation job. Progress and the final zip are delivered via Socket.IO.
    Requires authentication.
    """
    bulkGenerateDeliveryOrdersPdf(deliveryOrderIds: [ID!]!): BulkGenerateDeliveryOrdersPdfPayload! @auth
  }
`;
