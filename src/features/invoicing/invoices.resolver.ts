/**
 * Invoicing GraphQL Resolvers
 *
 * @description Resolver functions for invoice queries.
 */

import { z } from "zod";
import { logger } from "@/util/logger";
import { invoicesRepository } from "@/composition-root";
import type { GraphQLContext } from "@/graphql/context";
import type { InvoiceFilter } from "./invoices.model";

const invoiceFilterSchema = z
  .object({
    id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    invoiceNo: z.string().min(1).optional(),
    doId: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    poId: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    status: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    dateIssuedFrom: z.string().optional(),
    dateIssuedTo: z.string().optional(),
    createdAtFrom: z.string().optional(),
    createdAtTo: z.string().optional(),
  })
  .transform((data): InvoiceFilter => {
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as InvoiceFilter;
  });

export const resolvers = {
  Invoice: {
    items: async (parent: { id: string }) => {
      const result = await invoicesRepository.getInvoiceItemsByInvoiceId(parent.id);
      return result.map((item) => ({
        id: item.id,
        invoiceId: item.invoiceId,
        itemNo: item.itemNo ?? null,
        skuId: item.skuId,
        description: item.description ?? null,
        qty: item.qty,
        unitPrice: item.unitPrice,
        subTotal: item.subTotal,
        createdAt: item.createdAt?.toISOString?.() ?? String(item.createdAt),
        updatedAt: item.updatedAt?.toISOString?.() ?? String(item.updatedAt),
        createdBy: item.createdBy,
        updatedBy: item.updatedBy ?? null,
      }));
    },
  },

  Query: {
    _invoicingHealth: () => "Invoicing GraphQL is available",

    invoices: async (
      _: unknown,
      args: {
        filter?: InvoiceFilter & { page?: number; pageSize?: number; pageNumber?: number };
        pageSize?: number;
        pageNumber?: number;
      },
      _context: GraphQLContext
    ) => {
      try {
        const filter = invoiceFilterSchema.parse(args.filter ?? {});
        const paginationParams = {
          pageSize: args.pageSize ?? args.filter?.pageSize ?? 10,
          pageNumber: args.pageNumber ?? args.filter?.pageNumber ?? args.filter?.page ?? 1,
        };

        const result = await invoicesRepository.getInvoices(filter, paginationParams);
        return {
          query: result.query.map((inv) => ({
            ...inv,
            createdAt: inv.createdAt?.toISOString?.() ?? String(inv.createdAt),
            updatedAt: inv.updatedAt?.toISOString?.() ?? String(inv.updatedAt),
            issuedAt: inv.issuedAt ? (inv.issuedAt as unknown as Date).toISOString?.() ?? String(inv.issuedAt) : null,
            dateIssued: inv.dateIssued ? (inv.dateIssued as unknown as Date).toISOString?.() ?? String(inv.dateIssued) : null,
          })),
          pagination: result.pagination,
        };
      } catch (error) {
        logger.error("❌ [invoices.resolvers.invoices] Error:", error);
        return false;
      }
    },

    invoice: async (_: unknown, args: { id: string }) => {
      try {
        const row = await invoicesRepository.getInvoiceById(args.id);
        if (!row) return null;
        return {
          ...row,
          createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
          updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
          issuedAt: row.issuedAt ? (row.issuedAt as unknown as Date).toISOString?.() ?? String(row.issuedAt) : null,
          dateIssued: row.dateIssued ? (row.dateIssued as unknown as Date).toISOString?.() ?? String(row.dateIssued) : null,
        };
      } catch (error) {
        logger.error("❌ [invoices.resolvers.invoice] Error:", error);
        return null;
      }
    },

    invoiceByDoId: async (_: unknown, args: { doId: string }) => {
      try {
        const row = await invoicesRepository.getInvoiceByDoId(args.doId);
        if (!row) return null;
        return {
          ...row,
          createdAt: row.createdAt?.toISOString?.() ?? String(row.createdAt),
          updatedAt: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
          issuedAt: row.issuedAt ? (row.issuedAt as unknown as Date).toISOString?.() ?? String(row.issuedAt) : null,
          dateIssued: row.dateIssued ? (row.dateIssued as unknown as Date).toISOString?.() ?? String(row.dateIssued) : null,
        };
      } catch (error) {
        logger.error("❌ [invoices.resolvers.invoiceByDoId] Error:", error);
        return null;
      }
    },
  },
};

