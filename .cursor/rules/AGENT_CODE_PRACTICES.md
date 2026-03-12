---
description: "Backend code practices: TypeScript, Express, GraphQL, Drizzle, DataLoader, repositories, helpers in util; confirm with user when unclear."
globs: ["**/*.ts", "**/src/**"]
alwaysApply: false
---

# Backend Code Practices

When writing or modifying backend code, follow these practices. For general workflow (confirm before changing, reuse helpers, prefer granular modules), align with the frontend code practices where applicable.

## Before modifying

- **When something is unclear** (requirements, scope, existing behavior, or conflicting patterns): confirm with the user before making changes. Do not assume; ask for clarification when needed.

## Helpers & utilities

- **Before adding a new helper:** Search the codebase (especially `@/util` and feature folders) for existing helpers that already do the job. Reuse or extend them instead of duplicating.
- Put new helper functions in the appropriate place: shared utilities in `@/util/*` (e.g. `@/util/pagination`, `@/util/logger`), feature-specific helpers in the feature folder (e.g. `@/features/outbound/*`). Do not scatter one-off helpers inside resolvers or controllers.

## Structure & layers

- **Feature-based layout:** Keep code under `@/features/<domain>/` (e.g. `outbound`, `auth`, `master-data`). Each feature can have `*.model`, `*.repository`, `*.resolvers`, `*.typeDefs`, `*.services`, etc.
- **Composition root:** Wire all dependencies in `@/composition-root`. Create repositories, services, and controllers there; do not instantiate them inside resolvers or routes. Use the root’s exports for DI.
- **Prefer granular modules** over large “big bang” files. Split by responsibility (e.g. separate repository, resolvers, services, models) so each file stays focused and testable.
- Use the `@/` path alias for imports (`@/composition-root`, `@/graphql/context`, `@/util/*`, `@/features/*`).

## Data access & GraphQL

- **Repositories:** Data access lives in `*RepositoryClass` in `@/features/<domain>/*.repository.ts`. Use Drizzle for DB; accept optional `DbTransaction` for multi-step writes. Return domain types from the model layer.
- **Resolvers:** Keep resolvers thin. Parse and validate input with Zod; call repositories or services from composition root; use context for auth and DataLoaders. Do not put business logic or raw DB logic inside resolvers—push that to services or repositories.
- **GraphQL nested fields (e.g. `PurchaseOrder.outlet`, `Outlet.region`):** Use **DataLoader** to batch lookups per request and avoid N+1. Create loaders in `@/graphql/context.ts` (one instance per request); resolve nested fields by calling `context.getOutletLoader().load(parent.outletId)` (or equivalent). See `@/features/outbound/outbound.resolvers.ts` and `@/graphql/context.ts` for the pattern.
- **Context:** Use `GraphQLContext` for auth (`user`, `userPermissions`, `isSuperAdmin`), request-scoped DataLoaders (`getOutletLoader`, `getRegionLoader`), and optional transaction (`tx`). Use helpers like `hasPermission`, `isAuthenticated`, `withAuditTrail` from context where applicable.

## Validation & types

- Use **Zod** for parsing and sanitizing GraphQL (and API) inputs. Define schemas in the feature module (e.g. in resolvers or a dedicated `*.schema.ts`); transform to domain types before calling repositories or services.
- Use explicit TypeScript types for repository methods, resolver args, and context. Prefer `interface` for object shapes; use `import type` when importing only types.

## What to avoid

- Putting business or data-access logic directly in resolvers instead of services/repositories.
- Resolving GraphQL nested relations with one query per parent (N+1). Use DataLoader for batched lookups.
- Creating new repository or service instances inside resolvers; use instances from composition root.
- Scattering one-off helpers in resolvers or controllers; add them to `@/util` or the feature folder.
- Skipping input validation (Zod) on resolver arguments or mutations.
