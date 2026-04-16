/**
 * ES Integration GraphQL Resolvers
 *
 * @description Resolver functions for querying ES API log records.
 * Uses EsRepository for data access.
 */

import { esRepository } from '@/composition-root';
import { EsAdvanceNoticeLogFilter, EsItemReceiptFilter } from './es.repository';
import { PaginationParams } from '../rbac/rbac.model';

export const resolvers = {
  Query: {
    esAdvanceNoticeLogs: async (_: unknown, args: {
      filter?: EsAdvanceNoticeLogFilter;
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: EsAdvanceNoticeLogFilter = args.filter || {};
      const paginationParams: PaginationParams = {
        pageSize: args.pageSize || 20,
        pageNumber: args.pageNumber || 1,
      };
      const result = await esRepository.listAdvanceNoticeLogs(filter, paginationParams);
      return {
        query: result.query.map((r: any) => ({
          ...r,
          receivedAt: r.receivedAt instanceof Date ? r.receivedAt.toISOString() : r.receivedAt,
        })),
        pagination: result.pagination,
      };
    },

    esItemReceipts: async (_: unknown, args: {
      filter?: EsItemReceiptFilter;
      pageSize?: number;
      pageNumber?: number;
    }) => {
      const filter: EsItemReceiptFilter = args.filter || {};
      const paginationParams: PaginationParams = {
        pageSize: args.pageSize || 20,
        pageNumber: args.pageNumber || 1,
      };
      const result = await esRepository.listItemReceipts(filter, paginationParams);
      return {
        query: result.query.map((r: any) => ({
          ...r,
          sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : r.sentAt,
        })),
        pagination: result.pagination,
      };
    },
  },
};
