/**
 * Pallet Label Repository
 */

import { db } from '@/db';
import { PalletLabelTable, PalletLabelType, PalletLabelInsertType } from './pallet-label.model';
import { RacksTable } from './racks.model';
import { eq, and, ilike, isNull, inArray, asc, desc, SQL, sql, or } from 'drizzle-orm';
import { logger } from '@/util/logger';
import { DbTransaction } from '@/types/db-transaction';
import { pagination, PgQueryType } from '@/util/pagination';
import { PaginationParams, PaginatedResponse } from '@/features/rbac/rbac.model';

export type PalletLabelFilter = {
  id?: string;
  storageBinId?: string;
  search?: string;
  labelCode?: string;
  itemCode?: string;
  barCode?: string;
  referenceNo?: string;
  description?: string;
  itemDesc02?: string;
  includeDeleted?: boolean;
};

export type PalletLabelSort = {
  sortBy?: 'STORAGE_BIN' | 'ITEM_CODE' | 'DESCRIPTION' | 'ITEM_DESC_02' | 'UPDATED_AT' | 'CREATED_AT';
  direction?: 'ASC' | 'DESC';
};

export class PalletLabelRepositoryClass {
  async getPalletLabels(
    filter: PalletLabelFilter,
    sort: PalletLabelSort,
    paginationParams: PaginationParams,
    organizationId?: string,
  ): Promise<PaginatedResponse<any>> {
    try {
      const whereCondition: SQL[] = [];

      if (organizationId) whereCondition.push(eq(PalletLabelTable.organizationId, organizationId));
      if (!filter.includeDeleted) whereCondition.push(eq(PalletLabelTable.isDeleted, false));
      if (filter.id) whereCondition.push(eq(PalletLabelTable.id, filter.id));
      if (filter.storageBinId) whereCondition.push(eq(PalletLabelTable.storageBinId, filter.storageBinId));
      if (filter.search) {
        whereCondition.push(
          or(
            ilike(PalletLabelTable.itemCode, `%${filter.search}%`),
            ilike(PalletLabelTable.description, `%${filter.search}%`),
            ilike(PalletLabelTable.itemDesc02, `%${filter.search}%`),
          )!,
        );
      }
      if (filter.labelCode) whereCondition.push(ilike(PalletLabelTable.labelCode, `%${filter.labelCode}%`));
      if (filter.itemCode) whereCondition.push(ilike(PalletLabelTable.itemCode, `%${filter.itemCode}%`));
      if (filter.barCode) whereCondition.push(ilike(PalletLabelTable.barCode, `%${filter.barCode}%`));
      if (filter.referenceNo) whereCondition.push(ilike(PalletLabelTable.referenceNo, `%${filter.referenceNo}%`));
      if (filter.description) whereCondition.push(ilike(PalletLabelTable.description, `%${filter.description}%`));
      if (filter.itemDesc02) whereCondition.push(ilike(PalletLabelTable.itemDesc02, `%${filter.itemDesc02}%`));

      const baseQuery = db
        .select({
          id: PalletLabelTable.id,
          itemCode: PalletLabelTable.itemCode,
          barCode: PalletLabelTable.barCode,
          referenceNo: PalletLabelTable.referenceNo,
          storageBinId: PalletLabelTable.storageBinId,
          storageBinCode: RacksTable.binCode,
          labelCode: PalletLabelTable.labelCode,
          description: PalletLabelTable.description,
          itemDesc02: PalletLabelTable.itemDesc02,
          printedCount: PalletLabelTable.printedCount,
          firstPrintedAt: PalletLabelTable.firstPrintedAt,
          lastPrintedAt: PalletLabelTable.lastPrintedAt,
          isActive: PalletLabelTable.isActive,
          isDeleted: PalletLabelTable.isDeleted,
          deletedAt: PalletLabelTable.deletedAt,
          version: PalletLabelTable.version,
          createdAt: PalletLabelTable.createdAt,
          updatedAt: PalletLabelTable.updatedAt,
          createdBy: PalletLabelTable.createdBy,
          updatedBy: PalletLabelTable.updatedBy,
        })
        .from(PalletLabelTable)
        .leftJoin(RacksTable, eq(PalletLabelTable.storageBinId, RacksTable.rackId))
        .where(whereCondition.length > 0 ? and(...whereCondition) : undefined);

      const sortBy = sort.sortBy ?? 'UPDATED_AT';
      const direction = sort.direction ?? 'DESC';

      const sortedQuery =
        sortBy === 'STORAGE_BIN'
          ? baseQuery.orderBy(direction === 'ASC' ? asc(RacksTable.binCode) : desc(RacksTable.binCode))
          : sortBy === 'ITEM_CODE'
            ? baseQuery.orderBy(direction === 'ASC' ? asc(PalletLabelTable.itemCode) : desc(PalletLabelTable.itemCode))
            : sortBy === 'DESCRIPTION'
              ? baseQuery.orderBy(direction === 'ASC' ? asc(PalletLabelTable.description) : desc(PalletLabelTable.description))
              : sortBy === 'ITEM_DESC_02'
                ? baseQuery.orderBy(direction === 'ASC' ? asc(PalletLabelTable.itemDesc02) : desc(PalletLabelTable.itemDesc02))
                : sortBy === 'CREATED_AT'
                  ? baseQuery.orderBy(direction === 'ASC' ? asc(PalletLabelTable.createdAt) : desc(PalletLabelTable.createdAt))
                  : baseQuery.orderBy(direction === 'ASC' ? asc(PalletLabelTable.updatedAt) : desc(PalletLabelTable.updatedAt));

      const pageSize = paginationParams.pageSize || 10;
      const pageNumber = paginationParams.pageNumber || 1;
      const allData = await sortedQuery;
      const totalCount = allData.length;
      const paginatedQuery = pagination(sortedQuery as unknown as PgQueryType, pageSize, pageNumber, totalCount);
      const data = await paginatedQuery.query;

      return { query: data, pagination: paginatedQuery.pagination };
    } catch (error) {
      logger.error('❌ [PalletLabelRepository.getPalletLabels] Error:', error);
      throw error;
    }
  }

  async getPalletLabelById(id: string, organizationId?: string): Promise<PalletLabelType | null> {
    const whereConditions: SQL[] = [eq(PalletLabelTable.id, id)];
    if (organizationId) whereConditions.push(eq(PalletLabelTable.organizationId, organizationId));

    const [label] = await db
      .select()
      .from(PalletLabelTable)
      .where(and(...whereConditions))
      .limit(1);

    return label || null;
  }

  async getActiveDuplicate(
    organizationId: string,
    storageBinId: string | null | undefined,
    itemCode: string,
    excludeId?: string,
  ): Promise<PalletLabelType | null> {
    const whereConditions: SQL[] = [
      eq(PalletLabelTable.organizationId, organizationId),
      eq(PalletLabelTable.itemCode, itemCode),
      eq(PalletLabelTable.isDeleted, false),
    ];

    if (storageBinId) whereConditions.push(eq(PalletLabelTable.storageBinId, storageBinId));
    else whereConditions.push(isNull(PalletLabelTable.storageBinId));

    const rows = await db
      .select()
      .from(PalletLabelTable)
      .where(and(...whereConditions));

    const duplicate = rows.find((r) => r.id !== excludeId);
    return duplicate || null;
  }

  async createPalletLabel(
    data: Omit<PalletLabelInsertType, 'id' | 'createdAt' | 'updatedAt' | 'isDeleted' | 'deletedAt' | 'version'> & { organizationId: string },
    tx?: DbTransaction,
  ): Promise<PalletLabelType> {
    const dbClient = tx || db;
    const [newLabel] = await dbClient.insert(PalletLabelTable).values({
      ...data,
      isDeleted: false,
      deletedAt: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();
    return newLabel;
  }

  async updatePalletLabel(
    data: Partial<PalletLabelInsertType>,
    id: string,
    organizationId?: string,
    tx?: DbTransaction,
  ): Promise<PalletLabelType | null> {
    const dbClient = tx || db;
    const whereConditions: SQL[] = [eq(PalletLabelTable.id, id)];
    if (organizationId) whereConditions.push(eq(PalletLabelTable.organizationId, organizationId));

    const [updatedLabel] = await dbClient.update(PalletLabelTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(...whereConditions))
      .returning();
    return updatedLabel || null;
  }

  async softDeletePalletLabel(id: string, updatedBy: string, organizationId?: string, tx?: DbTransaction): Promise<boolean> {
    const dbClient = tx || db;
    const whereConditions: SQL[] = [eq(PalletLabelTable.id, id)];
    if (organizationId) whereConditions.push(eq(PalletLabelTable.organizationId, organizationId));

    const result = await dbClient
      .update(PalletLabelTable)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy,
        version: sql`${PalletLabelTable.version} + 1`,
      })
      .where(and(...whereConditions))
      .returning({ id: PalletLabelTable.id });

    return result.length > 0;
  }

  async softDeletePalletLabels(ids: string[], updatedBy: string, organizationId?: string, tx?: DbTransaction): Promise<{ deletedCount: number; deletedIds: string[] }> {
    if (ids.length === 0) return { deletedCount: 0, deletedIds: [] };

    const dbClient = tx || db;
    const whereConditions: SQL[] = [inArray(PalletLabelTable.id, ids)];
    if (organizationId) whereConditions.push(eq(PalletLabelTable.organizationId, organizationId));

    const rows = await dbClient
      .update(PalletLabelTable)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        updatedBy,
        version: sql`${PalletLabelTable.version} + 1`,
      })
      .where(and(...whereConditions))
      .returning({ id: PalletLabelTable.id });

    return { deletedCount: rows.length, deletedIds: rows.map((r) => r.id) };
  }
}
