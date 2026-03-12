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
import { S3Repository } from '@/features/upload/aws_s3.repository.js';

// Master Data Repositories
import { SkuRepositoryClass } from '@/features/master-data/sku.repository.js';
import { RegionRepositoryClass } from '@/features/master-data/region.repository.js';
import { DeliveryScheduleRepositoryClass } from '@/features/master-data/delivery-schedule.repository.js';
import { OutletsRepositoryClass } from '@/features/master-data/outlets.repository.js';
import { SuppliersRepositoryClass } from '@/features/master-data/suppliers.repository.js';
import { StockUnitRepositoryClass } from '@/features/master-data/stock-unit.repository.js';
import { RacksRepositoryClass } from '@/features/master-data/racks.repository.js';
import { WarehousesRepositoryClass } from '@/features/master-data/warehouses.repository.js';
import { AuditLogRepositoryClass } from './features/audit-log/audit.repository';
import { ReportControllerClass } from './features/report/report.controller';
// Inbound Repositories
import { GrnsRepositoryClass } from './features/inbound/grns.repository';
import { GrnItemsRepositoryClass } from './features/inbound/grns-items.repository';
import { SupplierDeliveryItemsRepositoryClass } from './features/inbound/supplier-deliveries/supplier-delivery-item.repository';
import { SupplierDeliveriesRepositoryClass } from './features/inbound/supplier-deliveries/supplier-deliveries.repository';
import { InboundServices } from './features/inbound/inbound.services';
// Outbound Repositories & Services
import { PurchaseOrdersRepositoryClass } from './features/outbound/purchase-orders.repository';
import { DeliveryOrdersRepositoryClass } from './features/outbound/delivery-orders.repository';
import { ExceptionsRepositoryClass } from './features/outbound/exceptions.repository';
import { OutboundServices } from './features/outbound/outbound.services';
// Inventory
import { InventoryMovementRepositoryClass } from './features/inventory/inventory-movement/inventory.repository';
import { InventoryBalanceRepositoryClass } from './features/inventory/inventory-balance/inventory.repository';
import { StockCountServices } from './features/inventory/stock-count.services';
// Dashboard
import { DashboardRepositoryClass } from './features/dashboard/dashboard.repository';
import { InvoicesRepositoryClass } from './features/invoicing/invoices.repository';


// ============================================
// SERVICES / UTILITIES (create first - no dependencies)
// ============================================

export const jwtController = new JwtControllerClass();

// S3 (used by upload)
export const s3Repository = new S3Repository();
export const uploadService = new UploadServices(s3Repository);

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
export const warehousesRepository = new WarehousesRepositoryClass();

// Inbound Repositories
export const grnsRepository = new GrnsRepositoryClass();
export const grnItemsRepository = new GrnItemsRepositoryClass();
export const supplierDeliveryItemsRepository = new SupplierDeliveryItemsRepositoryClass();
export const supplierDeliveriesRepository = new SupplierDeliveriesRepositoryClass();

// Outbound Repositories
export const purchaseOrdersRepository = new PurchaseOrdersRepositoryClass();
export const deliveryOrdersRepository = new DeliveryOrdersRepositoryClass();
export const exceptionsRepository = new ExceptionsRepositoryClass();
// Inventory Repositories
export const inventoryBalancesRepository = new InventoryBalanceRepositoryClass();
export const inventoryMovementRepository = new InventoryMovementRepositoryClass(inventoryBalancesRepository);
export const stockCountServices = new StockCountServices();

// Dashboard
export const dashboardRepository = new DashboardRepositoryClass();
// Invoicing Repositories
export const invoicesRepository = new InvoicesRepositoryClass();

// Outbound Services
export const outboundServices = new OutboundServices(
  deliveryOrdersRepository,
  skuRepository,
  inventoryBalancesRepository,
  deliveryScheduleRepository,
  outletsRepository,
  purchaseOrdersRepository,
  inventoryMovementRepository,
);

// ============================================
// CONTROLLERS (Presentation Layer)
// ============================================

export const authController = new AuthControllerClass(authRepository, jwtController, rbacRepository);
export const rbacController = new RbacControllerClass(authRepository, rbacRepository);
export const healthController = new HealthControllerClass();
export const uploadController = new UploadControllerClass(uploadService);
export const auditLogRepository = new AuditLogRepositoryClass();
export const reportController = new ReportControllerClass();
export const inboundServices = new InboundServices(
    grnsRepository,
    skuRepository,
    supplierDeliveriesRepository,
    supplierDeliveryItemsRepository,
    grnItemsRepository,
    inventoryMovementRepository,
);