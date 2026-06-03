import { PaginationParams } from "../rbac/rbac.model";
import {
  StockCountSessionRepositoryClass,
  StockCountItemUpdateInput,
} from "./stock-count-session.repository";

/**
 * Stock Count Session Service
 *
 * Thin service layer that delegates to the repository.
 * Place any cross-cutting business logic here (e.g. validation before closing).
 */
export class StockCountSessionService {
  constructor(private readonly repo: StockCountSessionRepositoryClass) {}

  listSessions(organizationId: string, paginationParams: PaginationParams) {
    return this.repo.listSessions(organizationId, paginationParams);
  }

  getSession(organizationId: string, sessionId: string) {
    return this.repo.getSession(organizationId, sessionId);
  }

  getSessionItems(
    organizationId: string,
    sessionId: string,
    search: string | undefined,
    paginationParams: PaginationParams
  ) {
    return this.repo.getSessionItems(organizationId, sessionId, search, paginationParams);
  }

  createSession(organizationId: string, userId: string, name: string) {
    return this.repo.createSession(organizationId, userId, name);
  }

  updateItem(organizationId: string, itemId: string, patch: StockCountItemUpdateInput, userId?: string) {
    return this.repo.updateItem(organizationId, itemId, patch, userId);
  }

  closeSession(organizationId: string, sessionId: string, userId: string) {
    return this.repo.closeSession(organizationId, sessionId, userId);
  }

  bulkApproveReadyItems(organizationId: string, sessionId: string, userId: string) {
    return this.repo.bulkApproveReadyItems(organizationId, sessionId, userId);
  }
}
