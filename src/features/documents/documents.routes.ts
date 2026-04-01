import { Router } from 'express';
import { logger } from '@/util/logger';
import {
  renderDeliveryOrderPreviewHtml,
  renderProformaInvoicePreviewHtml,
} from '@/features/documents/documents.service';
import z from 'zod';

const router = Router();

router.get('/preview/delivery-order', async (req, res) => {
  try {
    const doId = String(req.query.doId ?? '').trim();
    if (!doId) return res.status(400).send('Missing required query param: doId');

    logger.info('🔎 [document.routes.preview.delivery-order] Rendering DO preview for %s', doId);

    const html = await renderDeliveryOrderPreviewHtml(doId);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    logger.error('🚨 [document.routes.preview.delivery-order]', error);
    return res.status(500).send('Failed to render delivery order preview.');
  }
});

router.get('/preview/proforma-invoice', async (req, res) => {
  try {
    logger.info('🔎 [document.routes.preview.proforma-invoice] Getting proforma invoice preview for %s', req.query.invoiceId ?? '');
    const { success, data: invoiceId } = z.uuid().safeParse(req.query.invoiceId ?? '');
    if (!success) {
      logger.warn('🔎 [document.routes.preview.proforma-invoice] Invalid invoiceId: %s', req.query.invoiceId ?? '');
      return res.status(400).send('Invalid or missing query param: invoiceId (UUID)');
    }

    logger.info('🔎 [document.routes.preview.proforma-invoice] Rendering proforma invoice preview for %s', invoiceId);
    const html = await renderProformaInvoicePreviewHtml(invoiceId);
    if (!html) {
      return res.status(404).send('Invoice not found.');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    logger.error('🚨 [document.routes.preview.proforma-invoice]', error);
    return res.status(500).send('Failed to render proforma invoice preview.');
  }
});

export const documentPreviewRoutes = router;
