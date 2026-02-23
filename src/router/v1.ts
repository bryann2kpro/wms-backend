import express from 'express';

// Import feature routes
import { authRoutes } from '@/features/auth/index.js';
import { healthRoutes } from '@/features/health/index.js';
import { uploadRoutes } from '@/features/upload/index.js';
import { rbacRoutes } from '@/features/rbac';
import { reportPreviewRoutes } from '@/features/report/report.routes.js';

const v1Router = express.Router();

// Use the feature routes
v1Router.use('/health', healthRoutes);

v1Router.use('/auth', authRoutes);

v1Router.use('/rbac', rbacRoutes);

v1Router.use('/upload', uploadRoutes);

v1Router.use('/report', reportPreviewRoutes);

export default v1Router;