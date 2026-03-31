import { Router } from 'express';
import { logger } from '@/util/logger';
import { renderDeliveryOrderPreviewHtml } from '@/features/documents/documents.service';

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

export const documentPreviewRoutes = router;
