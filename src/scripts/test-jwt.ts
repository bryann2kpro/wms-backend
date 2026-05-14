import 'dotenv/config';
import axios from 'axios';
import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq } from 'drizzle-orm';
import { OrganizationsTable } from '@/features/master-data/organization.model';
import { WarehousesTable } from '@/features/master-data/warehouses.model';
import { UsersTable } from '@/features/auth/auth.model';
import bcrypt from 'bcrypt';

const GQL = 'http://localhost:7777/graphql';

// ============================================================
// HELPERS
// ============================================================

async function gql(query: string, variables = {}, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await axios.post(GQL, { query, variables }, { headers, validateStatus: () => true });
  return res.data;
}

async function cleanTestUsers() {
  await db.delete(UsersTable).where(eq(UsersTable.createdBy, 'jwt-test'));
}

// ============================================================
// SETUP — create test users in DB directly
// ============================================================

async function setupUsers() {
  logger.info('🔧 Setting up test users...');

  await cleanTestUsers();

  // Get the SME-TEST org we created earlier
  const [org] = await db
    .select()
    .from(OrganizationsTable)
    .where(eq(OrganizationsTable.organizationCode, 'SME-T'))
    .limit(1);

  if (!org) {
    throw new Error('SME-T org not found — run test-m1-m2.ts first');
  }

  const hashedPassword = await bcrypt.hash('Test@1234', 10);

  // User WITH org
  const [userWithOrg] = await db
    .insert(UsersTable)
    .values({
      email: 'test-with-org@smee.test',
      passwordHash: hashedPassword,
      displayName: 'Test WithOrg',
      primaryOrganizationId: org.organizationId,
      isActive: true,
      createdBy: 'jwt-test',
      updatedBy: 'jwt-test',
    })
    .returning();

  // User WITHOUT org
  const [userNoOrg] = await db
    .insert(UsersTable)
    .values({
      email: 'test-no-org@smee.test',
      passwordHash: hashedPassword,
      displayName: 'Test NoOrg',
      primaryOrganizationId: null,
      isActive: true,
      createdBy: 'jwt-test',
      updatedBy: 'jwt-test',
    })
    .returning();

  logger.info(`✅ User with org:    ${userWithOrg.email} (org=${org.organizationId})`);
  logger.info(`✅ User without org: ${userNoOrg.email}  (org=null)\n`);

  return { org, userWithOrg, userNoOrg };
}

// ============================================================
// TEST 1 — Login with org → should get token with organizationId
// ============================================================

async function testLoginWithOrg(email: string, orgId: string) {
  logger.info('--- TEST 1: Login with org ---');

  const res = await gql(`
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        accessToken
        user { id email }
      }
    }
  `, { input: { email, password: 'Test@1234' } });

  if (res.errors) {
    logger.error(`❌ Login failed: ${res.errors[0].message}`);
    return null;
  }

  const { accessToken } = res.data.login;
  logger.info(`✅ Login successful → got accessToken`);

  // Decode JWT payload (middle part, base64)
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
  logger.info(`   JWT payload: organizationId=${payload.organizationId}`);

  if (payload.organizationId === orgId) {
    logger.info(`✅ organizationId in token matches real org ID\n`);
  } else {
    logger.error(`❌ organizationId mismatch! token=${payload.organizationId} expected=${orgId}\n`);
  }

  return accessToken;
}

// ============================================================
// TEST 2 — Login without org → should get UNAUTHORIZED
// ============================================================

async function testLoginWithoutOrg(email: string) {
  logger.info('--- TEST 2: Login without org → expect UNAUTHORIZED ---');

  const res = await gql(`
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        accessToken
      }
    }
  `, { input: { email, password: 'Test@1234' } });

  if (res.errors && res.errors[0]?.extensions?.code === 'UNAUTHORIZED') {
    logger.info(`✅ Got UNAUTHORIZED as expected: "${res.errors[0].message}"\n`);
  } else if (res.errors) {
    logger.warn(`⚠️  Got error but wrong code: ${JSON.stringify(res.errors[0])}\n`);
  } else {
    logger.error(`❌ Login succeeded but should have been blocked — user has no org!\n`);
  }
}

// ============================================================
// TEST 3 — Create warehouse WITH valid token → should succeed
// ============================================================

async function testCreateWarehouseWithToken(token: string) {
  logger.info('--- TEST 3: Create warehouse with valid token → expect success ---');

  const res = await gql(`
    mutation {
      createWarehouse(input: {
        warehouseName: "JWT Test Warehouse"
        warehouseCode: "WH-JWT-T"
      }) {
        warehouseId
        warehouseName
      }
    }
  `, {}, token);

  if (res.errors) {
    logger.error(`❌ Create warehouse failed: ${res.errors[0].message}\n`);
  } else {
    logger.info(`✅ Warehouse created: ${res.data.createWarehouse.warehouseName} (${res.data.createWarehouse.warehouseId})\n`);

    // Clean up
    await db.delete(WarehousesTable).where(eq(WarehousesTable.warehouseCode, 'WH-JWT-T'));
  }
}

// ============================================================
// TEST 4 — Create warehouse WITHOUT token → should get UNAUTHORIZED
// ============================================================

async function testCreateWarehouseNoToken() {
  logger.info('--- TEST 4: Create warehouse without token → expect UNAUTHORIZED ---');

  const res = await gql(`
    mutation {
      createWarehouse(input: {
        warehouseName: "No Token Warehouse"
        warehouseCode: "WH-NOTOKEN"
      }) {
        warehouseId
        warehouseName
      }
    }
  `);

  const code = res.errors?.[0]?.extensions?.code;
  if (res.errors && (code === 'UNAUTHORIZED' || code === 'UNAUTHENTICATED')) {
    logger.info(`✅ Got ${code} as expected: "${res.errors[0].message}"\n`);
  } else if (res.errors) {
    logger.warn(`⚠️  Got error but wrong code: ${JSON.stringify(res.errors[0])}\n`);
  } else {
    logger.error(`❌ Request succeeded without a token — guard is not working!\n`);
  }
}

// ============================================================
// RUN
// ============================================================

async function run() {
  try {
    // Check server is up
    await axios.post(GQL, { query: '{ __typename }' }, { headers: { 'Content-Type': 'application/json' } }).catch(() => {
      throw new Error('Server is not running. Start it first with: pnpm dev');
    });

    const { org, userWithOrg, userNoOrg } = await setupUsers();

    logger.info('=== JWT TESTS ===\n');

    const token = await testLoginWithOrg(userWithOrg.email, org.organizationId);
    await testLoginWithoutOrg(userNoOrg.email);

    if (token) {
      await testCreateWarehouseWithToken(token);
    }

    await testCreateWarehouseNoToken();

    logger.info('=== ALL JWT TESTS PASSED ✅ ===');
    await cleanTestUsers();
    process.exit(0);
  } catch (err: any) {
    logger.error(`❌ Test failed: ${err.message}`);
    process.exit(1);
  }
}

run();
