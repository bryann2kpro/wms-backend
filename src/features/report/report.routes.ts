/**
 * Report preview routes – for local/dev UI testing.
 * GET /api/v1/report/preview/movement – returns rendered Movement Report HTML with mock data.
 */

import { Router } from 'express';
import { reportController } from '@/composition-root';

const router = Router();

/**
 * GET /preview/movement
 * Query: dateFrom (optional), dateTo (optional)
 * Returns: text/html – rendered movement-report.html with current mock data.
 * Use this URL in the browser to check and tweak the report format/UI; refresh after editing the template.
 */
router.get('/preview/movement', reportController.getMovementReport.bind(reportController));

router.get('/preview/proforma', reportController.getProformaInvoices.bind(reportController));
//   try {
//     const schema = z.object({
//       dateFrom: z.string().optional(),
//       dateTo: z.string().optional(),
//     });
//     const { dateFrom, dateTo } = schema.parse(req.query);
//     const pdf = await generateProfomaPdf(dateFrom, dateTo);
//     res.setHeader('Content-Type', 'application/pdf');
//     res.send(pdf);
//   } catch (err) {
//     console.error('[report.preview]', err);
//     res.status(500).send('Failed to render report preview.');
//   }
// });

export const reportPreviewRoutes = router;
