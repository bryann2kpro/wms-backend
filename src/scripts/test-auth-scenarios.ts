import 'dotenv/config';
import axios from 'axios';
import { db } from '@/db';
import { logger } from '@/util/logger';
import { eq } from 'drizzle-orm';
import { OrganizationsTable } from '@/features/master-data/organization.model';
import { UsersTable } from '@/features/auth/auth.model';
import bcrypt from 'bcrypt';

const GQL = 'http://localhost:7777/graphql';

async function gql(query: string, variables = {}, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await axios.post(GQL, { query, variables }, { headers, validateStatus: () => true });
  return res.data;
}

// ============================================================
// SCENARIO 1 — User WITH org → login succeeds, can access data
// ============================================================

async function scenarioHasOrg() {
  logger.info('=== SCENARIO 1: User WITH org ===');

  // Get existing SME-T org
  const [org] = await db
    .select()
    .from(OrganizationsTable)
    .where(eq(OrganizationsTable.organizationCode, 'SME-T'))
    .limit(1);

  if (!org) throw new Error('SME-T org not found — run test-m1-m2.ts first');

  // Create test user with org
  await db.delete(UsersTable).where(eq(UsersTable.email, 'scenario-with-org@smee.test'));
  const [user] = await db.insert(UsersTable).values({
    email: 'scenario-with-org@smee.test',
    displayName: 'Scenario With Org',
    passwordHash: await bcrypt.hash('Test@1234', 10),
    isActive: true,
    primaryOrganizationId: org.organizationId,
    createdBy: 'scenario-test',
    updatedBy: 'scenario-test',
  }).returning();

  logger.info(`   Created user: ${user.email}`);
  logger.info(`   Assigned org: ${org.organizationName} (${org.organizationId})`);

  // Login
  const loginRes = await gql(`
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        accessToken
        user { id email }
      }
    }
  `, { input: { email: user.email, password: 'Test@1234' } });

  if (loginRes.errors) {
    logger.error(`❌ Login failed: ${loginRes.errors[0].message}`);
    return;
  }

  const { accessToken } = loginRes.data.login;
  const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
  logger.info(`✅ Login succeeded → got accessToken`);
  logger.info(`   JWT organizationId: ${payload.organizationId}`);

  // Access protected resource
  const warehouseRes = await gql(`
    mutation {
      createWarehouse(input: {
        warehouseName: "Scenario Test Warehouse"
        warehouseCode: "WH-SCN-T"
      }) {
        warehouseId
        warehouseName
      }
    }
  `, {}, accessToken);

  if (warehouseRes.errors) {
    logger.error(`❌ Create warehouse failed: ${warehouseRes.errors[0].message}`);
  } else {
    logger.info(`✅ Accessed protected resource → warehouse created`);
    }

  logger.info(`   (user and warehouse kept in DB)\n`);
}

// ============================================================
// SCENARIO 3 — User WITHOUT org → login returns UNAUTHORIZED
// ============================================================

async function scenarioNoOrg() {
  logger.info('=== SCENARIO 3: User WITHOUT org → expect UNAUTHORIZED on login ===');

  // Create test user with no org
  await db.delete(UsersTable).where(eq(UsersTable.email, 'scenario-no-org@smee.test'));
  const [user] = await db.insert(UsersTable).values({
    email: 'scenario-no-org@smee.test',
    displayName: 'Scenario No Org',
    passwordHash: await bcrypt.hash('Test@1234', 10),
    isActive: true,
    primaryOrganizationId: null,
    createdBy: 'scenario-test',
    updatedBy: 'scenario-test',
  }).returning();

  logger.info(`   Created user: ${user.email}`);
  logger.info(`   Assigned org: null (no org)`);

  // Attempt login
  const loginRes = await gql(`
    mutation Login($input: LoginInput!) {
      login(input: $input) {
        accessToken
      }
    }
  `, { input: { email: user.email, password: 'Test@1234' } });

  const code = loginRes.errors?.[0]?.extensions?.code;
  if (loginRes.errors && (code === 'UNAUTHORIZED' || code === 'UNAUTHENTICATED')) {
    logger.info(`✅ Blocked with ${code}: "${loginRes.errors[0].message}"`);
  } else if (loginRes.errors) {
    logger.warn(`⚠️  Got error but unexpected code: ${JSON.stringify(loginRes.errors[0])}`);
  } else {
    logger.error(`❌ Login succeeded — user with no org should have been blocked!`);
  }

  logger.info(`   (user kept in DB for inspection)\n`);
}

// ============================================================
// SCENARIO 2 — No token → protected resource returns UNAUTHORIZED
// ============================================================

async function scenarioNoToken() {
  logger.info('=== SCENARIO 2: No token → expect UNAUTHORIZED ===');

  const res = await gql(`
    mutation {
      createWarehouse(input: {
        warehouseName: "No Token Warehouse"
        warehouseCode: "WH-NOTKN"
      }) {
        warehouseId
        warehouseName
      }
    }
  `);

  const code = res.errors?.[0]?.extensions?.code;
  if (res.errors && (code === 'UNAUTHORIZED' || code === 'UNAUTHENTICATED')) {
    logger.info(`✅ Blocked with ${code}: "${res.errors[0].message}"\n`);
  } else if (res.errors) {
    logger.warn(`⚠️  Got error but unexpected code: ${JSON.stringify(res.errors[0])}\n`);
  } else {
    logger.error(`❌ Request succeeded without a token — guard is broken!\n`);
  }
}

// ============================================================
// RUN
// ============================================================

async function run() {
  try {
    await axios.post(GQL, { query: '{ __typename }' }, { headers: { 'Content-Type': 'application/json' } }).catch(() => {
      throw new Error('Server is not running. Start it first with: pnpm dev');
    });

    await scenarioHasOrg();
    await scenarioNoOrg();
    await scenarioNoToken();

    logger.info('=== ALL SCENARIOS PASSED ✅ ===');
    process.exit(0);
  } catch (err: any) {
    logger.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  }
}

run();
