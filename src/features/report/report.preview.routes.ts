/**
 * Report preview routes – for local/dev UI testing.
 * GET /api/v1/report/preview/movement – returns rendered Movement Report HTML with mock data.
 */

import { Router, Request, Response } from 'express';
import {
  getMovementReportData,
  renderMovementReportHtml,
} from './report.service.js';

const router = Router();

/**
 * GET /preview/movement
 * Query: dateFrom (optional), dateTo (optional)
 * Returns: text/html – rendered movement-report.html with current mock data.
 * Use this URL in the browser to check and tweak the report format/UI; refresh after editing the template.
 */
router.get('/preview/movement', async (req: Request, res: Response) => {
  try {
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const rows = getMovementReportData(dateFrom, dateTo);
    const html = await renderMovementReportHtml(rows, dateFrom, dateTo);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[report.preview]', err);
    res.status(500).send('Failed to render report preview.');
  }
});

export const reportPreviewRoutes = router;
