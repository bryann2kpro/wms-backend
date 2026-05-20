/**
 * GraphQL: putaway queue (draft → approved / failed / rejected) before or without stock_quant update.
 */

export const typeDefs = `#graphql
  enum PutawayStatus {
    DRAFT
    APPROVED
    FAIL
    REJECT
  }

  type PutawayLine {
    id: ID!
    status: PutawayStatus!
    skuId: ID!
    skuCode: String
    description: String
    sourceRackId: ID!
    sourceRackLabel: String
    destinationRackId: ID!
    destinationRackLabel: String
    sourceStockQuantId: ID!
    sourceLotNo: String
    quantity: String!
    failureMessage: String
    createdAt: String!
    updatedAt: String!
  }

  type PutawayApproveResult {
    success: Boolean!
    message: String!
  }

  input CreatePutawayDraftInput {
    sourceStockQuantId: ID!
    destinationRackId: ID!
    quantity: String!
    """Lot snapshot at draft time; omit or null when stock has no lot."""
    sourceLotNo: String
  }

  input PutawayLinesFilterInput {
    """If omitted, defaults to DRAFT lines only."""
    status: PutawayStatus
  }

  extend type Query {
    """Putaway lines for the current organization (e.g. drafts in the queue)."""
    putawayLines(filter: PutawayLinesFilterInput, limit: Int): [PutawayLine!]!
  }

  extend type Mutation {
    """Persist a draft putaway line before stock is moved."""
    createPutawayDraft(input: CreatePutawayDraftInput!): PutawayLine!

    """
    Execute stock_quant transfer for a draft line; on success status becomes APPROVED and SQT is recorded.
    On validation/execution failure status becomes FAIL with failureMessage.
    """
    approvePutawayLine(id: ID!): PutawayApproveResult!

    """
    Decline a draft line without moving stock; the row remains with status REJECT.
    """
    rejectPutawayLine(id: ID!): PutawayLine!
  }
`;
