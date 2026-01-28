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
import { SkuRepositoryClass } from '@/features/master-data/sku.repository.js';

// ============================================
// SERVICES / UTILITIES (create first - no dependencies)
// ============================================

export const jwtController = new JwtControllerClass();

// ============================================
// REPOSITORIES (Data Access Layer)
// ============================================

export const authRepository = new AuthRepositoryClass(jwtController);
export const rbacRepository = new RbacRepositoryClass();
export const skuRepository = new SkuRepositoryClass();

// ============================================
// CONTROLLERS (Presentation Layer)
// ============================================

export const authController = new AuthControllerClass(authRepository, jwtController, rbacRepository);
export const rbacController = new RbacControllerClass(authRepository, rbacRepository);
export const healthController = new HealthControllerClass();
