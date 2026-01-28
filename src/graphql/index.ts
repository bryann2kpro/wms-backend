/**
 * GraphQL Module Entry Point
 * 
 * @description Exports the aggregated typeDefs, resolvers, and utilities for Apollo Server.
 * 
 * @usage
 * ```typescript
 * import { typeDefs, resolvers, createContext, applyDirectives } from '@/graphql';
 * 
 * let schema = makeExecutableSchema({ typeDefs, resolvers });
 * schema = applyDirectives(schema);
 * 
 * const server = new ApolloServer({ schema, context: createContext });
 * ```
 */

export { typeDefs } from './typeDefs';
export { resolvers } from './resolvers';
export { 
  createContext, 
  type GraphQLContext, 
  hasPermission, 
  isAuthenticated,
  withAuditTrail,
  getCurrentUserId,
  AuditAction,
} from './context';
export { applyDirectives, AuthenticationError, ForbiddenError, directiveTypeDefs } from './directives';
