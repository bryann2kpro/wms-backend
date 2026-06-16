import 'dotenv/config';

import http from 'node:http';
import express from "express";
import ViteExpress from "vite-express";
import path from 'path';
import helmet from 'helmet';
import cors from 'cors';
import { promisify } from "util";
import { logger } from "./util/logger";

// Apollo Server
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { typeDefs, resolvers } from '@/graphql';
import { createContext, GraphQLContext } from '@/graphql/context';
import { applyDirectives } from '@/graphql/directives';

// Router
import v1Router from "@/router/v1.js";
import { requestLoggerMiddleware } from "./middlewares/request-logger";
import { fileURLToPath } from "url";
import { env } from "./env";
import { spawn } from "child_process";
import { initAccounts } from "./scripts/init-accounts";
import { initMasterData } from "./scripts/init-master-data";
import { initTransports } from "./scripts/init-transports";
import { startInvoicesCron } from "./features/invoicing/invoices.cron";
import { startDailyOpeningStockCron } from "./features/inventory/daily-opening-stock/daily-opening-stock.cron";
import { startReservationExpiryCron } from "./features/reservation/reservation-expiry.cron";
import { startEmailNotificationWorker } from "./features/notifications/email-notification.job";
import { startWhatsAppNotificationWorker } from "./features/whatsapp/whatsapp.job";
import { whatsAppClient } from "./composition-root";
import { initSocketServer } from "@/socket/socket-server";

const app = express();

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000', 
    'http://127.0.0.1:3000',
    'https://studio.apollographql.com', // Apollo Sandbox
    'http://210.187.49.109:8001'
  ],
  credentials: true, // Allow cookies and authorization headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'], // Allow all common HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'], // Allow common headers
  optionsSuccessStatus: 200 // For legacy browser support
};

// Global middlewares
app.use(cors(corsOptions)); // Enable CORS with configuration
// Helmet with relaxed CSP for GraphQL Sandbox
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://apollo-server-landing-page.cdn.apollographql.com",
          "https://embeddable-sandbox.cdn.apollographql.com",
          "https://cdn.jsdelivr.net",
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://apollo-server-landing-page.cdn.apollographql.com",
          "https://cdn.jsdelivr.net",
        ],
        imgSrc: ["'self'", "data:", "https://apollo-server-landing-page.cdn.apollographql.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameSrc: [
          "'self'",
          "https://sandbox.embed.apollographql.com",
          "https://explorer.embed.apollographql.com",
        ],
        connectSrc: ["'self'", "https://*.apollographql.com"],
      },
    },
    crossOriginEmbedderPolicy: false, // Required for Apollo Sandbox
  })
);
app.use(requestLoggerMiddleware); // For logging requests (URL, method, IP, user agent, response time)
app.use(express.json()); // For parsing JSON request bodies
app.use(express.urlencoded({ extended: true })); // For parsing URL-encoded request bodies

// Serve static files
// Define __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

// Router
app.use('/api/v1', v1Router);

const PORT = env.PORT || 3000;

const MIGRATE_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function cleanCliOutput(value?: string): string | undefined {
  if (!value) return undefined;
  // Normalize CR updates (spinners/progress) into lines.
  let s = value.replace(/\r/g, '\n');
  // Strip ANSI escape codes (colors, cursor movement, clear line, etc.)
  s = s
    // CSI sequences: ESC [ ... <final>
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    // OSC sequences: ESC ] ... BEL or ESC \
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    // Other single-character ESC sequences
    .replace(/\x1B[@-Z\\-_]/g, '');

  // Trim and remove noisy trailing whitespace.
  s = s
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

  return s.length ? s : undefined;
}

// Helper function to run migrations
async function runMigrations(): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('pnpm', ['run', 'migrate:deploy'], {
        env: { ...process.env, CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk) => {
        stdout += String(chunk);
        if (stdout.length > MIGRATE_MAX_BUFFER_BYTES) stdout = stdout.slice(-MIGRATE_MAX_BUFFER_BYTES);
      });

      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
        if (stderr.length > MIGRATE_MAX_BUFFER_BYTES) stderr = stderr.slice(-MIGRATE_MAX_BUFFER_BYTES);
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve();
        const error = new Error(`Migration command failed with exit code ${code}`) as Error & {
          code?: number | null;
          stdout?: string;
          stderr?: string;
          cmd?: string;
        };
        error.code = code;
        error.cmd = 'pnpm run migrate:deploy';
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      });
    });
    logger.info('✅ Migrations completed successfully');
  } catch (error) {
    const e = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      cmd?: string;
    };
    logger.warn('⚠️  Migrations did not complete cleanly', {
      message: e.message,
      code: e.code,
      cmd: e.cmd,
      stdout: cleanCliOutput(e.stdout),
      stderr: cleanCliOutput(e.stderr),
    });
  }
}

// ============================================
// APOLLO SERVER SETUP
// ============================================

/**
 * Initialize Apollo Server with Express integration.
 * - Creates executable schema with directives
 * - Mounts GraphQL endpoint at /graphql
 */
async function startApolloServer(): Promise<void> {
  // Create executable schema
  let schema = makeExecutableSchema({ typeDefs, resolvers });
  
  // Apply custom directives (@auth, @requirePermission)
  schema = applyDirectives(schema);

  // Create Apollo Server
  const apolloServer = new ApolloServer<GraphQLContext>({
    schema,
    introspection: true, // Enable introspection for Apollo Sandbox
    plugins: [
      // Enable embedded Apollo Sandbox (works offline/locally)
      ApolloServerPluginLandingPageLocalDefault({
        embed: true,
        includeCookies: true,
      }),
    ],
    formatError: (formattedError) => {
      // Log full error for debugging
      logger.error('[GraphQL Error]', {
        message: formattedError.message,
        code: formattedError.extensions?.code,
        path: formattedError.path,
      });

      const rawMessage = formattedError.message;
      const path = formattedError.path as string[] | undefined;
      const firstOperation = path?.[0];

      // Replace DB/query error messages with human-readable text for the frontend
      const isDbOrQueryError =
        typeof rawMessage === 'string' &&
        (rawMessage.includes('Failed query') ||
          rawMessage.includes('insert into') ||
          rawMessage.includes('update ') ||
          rawMessage.includes('params:'));

      const operationMessages: Record<string, string> = {
        createOutlet: 'Unable to create outlet. Please check the details (e.g. outlet code or region) and try again.',
        updateOutlet: 'Unable to update outlet. Please check the details and try again.',
        assignOutletToRegion: 'Unable to assign outlet to region. Please try again.',
        createPurchaseOrder: 'Unable to create purchase order. Please check the details and try again.',
      };

      const clientMessage =
        isDbOrQueryError && firstOperation && operationMessages[firstOperation]
          ? operationMessages[firstOperation]
          : isDbOrQueryError
            ? 'Something went wrong. Please try again or contact support.'
            : rawMessage;

      return {
        message: clientMessage,
        extensions: {
          code: formattedError.extensions?.code,
        },
      };
    },
  });

  // Start Apollo Server
  await apolloServer.start();
  logger.info('🚀 Apollo Server started');

  // Mount GraphQL endpoint with Express middleware
  app.use(
    '/graphql',
    cors<cors.CorsRequest>(corsOptions),
    express.json(),
    expressMiddleware(apolloServer, {
      context: createContext,
    })
  );

  logger.info('📡 GraphQL endpoint available at /graphql');
}

// ============================================
// SERVER STARTUP
// ============================================

// Start Apollo Server before Express
await startApolloServer();

const server = http.createServer(app);
initSocketServer(server);
ViteExpress.bind(app, server);
server.listen(Number(PORT), async () => {
  console.log(`Server is listening on port ${PORT}...`);

  try {
    if (env.NODE_ENV === 'production') {
      logger.info('🚀 Running migrations...');
      await runMigrations();
    }

    if (env.NODE_ENV === 'test') {
      logger.info('🚀 Initializing accounts...');
      await initAccounts();
      logger.info('✅ Accounts initialized successfully');
  
      logger.info('🚀 Initializing master data...');
      await initMasterData();
      logger.info('✅ Master data initialized successfully');

      logger.info('🚀 Initializing transports...');
      await initTransports();
      logger.info('✅ Transports initialized successfully');
    }


    startInvoicesCron();
    startDailyOpeningStockCron();
    startReservationExpiryCron();
    startEmailNotificationWorker();
    if (env.WHATSAPP_ENABLED) {
      whatsAppClient.init();
      startWhatsAppNotificationWorker();
    }
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
});