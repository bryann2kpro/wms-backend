/**
 * Routes Repository
 */

import { db } from "@/db";
import { RoutesTable, RouteType, RouteInsertType } from "./routes.model";
import { eq } from "drizzle-orm";
import { logger } from "@/util/logger";

export class RoutesRepositoryClass {
  constructor() {}

  async getRoutes(): Promise<RouteType[]> {
    try {
      return await db.select().from(RoutesTable).orderBy(RoutesTable.name);
    } catch (error) {
      logger.error("❌ [RoutesRepository.getRoutes] Error:", error);
      throw error;
    }
  }

  async getRouteById(id: string): Promise<RouteType | null> {
    const [row] = await db.select().from(RoutesTable).where(eq(RoutesTable.id, id)).limit(1);
    return row ?? null;
  }

  async createRoute(data: Omit<RouteInsertType, "id" | "createdAt" | "updatedAt">): Promise<RouteType> {
    const [row] = await db
      .insert(RoutesTable)
      .values({ ...data, createdAt: new Date(), updatedAt: new Date() })
      .returning();
    return row;
  }

  async updateRoute(id: string, data: Partial<RouteInsertType>): Promise<RouteType | null> {
    const [row] = await db
      .update(RoutesTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(RoutesTable.id, id))
      .returning();
    return row ?? null;
  }

  async deleteRoute(id: string): Promise<boolean> {
    const result = await db.delete(RoutesTable).where(eq(RoutesTable.id, id)).returning();
    return result.length > 0;
  }
}
