/**
 * Exceptions Repository
 *
 * @description Data access layer for delivery exceptions (shortage/damage).
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import {
  ExceptionsTable,
  ExceptionType,
  ExceptionInsertType,
  ExceptionFilter,
} from "./exceptions.model";
import { PaginationParams, PaginatedResponse } from "@/features/rbac/rbac.model";
import { pagination, PgQueryType } from "@/util/pagination";
import { DbTransaction } from "@/types/db-transaction";
import { eq, and, inArray, gte, lte } from "drizzle-orm";

export class ExceptionsRepositoryClass {
  constructor() {}

  async getExceptions(
    filter: ExceptionFilter,
    paginationParams: PaginationParams,
    organizationId?: string
  ): Promise<PaginatedResponse<ExceptionType>> {
    try {
      logger.info("ℹ️ [ExceptionsRepository.getExceptions] Getting exceptions...");
      const whereCondition: ReturnType<typeof eq>[] = [];

      if (organizationId) {
        whereCondition.push(eq(ExceptionsTable.organizationId, organizationId));
      }

      if (Array.isArray(filter.id)) {
        whereCondition.push(inArray(ExceptionsTable.id, filter.id));
      } else if (filter.id) {
        whereCondition.push(eq(ExceptionsTable.id, filter.id));
      }
      if (Array.isArray(filter.doId)) {
        whereCondition.push(inArray(ExceptionsTable.doId, filter.doId));
      } else if (filter.doId) {
        whereCondition.push(eq(ExceptionsTable.doId, filter.doId));
      }
      if (Array.isArray(filter.skuId)) {
        whereCondition.push(inArray(ExceptionsTable.skuId, filter.skuId));
      } else if (filter.skuId) {
        whereCondition.push(eq(ExceptionsTable.skuId, filter.skuId));
      }
      if (Array.isArray(filter.type)) {
        whereCondition.push(inArray(ExceptionsTable.type, filter.type));
      } else if (filter.type) {
        whereCondition.push(eq(ExceptionsTable.type, filter.type));
      }
      if (Array.isArray(filter.status)) {
        whereCondition.push(inArray(ExceptionsTable.status, filter.status));
      } else if (filter.status) {
        whereCondition.push(eq(ExceptionsTable.status, filter.status));
      }
      if (Array.isArray(filter.reportedBy)) {
        whereCondition.push(inArray(ExceptionsTable.reportedBy, filter.reportedBy));
      } else if (filter.reportedBy) {
        whereCondition.push(eq(ExceptionsTable.reportedBy, filter.reportedBy));
      }
      if (filter.reportedAtFrom) {
        whereCondition.push(gte(ExceptionsTable.reportedAt, new Date(filter.reportedAtFrom)));
      }
      if (filter.reportedAtTo) {
        whereCondition.push(lte(ExceptionsTable.reportedAt, new Date(filter.reportedAtTo)));
      }

      const baseQuery = db
        .select()
        .from(ExceptionsTable)
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const pageSize = paginationParams.pageSize ?? 10;
      const pageNumber = paginationParams.pageNumber ?? 1;
      const totalCount = (await baseQuery).length;
      const paginatedQuery = pagination(baseQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      logger.info("✅ [ExceptionsRepository.getExceptions] Exceptions fetched successfully");
      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error("❌ [ExceptionsRepository.getExceptions] Error:", error);
      throw error;
    }
  }

  async createException(data: ExceptionInsertType, tx?: DbTransaction): Promise<ExceptionType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [ExceptionsRepository.createException] Creating exception...");
      const [row] = await dbClient
        .insert(ExceptionsTable)
        .values({
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      logger.info("✅ [ExceptionsRepository.createException] Exception created successfully");
      return row;
    } catch (error) {
      logger.error("❌ [ExceptionsRepository.createException] Error:", error);
      throw error;
    }
  }

  async updateException(
    id: string,
    data: Partial<ExceptionInsertType>,
    organizationId?: string,
    tx?: DbTransaction
  ): Promise<ExceptionType> {
    try {
      const dbClient = tx ?? db;
      logger.info("ℹ️ [ExceptionsRepository.updateException] Updating exception...");
      const whereConditions = [eq(ExceptionsTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(ExceptionsTable.organizationId, organizationId));
      }
      const [row] = await dbClient
        .update(ExceptionsTable)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...whereConditions))
        .returning();
      if (!row) throw new Error("[ExceptionsRepository.updateException] Exception not found");
      logger.info("✅ [ExceptionsRepository.updateException] Exception updated successfully");
      return row;
    } catch (error) {
      logger.error("❌ [ExceptionsRepository.updateException] Error:", error);
      throw error;
    }
  }

  async deleteException(id: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    try {
      const dbClient = tx ?? db;
      const whereConditions = [eq(ExceptionsTable.id, id)];
      if (organizationId) {
        whereConditions.push(eq(ExceptionsTable.organizationId, organizationId));
      }
      await dbClient.delete(ExceptionsTable).where(and(...whereConditions));
      logger.info("✅ [ExceptionsRepository.deleteException] Exception deleted successfully");
      return true;
    } catch (error) {
      logger.error("❌ [ExceptionsRepository.deleteException] Error:", error);
      throw error;
    }
  }
}
