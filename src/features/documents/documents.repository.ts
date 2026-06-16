/**
 * Documents Repository
 *
 * @description Persistence for document metadata (DocumentsTable). PDF generation lives in documents.service.
 */

import { db } from '@/db';
import { DocumentsTable } from './documents.model.js';
import type { DbTransaction } from '@/types/db-transaction';

export type InsertDocumentData = {
  docType: string;
  refType: string;
  refId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storageKey: string;
  url?: string;
  checksum?: string;
  uploadedBy: string;
};

export class DocumentsRepository {
  async insertDocument(data: InsertDocumentData, tx?: DbTransaction) {
    const client = tx ?? db;
    const [doc] = await client.insert(DocumentsTable).values(data).returning();
    return doc;
  }
}
