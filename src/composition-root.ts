/**
 * Composition Root
 * 
 * @description Central place for creating and wiring all dependencies.
 * This is where Dependency Injection happens - all instances are created
 * here and exported for use throughout the application.
 * 
 * Benefits:
 * - Single source of truth for all instances
 * - Easy to swap implementations (e.g., for testing)
 * - Clear dependency graph
 * - Avoids scattered initialization across route files
 */

import { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { AuthControllerClass } from '@/features/auth/auth.controller.js';
import { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import { RbacControllerClass } from '@/features/rbac/rbac.controller.js';
import { RbacRepositoryClass } from '@/features/rbac/rbac.repository.js';
import { HealthControllerClass } from '@/features/health/health.controller.js';
import { UploadServices } from '@/features/upload/upload.services.js';
import { UploadControllerClass } from '@/features/upload/upload.controller.js';

// Master Data Repositories
import { SkuRepositoryClass } from '@/features/master-data/sku.repository.js';
import { RegionRepositoryClass } from '@/features/master-data/region.repository.js';
import { DeliveryScheduleRepositoryClass } from '@/features/master-data/delivery-schedule.repository.js';
import { OutletsRepositoryClass } from '@/features/master-data/outlets.repository.js';
import { SuppliersRepositoryClass } from '@/features/master-data/suppliers.repository.js';
import { StockUnitRepositoryClass } from '@/features/master-data/stock-unit.repository.js';
import { RacksRepositoryClass } from '@/features/master-data/racks.repository.js';
import { AuditLogRepositoryClass } from './features/audit-log/audit.repository';
import { ReportControllerClass } from './features/report/report.controller';

// ============================================
// SERVICES / UTILITIES (create first - no dependencies)
// ============================================

export const jwtController = new JwtControllerClass();
export const uploadService = new UploadServices();

// ============================================
// REPOSITORIES (Data Access Layer)
// ============================================

export const authRepository = new AuthRepositoryClass(jwtController);
export const rbacRepository = new RbacRepositoryClass();

// Master Data Repositories
export const skuRepository = new SkuRepositoryClass();
export const regionRepository = new RegionRepositoryClass();
export const deliveryScheduleRepository = new DeliveryScheduleRepositoryClass();
export const outletsRepository = new OutletsRepositoryClass();
export const suppliersRepository = new SuppliersRepositoryClass();
export const stockUnitRepository = new StockUnitRepositoryClass();
export const racksRepository = new RacksRepositoryClass();

// ============================================
// CONTROLLERS (Presentation Layer)
// ============================================

export const authController = new AuthControllerClass(authRepository, jwtController, rbacRepository);
export const rbacController = new RbacControllerClass(authRepository, rbacRepository);
export const healthController = new HealthControllerClass();
export const uploadController = new UploadControllerClass(uploadService);
export const auditLogRepository = new AuditLogRepositoryClass();
export const reportController = new ReportControllerClass();