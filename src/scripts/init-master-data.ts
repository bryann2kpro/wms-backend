import 'dotenv/config';

import { db } from '@/db';
import { logger } from '@/util/logger';
import { RegionTable, RegionCode } from '@/features/master-data/region.model';
import { RegionDeliveryScheduleTable, DayOfWeek } from '@/features/master-data/delivery-date.model';
import { eq } from 'drizzle-orm';

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
    
    logger.info('✅ Master data initialization complete!');
  } catch (error) {
    logger.error('❌ Error initializing master data:', error);
    throw error;
  }
}

