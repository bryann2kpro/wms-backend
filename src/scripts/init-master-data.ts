import 'dotenv/config';

import { db } from '@/db';
import { logger } from '@/util/logger';
import { RegionTable, RegionCode } from '@/features/master-data/region.model';
import { RegionDeliveryScheduleTable, DayOfWeek } from '@/features/master-data/delivery-date.model';
import { StockUnitTable, StockUnitCode } from '@/features/master-data/stock-unit.model';
import { eq, inArray } from 'drizzle-orm';
import { SkuTable, SkuInsertType, SkuType } from '@/features/master-data/sku.model';
import { WarehousesRepositoryClass } from '@/features/master-data/warehouses.repository';
import { InventoryBalancesTable } from '@/features/inventory/inventory-balance/inventory.model';
import { InventoryMovementsTable } from '@/features/inventory/inventory-movement/inventory.model';

// ============================================
// REGION INITIALIZATION
// ============================================

/**
 * Default regions for the system
 */
const DEFAULT_REGIONS = [
  { regionName: 'Klang Valley', regionCode: RegionCode.KLANG_VALLEY },
  { regionName: 'Perlis', regionCode: RegionCode.PERLIS },
  { regionName: 'North', regionCode: RegionCode.NORTH },
  { regionName: 'South', regionCode: RegionCode.SOUTH },
  { regionName: 'East Coast', regionCode: RegionCode.EAST_COAST },
];

/**
 * Default delivery schedules per region
 * Format: { regionCode, dayOfWeek, cutoffDaysBefore, cutoffTime }
 * 
 * Current setup:
 * - Klang Valley: Tuesday & Thursday delivery
 * - Others: Tuesday OR Thursday (can be configured)
 */
const DEFAULT_DELIVERY_SCHEDULES = [
  // Klang Valley - Tuesday delivery, cutoff Monday 12:00
  { regionCode: RegionCode.KLANG_VALLEY, dayOfWeek: DayOfWeek.TUESDAY, cutoffDaysBefore: 1, cutoffTime: '12:00:00' },
  // Klang Valley - Thursday delivery, cutoff Wednesday 18:00
  { regionCode: RegionCode.KLANG_VALLEY, dayOfWeek: DayOfWeek.THURSDAY, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
  
  // Perlis - Tuesday delivery
  { regionCode: RegionCode.PERLIS, dayOfWeek: DayOfWeek.TUESDAY, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
  
  // North - Tuesday delivery
  { regionCode: RegionCode.NORTH, dayOfWeek: DayOfWeek.TUESDAY, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
  
  // South - Thursday delivery
  { regionCode: RegionCode.SOUTH, dayOfWeek: DayOfWeek.THURSDAY, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
  
  // East Coast - Thursday delivery
  { regionCode: RegionCode.EAST_COAST, dayOfWeek: DayOfWeek.THURSDAY, cutoffDaysBefore: 1, cutoffTime: '18:00:00' },
];

/**
 * Get or create a region by code
 */
async function getOrCreateRegion(regionName: string, regionCode: string): Promise<string> {
  const existing = await db
    .select()
    .from(RegionTable)
    .where(eq(RegionTable.regionCode, regionCode))
    .limit(1);

  if (existing.length > 0) {
    logger.info(`✓ Region "${regionName}" (${regionCode}) already exists`);
    return existing[0].regionId;
  }

  const [newRegion] = await db
    .insert(RegionTable)
    .values({
      regionName,
      regionCode,
      createdBy: 'system',
      updatedBy: 'system',
    })
    .returning();

  logger.info(`✅ Region "${regionName}" (${regionCode}) created successfully`);
  return newRegion.regionId;
}

/**
 * Get or create a delivery schedule
 */
async function getOrCreateDeliverySchedule(
  regionId: string,
  regionCode: string,
  dayOfWeek: number,
  cutoffDaysBefore: number,
  cutoffTime: string
): Promise<void> {
  const dayNames: Record<number, string> = {
    1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday',
    5: 'Friday', 6: 'Saturday', 7: 'Sunday',
  };

  const existing = await db
    .select()
    .from(RegionDeliveryScheduleTable)
    .where(eq(RegionDeliveryScheduleTable.regionId, regionId))
    .limit(100);

  const hasSchedule = existing.some(s => s.dayOfWeek === dayOfWeek);

  if (hasSchedule) {
    logger.info(`✓ Delivery schedule for ${regionCode} on ${dayNames[dayOfWeek]} already exists`);
    return;
  }

  await db
    .insert(RegionDeliveryScheduleTable)
    .values({
      regionId,
      dayOfWeek,
      cutoffDaysBefore,
      cutoffTime,
      isActive: true,
      createdBy: 'system',
      updatedBy: 'system',
    });

  logger.info(`✅ Delivery schedule created: ${regionCode} → ${dayNames[dayOfWeek]} (cutoff: ${cutoffDaysBefore} day(s) before at ${cutoffTime})`);
}

/**
 * Initialize all regions
 */
async function initRegions(): Promise<Map<string, string>> {
  logger.info('📍 Initializing regions...');
  
  const regionMap = new Map<string, string>(); // regionCode -> regionId

  for (const region of DEFAULT_REGIONS) {
    const regionId = await getOrCreateRegion(region.regionName, region.regionCode);
    regionMap.set(region.regionCode, regionId);
  }

  logger.info('✅ Regions initialization complete!');
  return regionMap;
}

/**
 * Initialize delivery schedules for all regions
 */
async function initDeliverySchedules(regionMap: Map<string, string>): Promise<void> {
  logger.info('📅 Initializing delivery schedules...');

  for (const schedule of DEFAULT_DELIVERY_SCHEDULES) {
    const regionId = regionMap.get(schedule.regionCode);
    
    if (!regionId) {
      logger.warn(`⚠️ Region ${schedule.regionCode} not found, skipping schedule`);
      continue;
    }

    await getOrCreateDeliverySchedule(
      regionId,
      schedule.regionCode,
      schedule.dayOfWeek,
      schedule.cutoffDaysBefore,
      schedule.cutoffTime
    );
  }

  logger.info('✅ Delivery schedules initialization complete!');
}

// ============================================
// STOCK UNIT INITIALIZATION
// ============================================

/**
 * Default stock units for the system
 */
const DEFAULT_STOCK_UNITS = [
  { unitName: 'Carton', unitCode: StockUnitCode.CARTON },
  // Add more units here as needed:
  // { unitName: 'Piece', unitCode: StockUnitCode.PIECE },
  // { unitName: 'Box', unitCode: StockUnitCode.BOX },
  // { unitName: 'Pack', unitCode: StockUnitCode.PACK },
];

/**
 * Get or create a stock unit by code
 */
async function getOrCreateStockUnit(unitName: string, unitCode: string): Promise<string> {
  const existing = await db
    .select()
    .from(StockUnitTable)
    .where(eq(StockUnitTable.unitCode, unitCode))
    .limit(1);

  if (existing.length > 0) {
    logger.info(`✓ Stock unit "${unitName}" (${unitCode}) already exists`);
    return existing[0].stockUnitId;
  }

  const [newUnit] = await db
    .insert(StockUnitTable)
    .values({
      unitName,
      unitCode,
      isActive: true,
      createdBy: 'system',
      updatedBy: 'system',
    })
    .returning();

  logger.info(`✅ Stock unit "${unitName}" (${unitCode}) created successfully`);
  return newUnit.stockUnitId;
}

/**
 * Initialize all stock units
 */
async function initStockUnits(): Promise<void> {
  logger.info('📦 Initializing stock units...');

  for (const unit of DEFAULT_STOCK_UNITS) {
    await getOrCreateStockUnit(unit.unitName, unit.unitCode);
  }

  logger.info('✅ Stock units initialization complete!');
}

// ============================================
// WAREHOUSE INITIALIZATION
// ============================================

/**
 * Default warehouses for the system
 */
const DEFAULT_WAREHOUSES = [
  {
    warehouseCode: 'SMEE-WH',
    warehouseName: 'SME Ederan Warehouse',
    warehouseAddress: '123 SME Industrial Park, Kuala Lumpur',
  },
];

const warehousesRepository = new WarehousesRepositoryClass();

/**
 * Initialize default warehouses
 */
async function initWarehouses(): Promise<void> {
  logger.info('📦 Initializing warehouses...');

  for (const wh of DEFAULT_WAREHOUSES) {
    await warehousesRepository.getOrCreateWarehouseByCode(
      wh.warehouseCode,
      wh.warehouseName,
      wh.warehouseAddress,
    );
  }

  logger.info('✅ Warehouses initialization complete!');
}

// ============================================
// SKU INITIALIZATION
// ============================================

/**
 * Default skus for the system (skuUomCode resolved to stock_unit_id in getOrCreateSkus)
 */
const DEFAULT_SKUS: (Omit<SkuInsertType, 'skuUom'> & { skuUomCode: string })[] = [
  {
    skuCode: 'RAW-E0011',
    skuDescription: 'Empire Sushi Box(Medium) 300PCS/CTN (Local)',
    skuPrice: null,
    cartonQuantity: '0',
    lossQuantity: '0',
    skuExpiryDate: null,
    skuSuppliers: [],
    skuUomCode: StockUnitCode.CARTON,
  },{
    skuCode: 'RAW-E0012',
    skuDescription: 'Empire Sushi Box(Large) 300PCS/CTN (Local)',
    skuPrice: null,
    cartonQuantity: '0',
    lossQuantity: '0',
    skuExpiryDate: null,
    skuSuppliers: [],
    skuUomCode: StockUnitCode.CARTON,
  },{
    skuCode: 'RAW-E0013',
    skuDescription: 'Empire Sushi Box(Small) 300PCS/CTN (Local)',
    skuPrice: null,
    cartonQuantity: '0',
    lossQuantity: '0',
    skuExpiryDate: null,
    skuSuppliers: [],
    skuUomCode: StockUnitCode.CARTON,
  },{
    skuCode: 'RAW-E0014',
    skuDescription: 'Empire Sushi Box (60PCS/PKT) (Local)',
    skuPrice: null,
    cartonQuantity: '0',
    lossQuantity: '0',
    skuExpiryDate: null,
    skuSuppliers: [],
    skuUomCode: StockUnitCode.PACKET,
  },
  //Add more skus here as needed
];

/**
 * Get or create skus (resolves skuUomCode to stock_unit_id)
 */
async function getOrCreateSkus(
  skus: (Omit<SkuInsertType, 'skuUom'> & { skuUomCode: string })[]
): Promise<SkuType[]> {
  const codes = skus.map(s => s.skuCode);
  const existing = await db
    .select()
    .from(SkuTable)
    .where(inArray(SkuTable.skuCode, codes));

  if (existing.length > 0) {
    logger.info(`✓ Skus "${codes.join(', ')}" already exist`);
    return existing;
  }

  const unitCodes = [...new Set(skus.map(s => s.skuUomCode))];
  const units = await db
    .select({ stockUnitId: StockUnitTable.stockUnitId, unitCode: StockUnitTable.unitCode })
    .from(StockUnitTable)
    .where(inArray(StockUnitTable.unitCode, unitCodes));
  const unitByCode = Object.fromEntries(units.map(u => [u.unitCode, u.stockUnitId]));

  const values = skus.map(({ skuUomCode, ...rest }) => ({
    ...rest,
    skuUom: unitByCode[skuUomCode],
    isActive: true,
    createdBy: 'system',
    updatedBy: 'system',
  }));

  const inserted = await db.insert(SkuTable).values(values).returning();
  logger.info(`✅ Skus "${codes.join(', ')}" created successfully`);
  return inserted;
}

/**
 * Initialize default skus
 */
async function initSkus(): Promise<void> {
  logger.info('📦 Initializing skus...');
  await getOrCreateSkus(DEFAULT_SKUS);
  logger.info('✅ Skus initialization complete!');
}

// ============================================
// INVENTORY INITIALIZATION
// ============================================

/**
 * Initialize default inventory for all SKUs
 */
async function initInventory(): Promise<void> {
  logger.info('📦 Initializing inventory...');
  
  const skus = await db.select().from(SkuTable);
  for (const sku of skus) {
    const existing = await db
      .select()
      .from(InventoryBalancesTable)
      .where(eq(InventoryBalancesTable.skuId, sku.skuId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(InventoryBalancesTable).values({
        skuId: sku.skuId,
        onHandQty: "1000",
        reservedQty: "0",
      });

      await db.insert(InventoryMovementsTable).values({
        skuId: sku.skuId,
        movementType: "ADJUSTMENT",
        quantity: "1000",
        balanceAfter: "1000",
        reason: "System Initialization",
        createdBy: "system",
      });
      logger.info(`✅ Initialized inventory for SKU ${sku.skuCode}`);
    } else {
      logger.info(`✓ Inventory for SKU ${sku.skuCode} already initialized`);
    }
  }
  
  logger.info('✅ Inventory initialization complete!');
}

/**
 * Main initialization function for master data
 */
export async function initMasterData(): Promise<void> {
  try {
    logger.info('🚀 Starting master data initialization...');
    
    // Initialize regions first (delivery schedules depend on them)
    const regionMap = await initRegions();
    
    // Initialize delivery schedules
    await initDeliverySchedules(regionMap);
    
    // Initialize stock units
    await initStockUnits();
    // Initialize warehouses
    await initWarehouses();
    // Initialize skus (depends on stock units for skuUom)
    await initSkus();
    // Initialize inventory for skus
    await initInventory();

    logger.info('✅ Master data initialization complete!');
  } catch (error) {
    logger.error('❌ Error initializing master data:', error);
    throw error;
  }
}

