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
import { OrganizationRepositoryClass } from '@/features/master-data/organization.repository.js';
import { SkuRepositoryClass } from '@/features/master-data/sku.repository.js';
import { RegionRepositoryClass } from '@/features/master-data/region.repository.js';
import { DeliveryScheduleRepositoryClass } from '@/features/master-data/delivery-schedule.repository.js';
import { OutletsRepositoryClass } from '@/features/master-data/outlets.repository.js';
import { SuppliersRepositoryClass } from '@/features/master-data/suppliers.repository.js';
import { StockUnitRepositoryClass } from '@/features/master-data/stock-unit.repository.js';
import { RacksRepositoryClass } from '@/features/master-data/racks.repository.js';
import { WarehousesRepositoryClass } from '@/features/master-data/warehouses.repository.js';
import { MapRepositoryClass } from '@/features/master-data/map.repository.js';
import { AreaRepositoryClass } from '@/features/master-data/area.repository.js';
import { SetupAreaRepositoryClass } from '@/features/master-data/setup-area.repository.js';
import { PickFaceStrategyRepositoryClass } from '@/features/master-data/pick-face-strategy.repository.js';
import { PickupCriteriaRepositoryClass } from '@/features/master-data/pickup-criteria.repository.js';
import { PalletLabelRepositoryClass } from '@/features/master-data/pallet-label.repository.js';
import { TransportRepositoryClass } from '@/features/master-data/transport.repository.js';
import { ZoneRepositoryClass } from '@/features/master-data/zone.repository.js';
import { BinRepositoryClass } from '@/features/master-data/bin.repository.js';
import { PutawayRuleRepositoryClass } from '@/features/master-data/putaway-rule.repository.js';
import { PickingCriteriaRepositoryClass } from '@/features/master-data/picking-criteria.repository';
import { EndUserRepositoryClass } from '@/features/master-data/enduser.repository';
import { AuditLogRepositoryClass } from './features/audit-log/audit.repository';
import { SkuAssignmentRepositoryClass } from './features/sku-assignment/sku-assignment.repository';
import { ReportControllerClass } from './features/report/report.controller';
// Inbound Repositories
import { GrnsRepositoryClass } from './features/inbound/grns.repository';
import { GrnItemsRepositoryClass } from './features/inbound/grns-items.repository';
import { SupplierDeliveryItemsRepositoryClass } from './features/inbound/supplier-deliveries/supplier-delivery-item.repository';
import { SupplierDeliveriesRepositoryClass } from './features/inbound/supplier-deliveries/supplier-deliveries.repository';
import { InboundServices } from './features/inbound/inbound.services';
import { GrnPutawayService } from './features/inbound/grn-putaway.service';
import { InboundPutawaySuggestionService } from './features/inbound/inbound-putaway-suggestion.service';
import { StockQuantRepositoryClass } from './features/stock-quant/stock-quant.repository';
import { StockTransferRepositoryClass } from './features/stock-quant/stock-transfer/stock-transfer.repository';
import { StockTransferServiceClass } from './features/stock-quant/stock-transfer/stock-transfer.service';
import { StockQuantTransactionRepositoryClass } from './features/stock-quant/stock-quant-transaction/stock-quant-transaction.repository';
// Outbound Repositories & Services
import { PurchaseOrdersRepositoryClass } from './features/outbound/purchase-orders.repository';
import { DeliveryOrdersRepositoryClass } from './features/outbound/delivery-orders.repository';
import { ExceptionsRepositoryClass } from './features/outbound/exceptions.repository';
import { OutboundServices } from './features/outbound/outbound.services';
import { DocumentsRepository } from './features/documents/documents.repository.js';
// Inventory
import { InventoryMovementRepositoryClass } from './features/inventory/inventory-movement/inventory.repository';
import { InventoryBalanceRepositoryClass } from './features/inventory/inventory-balance/inventory.repository';
import { StockCountServices } from './features/inventory/stock-count.services';
import { StockCountSessionRepositoryClass } from './features/inventory/stock-count-session.repository';
import { StockCountSessionService } from './features/inventory/stock-count-session.service';
import { DailyOpeningStockRepositoryClass } from './features/inventory/daily-opening-stock/daily-opening-stock.repository';
import { StockAdjustmentRepositoryClass } from './features/inventory/stock-adjustment/stock-adjustment.repository';
// Dashboard
import { DashboardRepositoryClass } from './features/dashboard/dashboard.repository';
import { InvoicesRepositoryClass } from './features/invoicing/invoices.repository';
import { RunningNoRepositoryClass } from './features/running-no/running-no.repository';
// Returns
import { ReturnsRepositoryClass } from './features/returns/returns.repository';
import { ReturnsServiceClass } from './features/returns/returns.service';
// API Keys
import { ApiKeysRepositoryClass } from '@/features/api-keys/api-keys.repository.js';
import { ApiKeysControllerClass } from '@/features/api-keys/api-keys.controller.js';
// ES Integration
import { EsRepositoryClass } from '@/features/es/es.repository.js';
import { EsControllerClass } from '@/features/es/es.controller.js';
import { NetSuiteService } from '@/features/es/netsuite.service.js';
import { EsItemReceiptServiceClass } from '@/features/es/es-item-receipt.service.js';
// Notifications
import { EmailNotificationRepositoryClass } from '@/features/notifications/email-notification.repository.js';
import { EmailSettingsRepositoryClass } from '@/features/notifications/email-settings.repository.js';
import { WhatsAppNotificationRepositoryClass, WhatsAppSettingsRepositoryClass } from '@/features/whatsapp/whatsapp.repository.js';
import { whatsAppClient as whatsAppClientInstance } from '@/features/whatsapp/whatsapp.client.js';


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
export const runningNoRepository = new RunningNoRepositoryClass();

// Master Data Repositories
export const organizationRepository = new OrganizationRepositoryClass();
export const skuRepository = new SkuRepositoryClass();
export const regionRepository = new RegionRepositoryClass();
export const deliveryScheduleRepository = new DeliveryScheduleRepositoryClass();
export const outletsRepository = new OutletsRepositoryClass();
export const skuAssignmentRepository = new SkuAssignmentRepositoryClass();
export const suppliersRepository = new SuppliersRepositoryClass();
export const stockUnitRepository = new StockUnitRepositoryClass();
export const racksRepository = new RacksRepositoryClass();
export const warehousesRepository = new WarehousesRepositoryClass();
export const mapsRepository = new MapRepositoryClass();
export const areasRepository = new AreaRepositoryClass();
export const setupAreasRepository = new SetupAreaRepositoryClass();
export const pickFaceStrategiesRepository = new PickFaceStrategyRepositoryClass();
export const pickupCriteriasRepository = new PickupCriteriaRepositoryClass();
export const palletLabelsRepository = new PalletLabelRepositoryClass();
export const transportsRepository = new TransportRepositoryClass();
export const zonesRepository = new ZoneRepositoryClass();
export const binsRepository = new BinRepositoryClass();
export const putawayRulesRepository = new PutawayRuleRepositoryClass();
export const pickingCriteriaRepository = new PickingCriteriaRepositoryClass();
export const endUserRepository = new EndUserRepositoryClass();

// Inbound Repositories
export const grnsRepository = new GrnsRepositoryClass(runningNoRepository);
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
export const dailyOpeningStockRepository = new DailyOpeningStockRepositoryClass();
export const stockCountServices = new StockCountServices();
export const stockCountSessionRepository = new StockCountSessionRepositoryClass(
  inventoryMovementRepository,
  dailyOpeningStockRepository,
);
export const stockCountSessionService = new StockCountSessionService(stockCountSessionRepository);
export const stockAdjustmentRepository = new StockAdjustmentRepositoryClass(runningNoRepository);

// Dashboard
export const dashboardRepository = new DashboardRepositoryClass();
// Invoicing Repositories
export const invoicesRepository = new InvoicesRepositoryClass(runningNoRepository);

// Outbound Services
export const documentsRepository = new DocumentsRepository();

// Stock Quant (needed by returns service; also used by inbound putaway below)
export const stockQuantRepository = new StockQuantRepositoryClass();

// Returns
export const returnsRepository = new ReturnsRepositoryClass(runningNoRepository);
export const returnsService = new ReturnsServiceClass(
  returnsRepository,
  deliveryOrdersRepository,
  documentsRepository,
  inventoryMovementRepository,
  stockQuantRepository,
  racksRepository,
  zonesRepository,
);

export const outboundServices = new OutboundServices(
  deliveryOrdersRepository,
  skuRepository,
  inventoryBalancesRepository,
  deliveryScheduleRepository,
  outletsRepository,
  purchaseOrdersRepository,
  inventoryMovementRepository,
  documentsRepository,
  pickFaceStrategiesRepository,
  returnsService,
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
// Notifications
export const emailNotificationRepository = new EmailNotificationRepositoryClass();
export const emailSettingsRepository = new EmailSettingsRepositoryClass();
export const whatsAppNotificationRepository = new WhatsAppNotificationRepositoryClass();
export const whatsAppSettingsRepository = new WhatsAppSettingsRepositoryClass();
export const whatsAppClient = whatsAppClientInstance;
// ES Integration
export const esRepository = new EsRepositoryClass();
export const esController = new EsControllerClass(esRepository, emailNotificationRepository);

export const inboundServices = new InboundServices(
    grnsRepository,
    skuRepository,
    supplierDeliveriesRepository,
    supplierDeliveryItemsRepository,
    grnItemsRepository,
    inventoryMovementRepository,
    suppliersRepository,
    stockUnitRepository,
    esRepository,
);

// API Keys
export const apiKeysRepository = new ApiKeysRepositoryClass();
export const apiKeysController = new ApiKeysControllerClass(apiKeysRepository);

export const stockQuantTransactionRepository = new StockQuantTransactionRepositoryClass();
export const stockTransferRepository = new StockTransferRepositoryClass(runningNoRepository);
export const stockTransferService = new StockTransferServiceClass(
  stockTransferRepository,
  stockQuantRepository,
  stockQuantTransactionRepository,
  inventoryMovementRepository,
  racksRepository,
);
export const inboundPutawaySuggestionService = new InboundPutawaySuggestionService(
  pickFaceStrategiesRepository,
  skuRepository,
  racksRepository,
  stockQuantRepository,
);

export const grnPutawayService = new GrnPutawayService(grnItemsRepository, inboundPutawaySuggestionService);

export const netSuiteService = new NetSuiteService();
export const esItemReceiptService = new EsItemReceiptServiceClass(
  esRepository,
  grnItemsRepository,
  grnsRepository,
  skuRepository,
  suppliersRepository,
  supplierDeliveriesRepository,
  netSuiteService,
  stockUnitRepository,
);