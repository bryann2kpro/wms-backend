/**
 * Invoicing GraphQL Resolvers
 *
 * @description Resolver functions for invoice queries.
 */

import { z } from "zod";
import { logger } from "@/util/logger";
import { invoicesRepository } from "@/composition-root";
import { generateProformaInvoicePdf as generateProformaInvoicePdfService } from "@/features/documents/documents.service";
import { runBulkProformaPdfJob } from "./bulk-proforma-pdf.service";
import type { GraphQLContext } from "@/graphql/context";
import type { InvoiceFilter } from "./invoices.model";

const invoiceFilterSchema = z
  .object({
    id: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    invoiceNo: z.string().min(1).optional(),
    doId: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    poId: z.union([z.string().uuid(), z.array(z.string().uuid())]).optional(),
    status: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
    search: z.string().min(1).optional(),
    dateIssuedFrom: z.string().optional(),
    dateIssuedTo: z.string().optional(),
    createdAtFrom: z.string().optional(),
    createdAtTo: z.string().optional(),
    deliveryDateFrom: z.string().optional(),
    deliveryDateTo: z.string().optional(),
  })
  .transform((data): InvoiceFilter => {
    return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as InvoiceFilter;
  });

function serializeInvoice(inv: Record<string, unknown>) {
  return {
    ...inv,
    createdAt: (inv.createdAt as Date)?.toISOString?.() ?? String(inv.createdAt),
    updatedAt: (inv.updatedAt as Date)?.toISOString?.() ?? String(inv.updatedAt),
    issuedAt: inv.issuedAt ? (inv.issuedAt as Date)?.toISOString?.() ?? String(inv.issuedAt) : null,
    dateIssued: inv.dateIssued ? (inv.dateIssued as Date)?.toISOString?.() ?? String(inv.dateIssued) : null,
    deliveryDate: inv.deliveryDate ? (inv.deliveryDate as Date)?.toISOString?.() ?? String(inv.deliveryDate) : null,
    doNo: (inv.doNo as string | null) ?? null,
  };
}

export const resolvers = {
  Invoice: {
    items: async (parent: { id: string }) => {
      const result = await invoicesRepository.getInvoiceItemsByInvoiceId(parent.id);
      return result.map((item) => ({
        id: item.id,
        invoiceId: item.invoiceId,
        itemNo: item.itemNo ?? null,
        skuId: item.skuId,
        skuCode: "skuCode" in item ? (item.skuCode as string | null) ?? null : null,
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
        filter?: InvoiceFilter & {
          page?: number;
          pageSize?: number;
          pageNumber?: number;
          search?: string;
          statuses?: string[];
        };
        pageSize?: number;
        pageNumber?: number;
      },
      _context: GraphQLContext
    ) => {
      try {
        const rawFilter = args.filter ?? {};
        const normalizedFilter = {
          ...rawFilter,
          status:
            rawFilter.status ??
            (Array.isArray((rawFilter as any).statuses) ? (rawFilter as any).statuses : undefined),
        };

        const filter = invoiceFilterSchema.parse(normalizedFilter);
        const paginationParams = {
          pageSize: args.pageSize ?? args.filter?.pageSize ?? 10,
          pageNumber: args.pageNumber ?? args.filter?.pageNumber ?? args.filter?.page ?? 1,
        };

        const result = await invoicesRepository.getInvoices(filter, paginationParams);
        return {
          query: result.query.map((inv) => serializeInvoice(inv as unknown as Record<string, unknown>)),
          pagination: result.pagination,
          summary: result.summary,
        };
      } catch (error) {
        logger.error("❌ [invoices.resolvers.invoices] Error:", error);
        return { query: [], pagination: { count: 0, totalCount: 0, currentPage: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false }, summary: { issued: 0, sent: 0, cancelled: 0, totalAmount: "0" } };
      }
    },

    invoice: async (_: unknown, args: { id: string }) => {
      try {
        const row = await invoicesRepository.getInvoiceById(args.id);
        if (!row) return null;
        return serializeInvoice(row as unknown as Record<string, unknown>);
      } catch (error) {
        logger.error("❌ [invoices.resolvers.invoice] Error:", error);
        return null;
      }
    },

    invoiceByDoId: async (_: unknown, args: { doId: string }) => {
      try {
        const row = await invoicesRepository.getInvoiceByDoId(args.doId);
        if (!row) return null;
        return serializeInvoice(row as unknown as Record<string, unknown>);
      } catch (error) {
        logger.error("❌ [invoices.resolvers.invoiceByDoId] Error:", error);
        return null;
      }
    },
  },

  Mutation: {
    updateInvoiceStatus: async (_: unknown, args: { id: string; status: string }) => {
      try {
        const row = await invoicesRepository.updateInvoiceStatus(args.id, args.status);
        if (!row) return null;
        return serializeInvoice(row as unknown as Record<string, unknown>);
      } catch (error) {
        logger.error("❌ [invoices.resolvers.updateInvoiceStatus] Error:", error);
        return null;
      }
    },

    generateProformaInvoicePdf: async (
      _: unknown,
      args: { invoiceId: string },
      context: GraphQLContext,
    ) => {
      const organizationId = context.organizationId;
      if (!organizationId) {
        throw new Error("Unauthorized");
      }
      return generateProformaInvoicePdfService(args.invoiceId, organizationId);
    },

    bulkGenerateProformaInvoicesPdf: async (
      _: unknown,
      args: { invoiceIds: string[] },
      context: GraphQLContext,
    ) => {
      const organizationId = context.organizationId;
      if (!organizationId) throw new Error("Unauthorized");
      if (args.invoiceIds.length === 0) throw new Error("No invoice IDs provided");
      if (args.invoiceIds.length > 500) throw new Error("Maximum 500 invoices per bulk export");

      const jobId = crypto.randomUUID();

      // Fire-and-forget — client tracks progress via Socket.IO
      runBulkProformaPdfJob(jobId, args.invoiceIds, organizationId).catch((err) => {
        logger.error("❌ [bulk-pdf] Unhandled job error", err);
      });

      return { jobId };
    },
  },
};
