import z from "zod";
import { getMovementReportData, getInvoiceSummaryData, renderMovementReportHtml, renderProformaInvoicesHtml, getInventoryBalanceReportData, renderStockBalanceHtml, type InventoryBalanceReportType } from "./report.service";
import { Request, Response } from "express";
import { logger } from "@/util/logger";

class ReportControllerClass {
    async getMovementReport(req: Request, res: Response) {
        try {
            logger.info('🔎 [report.controller.getMovementReport] Getting movement report...');
            const schema = z.object({
                dateFrom: z.string().default(new Date("1970-01-01").toISOString().split('T')[0]),
                dateTo: z.string().default(new Date().toISOString().split('T')[0]),
                regionId: z.string().optional(),
            });
            const { success, data } = schema.safeParse(req.query);
            if (!success) {
                return res.status(400).send('Invalid query parameters.');
            }
            const { dateFrom, dateTo, regionId } = data;

            logger.info('🔎 [report.controller.getMovementReport] Date from: %s, regionId: %s', dateFrom, regionId);
            const rows = await getMovementReportData(dateFrom, dateTo, regionId);
            logger.info('🔎 [report.controller.getMovementReport] Rows Got: %s', rows.length);
            const html = await renderMovementReportHtml(rows, dateFrom, dateTo, regionId);
            logger.info('🔎 [report.controller.getMovementReport] HTML Rendered!');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        } catch (err) {
            logger.error('🚨 [report.controller.getMovementReport]', err);
            res.status(500).send('Failed to render report preview.');
        }
    }

    async getProformaInvoices(req: Request, res: Response) {
        try {
            logger.info('🔎 [report.controller.getProformaInvoices] Getting proforma invoices...');
            const schema = z.object({
                dateFrom: z.string().default(new Date("1970-01-01").toISOString().split('T')[0]),
                dateTo: z.string().default(new Date().toISOString().split('T')[0]),
                regionId: z.string().optional(),
            });
            const { success, data } = schema.safeParse(req.query);
            if (!success) {
                return res.status(400).send('Invalid date from and date to');
            }

            const { dateFrom, dateTo, regionId } = data;

            logger.info('🔎 [report.controller.getProformaInvoices] Date from: %s, Date to: %s, regionId: %s', dateFrom, dateTo, regionId);
            const rows = await getInvoiceSummaryData(dateFrom, dateTo, regionId);
            logger.info('🔎 [report.controller.getProformaInvoices] Rows Got: %s', rows.length);
            const html = await renderProformaInvoicesHtml(rows, dateFrom, dateTo, regionId);
            logger.info('🔎 [report.controller.getProformaInvoices] HTML Rendered!');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        } catch (err) {
            logger.error('🚨 [report.controller.getProformaInvoices]', err);
            res.status(500).send('Failed to render report preview.');
        }
    }

    async getStockBalancePreview(req: Request, res: Response) {
        try {
            const schema = z.object({
                type: z.enum(['WITHOUT_RACK', 'WITH_RACK']).default('WITHOUT_RACK'),
                orgId: z.string().default('00000000-0000-0000-0000-000000000001'),
            });
            const { success, data } = schema.safeParse(req.query);
            if (!success) {
                return res.status(400).send('Invalid query parameters. Use ?type=WITHOUT_RACK|WITH_RACK&orgId=<uuid>');
            }
            const { type, orgId } = data;
            const rows = await getInventoryBalanceReportData(type as InventoryBalanceReportType, orgId);
            logger.info('🔎 [report.controller.getStockBalancePreview] Rows: %s', rows.length);
            const html = await renderStockBalanceHtml(rows, type as InventoryBalanceReportType);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        } catch (err) {
            logger.error('🚨 [report.controller.getStockBalancePreview]', err);
            res.status(500).send('Failed to render stock balance preview.');
        }
    }

}

export { ReportControllerClass };