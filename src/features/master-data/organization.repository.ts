/**
 * Organization Repository
 *
 * @description Handles database operations for organization master data.
 * Provides CRUD operations for managing organizations in a multi-tenant system.
 */

import { eq, and, like, ilike, count } from 'drizzle-orm';
import { OrganizationsTable, OrganizationType, OrganizationInsertType } from './organization.model';
import { db } from '@/db';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';

export type OrganizationFilter = {
  organizationId?: string | string[];
  organizationCode?: string;
  organizationName?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
};

export type PaginationParams = {
  pageSize?: number;
  pageNumber?: number;
};

export type PaginatedResponse<T> = {
  query: T[];
  pagination: {
    count: number;
    totalCount: number;
    currentPage: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

/**
 * Organization Repository Class
 * Handles all database operations related to organizations
 */
export class OrganizationRepositoryClass {
  /**
   * Get organizations with filtering and pagination
   */
  async getOrganizations(
    filter: OrganizationFilter = {},
    pagination?: PaginationParams,
    tx?: DbTransaction
  ): Promise<PaginatedResponse<OrganizationType>> {
    const client = tx ?? db;
    const pageSize = pagination?.pageSize ?? 10;
    const pageNumber = pagination?.pageNumber ?? 1;

    const whereConditions = [];

    if (filter.organizationId) {
      const ids = Array.isArray(filter.organizationId) ? filter.organizationId : [filter.organizationId];
      whereConditions.push(
        ids.length === 1 ? eq(OrganizationsTable.organizationId, ids[0]) : eq(OrganizationsTable.organizationId, ids[0])
      );
    }

    if (filter.organizationCode) {
      whereConditions.push(ilike(OrganizationsTable.organizationCode, `%${filter.organizationCode}%`));
    }

    if (filter.organizationName) {
      whereConditions.push(ilike(OrganizationsTable.organizationName, `%${filter.organizationName}%`));
    }

    if (filter.search) {
      const term = `%${filter.search}%`;
      whereConditions.push(
        ilike(OrganizationsTable.organizationName, term)
      );
    }

    if (filter.status) {
      whereConditions.push(eq(OrganizationsTable.status, filter.status));
    }

    const baseQuery = client
      .select()
      .from(OrganizationsTable)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);

    // Get total count
    const countResult = await client
      .select({ count: count(OrganizationsTable.organizationId) })
      .from(OrganizationsTable)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);
    const totalCount = countResult[0]?.count ?? 0;

    // Apply pagination
    const offset = (pageNumber - 1) * pageSize;
    const query = await baseQuery.limit(pageSize).offset(offset);

    const totalPages = Math.ceil(totalCount / pageSize);

    return {
      query,
      pagination: {
        count: query.length,
        totalCount,
        currentPage: pageNumber,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    };
  }

  /**
   * Get a single organization by ID
   */
  async getOrganizationById(organizationId: string, tx?: DbTransaction): Promise<OrganizationType | null> {
    const client = tx ?? db;
    const result = await client
      .select()
      .from(OrganizationsTable)
      .where(eq(OrganizationsTable.organizationId, organizationId))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get a single organization by code
   */
  async getOrganizationByCode(organizationCode: string, tx?: DbTransaction): Promise<OrganizationType | null> {
    const client = tx ?? db;
    const result = await client
      .select()
      .from(OrganizationsTable)
      .where(eq(OrganizationsTable.organizationCode, organizationCode))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Create a new organization
   */
  async createOrganization(
    data: Omit<OrganizationInsertType, 'id'>,
    tx?: DbTransaction
  ): Promise<OrganizationType> {
    const client = tx ?? db;
    const [organization] = await client
      .insert(OrganizationsTable)
      .values(data)
      .returning();

    logger.info(`✅ [OrganizationRepository.createOrganization] Organization created: ${data.organizationCode}`);
    return organization;
  }

  /**
   * Update an organization
   */
  async updateOrganization(
    organizationId: string,
    data: Partial<Omit<OrganizationInsertType, 'organizationId'>>,
    tx?: DbTransaction
  ): Promise<OrganizationType | null> {
    const client = tx ?? db;
    const result = await client
      .update(OrganizationsTable)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(OrganizationsTable.organizationId, organizationId))
      .returning();

    if (result.length > 0) {
      logger.info(`✅ [OrganizationRepository.updateOrganization] Organization updated: ${organizationId}`);
      return result[0];
    }

    return null;
  }

  /**
   * Delete an organization
   */
  async deleteOrganization(organizationId: string, tx?: DbTransaction): Promise<boolean> {
    const client = tx ?? db;
    const result = await client
      .delete(OrganizationsTable)
      .where(eq(OrganizationsTable.organizationId, organizationId));

    logger.info(`✅ [OrganizationRepository.deleteOrganization] Organization deleted: ${organizationId}`);
    return true;
  }

  /**
   * Get all organization IDs (lean — no pagination, no filters).
   * Intended for cron jobs that must iterate every tenant.
   */
  async getAllOrganizationIds(): Promise<string[]> {
    const rows = await db
      .select({ id: OrganizationsTable.organizationId })
      .from(OrganizationsTable);
    return rows.map((r) => r.id);
  }

  /**
   * Check if an organization code exists
   */
  async codeExists(organizationCode: string, tx?: DbTransaction): Promise<boolean> {
    const client = tx ?? db;
    const result = await client
      .select()
      .from(OrganizationsTable)
      .where(eq(OrganizationsTable.organizationCode, organizationCode))
      .limit(1);

    return result.length > 0;
  }
}

export const organizationRepository = new OrganizationRepositoryClass();
