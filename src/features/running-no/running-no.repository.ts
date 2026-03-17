import { DbTransaction } from "@/types/db-transaction";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { GenerateRunningNoParams } from "./running-no.model";
import { RunningNoTable } from "./running-no.model";

/** Db or transaction client for methods that can run in or out of a transaction */
type DbClient = typeof db | DbTransaction;

export class RunningNoRepositoryClass {
  /**
   * Generate the next running number within a transaction using an atomic UPSERT,
   * and return the formatted running number string (e.g. "PI-YYYYMMDD-0001").
   *
   * Requires a `main.running_no` table with UNIQUE(scope, prefix).
   */
  async generateRunningNo(params: GenerateRunningNoParams, tx: DbClient): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dateKey = `${yyyy}${mm}${dd}`;

    const [row] = await tx
      .insert(RunningNoTable)
      .values({
        scope: params.scope,
        prefix: params.prefix,
        dateKey,
        currentValue: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [RunningNoTable.scope, RunningNoTable.prefix],
        set: {
          dateKey,
          currentValue: sql<number>`CASE
            WHEN ${RunningNoTable.dateKey} = ${dateKey}
            THEN ${RunningNoTable.currentValue} + 1
            ELSE 1
          END`,
          updatedAt: now,
        },
      })
      .returning({ currentValue: RunningNoTable.currentValue });

    if (!row) throw new Error("[RunningNoRepository.generateRunningNo] Upsert did not return a row");

    const width = params.width ?? 4;
    const suffix = String(row.currentValue).padStart(width, "0");
    return `${params.prefix}-${dateKey}-${suffix}`;
  }
}

