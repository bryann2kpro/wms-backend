import { Router } from 'express';
import { authController } from '@/features/auth/auth.controller.js';

const router = Router();

// Define routes
router.post('/login', authController.userLogin.bind(authController));
router.post('/admin/login', authController.adminLogin.bind(authController));
router.post('/register', authController.registerUser.bind(authController));
router.post('/role/create', authController.roleCreate.bind(authController));
router.put('/role/update', authController.roleUpdate.bind(authController));
router.post('/permission/create', authController.permissionCreate.bind(authController));
router.put('/permission/update', authController.permissionUpdate.bind(authController));
router.post('/admin/register', authController.registerCompanyAdmin.bind(authController));
router.get('/user/profile', authController.getUserByToken.bind(authController));

export default router;