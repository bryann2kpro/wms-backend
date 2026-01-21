import express from 'express';
import { rbacController } from '@/features/rbac/rbac.controller.js';

const router = express.Router();

router.get('/', rbacController.getAllUserAccess.bind(rbacController));

export default router;