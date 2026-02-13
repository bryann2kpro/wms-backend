import z from "zod";
import { getMovementReportData, InvoiceSummaryRow, renderMovementReportHtml, renderProformaInvoicesHtml } from "./report.service";
import { Request, Response } from "express";
import { logger } from "@/util/logger";

class ReportControllerClass {
    async getMovementReport(req: Request, res: Response) {
        try {
            logger.info('🔎 [report.controller.getMovementReport] Getting movement report...');
            const schema = z.object({
                dateFrom: z.string().optional(),
                dateTo: z.string().optional(),
            });
            const { dateFrom, dateTo } = schema.parse(req.query);

            logger.info('🔎 [report.controller.getMovementReport] Date from: %s', dateFrom);
            const rows = getMovementReportData(dateFrom, dateTo);
            logger.info('🔎 [report.controller.getMovementReport] Rows Got: %s', rows.length);
            const html = await renderMovementReportHtml(rows, dateFrom, dateTo);
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
            });
            const { success, data } = schema.safeParse(req.query);
            if (!success) {
                return res.status(400).send('Invalid date from and date to');
            }

            const { dateFrom, dateTo } = data;

            logger.info('🔎 [report.controller.getProformaInvoices] Date from: %s, Date to: %s', dateFrom, dateTo);
            // const rows = getProformaInvoicesData(dateFrom, dateTo);
            const rows: InvoiceSummaryRow[] = [];
            logger.info('🔎 [report.controller.getProformaInvoices] Rows Got: %s', rows.length);
            const html = await renderProformaInvoicesHtml(rows, dateFrom, dateTo);
            logger.info('🔎 [report.controller.getProformaInvoices] HTML Rendered!');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
        } catch (err) {
            logger.error('🚨 [report.controller.getProformaInvoices]', err);
            res.status(500).send('Failed to render report preview.');
        }
    }

}

export { ReportControllerClass };