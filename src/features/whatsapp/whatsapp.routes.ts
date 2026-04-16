import { Router } from 'express';
import authenticateJWT from '@/middlewares/authenticate-jwt';
import { whatsAppClient } from '@/composition-root';

const router = Router();

router.get('/qr', authenticateJWT, (_req, res) => {
  const status = whatsAppClient.getStatus();
  return res.status(200).json({
    success: true,
    data: {
      qr: status.lastQr,
      status: status.status,
      connectedPhone: status.connectedPhone,
    },
  });
});

export default router;

