import 'dotenv/config';

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
import { exec } from "child_process";
import { initAccounts } from "./scripts/init-accounts";
import { initMasterData } from "./scripts/init-master-data";
import { startInvoicesCron } from "./features/invoicing/invoices.cron";

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

const execAsync = promisify(exec);

// Helper function to run migrations
async function runMigrations(): Promise<void> {
  try {
    await execAsync('pnpm run migrate:deploy');
    logger.info('✅ Migrations completed successfully');
  } catch (error) {
    logger.warn('⚠️  Migrations warning (might already be applied):', error);
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

ViteExpress.listen(app, Number(PORT), async () => {
  console.log(`Server is listening on port ${PORT}...`);

  try {
    if (env.NODE_ENV === 'production') {
      logger.info('🚀 Running migrations...');
      await runMigrations();
    }

    logger.info('🚀 Initializing accounts...');
    await initAccounts();
    logger.info('✅ Accounts initialized successfully');

    logger.info('🚀 Initializing master data...');
    await initMasterData();
    logger.info('✅ Master data initialized successfully');

    startInvoicesCron();
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
});