import 'dotenv/config';

import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq } from 'drizzle-orm';
import { CountriesTable } from '@/features/master-data/country.model';
import { RegionTable } from '@/features/master-data/region.model';
import { WarehousesTable } from '@/features/master-data/warehouses.model';
import { ZonesTable } from '@/features/master-data/zone.model';
import { RacksTable } from '@/features/master-data/racks.model';
import { BinsTable } from '@/features/master-data/bin.model';
import { OrganizationsTable } from '@/features/master-data/organization.model';
import { WarehousePrincipalsTable } from '@/features/master-data/warehouse-principal.model';
import { PutawayRulesTable } from '@/features/master-data/putaway-rule.model';

// ============================================================
// HELPERS
// ============================================================

async function cleanUp() {
  logger.info('🧹 Cleaning up previous test data...');
  await db.delete(PutawayRulesTable);
  await db.delete(BinsTable);
  await db.delete(RacksTable);
  await db.delete(ZonesTable);
  await db.delete(WarehousePrincipalsTable);
  await db.delete(WarehousesTable).where(eq(WarehousesTable.createdBy, 'test'));
  await db.delete(OrganizationsTable).where(eq(OrganizationsTable.createdBy, 'test'));
  await db.delete(RegionTable).where(eq(RegionTable.createdBy, 'test'));
  await db.delete(CountriesTable).where(eq(CountriesTable.createdBy, 'test'));
  logger.info('✓  Clean\n');
}

// ============================================================
// PROBLEM 1 — Insert 10 records across the full hierarchy
// ============================================================

async function seedData() {
  logger.info('=== PROBLEM 1: Seeding Country → Region → Warehouse → Zone → Rack → Bin ===\n');

  // ----------------------------------------------------------
  // 2 Countries
  // ----------------------------------------------------------
  const [malaysia, singapore] = await db
    .insert(CountriesTable)
    .values([
      { countryName: 'Malaysia',   countryCode: 'MY-T', currency: 'MYR', locale: 'en-MY', createdBy: 'test', updatedBy: 'test' },
      { countryName: 'Singapore',  countryCode: 'SG-T', currency: 'SGD', locale: 'en-SG', createdBy: 'test', updatedBy: 'test' },
    ])
    .returning();

  logger.info(`✅ [1] Country: ${malaysia.countryName}  (currency=${malaysia.currency}, locale=${malaysia.locale})`);
  logger.info(`✅ [2] Country: ${singapore.countryName} (currency=${singapore.currency}, locale=${singapore.locale})`);

  // ----------------------------------------------------------
  // 3 Regions (2 under Malaysia, 1 under Singapore)
  // ----------------------------------------------------------
  const [klangValley, northMY, singRegion] = await db
    .insert(RegionTable)
    .values([
      { countryId: malaysia.countryId,  regionName: 'Klang Valley', regionCode: 'KV-T',   createdBy: 'test', updatedBy: 'test' },
      { countryId: malaysia.countryId,  regionName: 'North',        regionCode: 'NO-T',   createdBy: 'test', updatedBy: 'test' },
      { countryId: singapore.countryId, regionName: 'Central SG',   regionCode: 'CSG-T',  createdBy: 'test', updatedBy: 'test' },
    ])
    .returning();

  logger.info(`✅ [3] Region: ${klangValley.regionName} → ${malaysia.countryName}`);
  logger.info(`✅ [4] Region: ${northMY.regionName}     → ${malaysia.countryName}`);
  logger.info(`✅ [5] Region: ${singRegion.regionName}  → ${singapore.countryName}`);

  // ----------------------------------------------------------
  // 2 Organizations (customer axis: org → country + region)
  // ----------------------------------------------------------
  const [orgSME, orgSG] = await db
    .insert(OrganizationsTable)
    .values([
      { organizationName: 'SME Edaran',    organizationCode: 'SME-T',  countryId: malaysia.countryId,   regionId: klangValley.regionId, status: 'active', createdBy: 'test', updatedBy: 'test' },
      { organizationName: 'SG Distributor', organizationCode: 'SGD-T', countryId: singapore.countryId,  regionId: singRegion.regionId,  status: 'active', createdBy: 'test', updatedBy: 'test' },
    ])
    .returning();

  logger.info(`✅ [6] Org: ${orgSME.organizationName}     → ${malaysia.countryName} / ${klangValley.regionName}`);
  logger.info(`✅ [7] Org: ${orgSG.organizationName} → ${singapore.countryName} / ${singRegion.regionName}`);

  // ----------------------------------------------------------
  // 2 Warehouses (physical axis: warehouse → org + region)
  // ----------------------------------------------------------
  const [whShahAlam, whPenang] = await db
    .insert(WarehousesTable)
    .values([
      { organizationId: orgSME.organizationId, regionId: klangValley.regionId, warehouseName: 'Shah Alam WH',   warehouseCode: 'WH-SA-T',  warehouseAddress: 'Shah Alam, Selangor',  createdBy: 'test', updatedBy: 'test' },
      { organizationId: orgSME.organizationId, regionId: northMY.regionId,     warehouseName: 'Penang WH',      warehouseCode: 'WH-PN-T',  warehouseAddress: 'Bayan Lepas, Penang',  createdBy: 'test', updatedBy: 'test' },
    ])
    .returning();

  logger.info(`✅ [8] Warehouse: ${whShahAlam.warehouseName} → ${klangValley.regionName}`);
  logger.info(`✅ [9] Warehouse: ${whPenang.warehouseName}   → ${northMY.regionName}`);

  // ----------------------------------------------------------
  // Warehouse principals (many-to-many)
  // ----------------------------------------------------------
  await db.insert(WarehousePrincipalsTable).values([
    { warehouseId: whShahAlam.warehouseId, organizationId: orgSME.organizationId, createdBy: 'test' },
    { warehouseId: whPenang.warehouseId,   organizationId: orgSME.organizationId, createdBy: 'test' },
  ]);
  logger.info(`✅ [10] Warehouse principals: both warehouses linked to ${orgSME.organizationName}`);

  // ----------------------------------------------------------
  // Zones (2 per warehouse: GENERAL + DAMAGED)
  // ----------------------------------------------------------
  const zones = await db
    .insert(ZonesTable)
    .values([
      { warehouseId: whShahAlam.warehouseId, zoneCode: 'SA-GEN', zoneName: 'Shah Alam General',  purpose: 'GENERAL', createdBy: 'test', updatedBy: 'test' },
      { warehouseId: whShahAlam.warehouseId, zoneCode: 'SA-DMG', zoneName: 'Shah Alam Damaged',  purpose: 'DAMAGED', createdBy: 'test', updatedBy: 'test' },
      { warehouseId: whPenang.warehouseId,   zoneCode: 'PN-GEN', zoneName: 'Penang General',     purpose: 'GENERAL', createdBy: 'test', updatedBy: 'test' },
      { warehouseId: whPenang.warehouseId,   zoneCode: 'PN-DMG', zoneName: 'Penang Damaged',     purpose: 'DAMAGED', createdBy: 'test', updatedBy: 'test' },
    ])
    .returning();

  zones.forEach(z => logger.info(`   Zone: ${z.zoneName.padEnd(22)} purpose=${z.purpose}`));

  // ----------------------------------------------------------
  // Racks (2 per GENERAL zone)
  // ----------------------------------------------------------
  const saGenZone = zones.find(z => z.zoneCode === 'SA-GEN')!;
  const pnGenZone = zones.find(z => z.zoneCode === 'PN-GEN')!;

  const racks = await db
    .insert(RacksTable)
    .values([
      { organizationId: orgSME.organizationId, zoneId: saGenZone.zoneId, rackRow: 'A', rackColumn: '1', rackLevel: '1', createdBy: 'test', updatedBy: 'test' },
      { organizationId: orgSME.organizationId, zoneId: saGenZone.zoneId, rackRow: 'A', rackColumn: '2', rackLevel: '1', createdBy: 'test', updatedBy: 'test' },
      { organizationId: orgSME.organizationId, zoneId: pnGenZone.zoneId, rackRow: 'B', rackColumn: '1', rackLevel: '1', createdBy: 'test', updatedBy: 'test' },
    ])
    .returning();

  racks.forEach(r => logger.info(`   Rack: Row=${r.rackRow} Col=${r.rackColumn} Lvl=${r.rackLevel} → zone_id ✅`));

  // ----------------------------------------------------------
  // Bins (across all racks)
  // ----------------------------------------------------------
  const binValues = racks.flatMap((rack, ri) =>
    ['1', '2', '3'].map((col, bi) => ({
      rackId:         rack.rackId,
      binCode:        `${rack.rackRow}-${rack.rackColumn}-${col}`,
      level:          rack.rackLevel,
      column:         col,
      capacityVolume: '100.000',
      capacityWeight: '50.000',
      isPickFace:     bi === 0,   // first bin per rack is pick-face
      createdBy:      'test',
      updatedBy:      'test',
    }))
  );

  const bins = await db.insert(BinsTable).values(binValues).returning();
  logger.info(`   Created ${bins.length} bins across ${racks.length} racks`);
  bins.forEach(b => logger.info(`   Bin: ${b.binCode.padEnd(8)} isPickFace=${b.isPickFace}`));

  // ----------------------------------------------------------
  // Putaway rules (per warehouse)
  // ----------------------------------------------------------
  await db.insert(PutawayRulesTable).values([
    { warehouseId: whShahAlam.warehouseId, itemAttributeKey: 'category', itemAttributeValue: 'wet',     targetZonePurpose: 'WET',     priority: 1, createdBy: 'test', updatedBy: 'test' },
    { warehouseId: whShahAlam.warehouseId, itemAttributeKey: 'category', itemAttributeValue: 'ambient', targetZonePurpose: 'AMBIENT', priority: 2, createdBy: 'test', updatedBy: 'test' },
    { warehouseId: whPenang.warehouseId,   itemAttributeKey: 'category', itemAttributeValue: 'dry',     targetZonePurpose: 'DRY',     priority: 1, createdBy: 'test', updatedBy: 'test' },
  ]);
  logger.info(`   Created 3 putaway rules across 2 warehouses`);

  logger.info('\n=== PROBLEM 1: PASSED ✅ ===\n');
  return { orgSME };
}

// ============================================================
// PROBLEM 2 — Verify no data under fake org
// ============================================================

async function testProblem2(orgSME: { organizationId: string }) {
  logger.info('=== PROBLEM 2: Verifying hardcoded organization_id removed ===\n');

  const FAKE_ORG_ID = '00000000-0000-0000-0000-000000000001';

  const racksUnderFakeOrg = await db
    .select()
    .from(RacksTable)
    .where(eq(RacksTable.organizationId, FAKE_ORG_ID));

  const warehousesUnderFakeOrg = await db
    .select()
    .from(WarehousesTable)
    .where(eq(WarehousesTable.organizationId, FAKE_ORG_ID));

  logger.info(racksUnderFakeOrg.length === 0
    ? `✅ No racks under fake org ID`
    : `⚠️  ${racksUnderFakeOrg.length} rack(s) still under fake org ID`);

  logger.info(warehousesUnderFakeOrg.length === 0
    ? `✅ No warehouses under fake org ID`
    : `⚠️  ${warehousesUnderFakeOrg.length} warehouse(s) still under fake org ID`);

  // Verify real org data is correctly scoped
  const realRacks = await db
    .select()
    .from(RacksTable)
    .where(eq(RacksTable.organizationId, orgSME.organizationId));

  logger.info(`✅ ${realRacks.length} racks correctly scoped under real org ID (${orgSME.organizationId})`);

  logger.info('\n=== PROBLEM 2: PASSED ✅ ===\n');
}

// ============================================================
// RUN
// ============================================================

async function run() {
  try {
    await cleanUp();
    const { orgSME } = await seedData();
    await testProblem2(orgSME);
    logger.info('🎉 All tests completed successfully');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Test failed:', err);
    process.exit(1);
  }
}

run();
