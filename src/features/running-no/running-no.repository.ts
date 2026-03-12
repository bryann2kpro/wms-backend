import { DbTransaction } from "@/types/db-transaction";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import type { GenerateRunningNoParams } from "./running-no.model";
import { RunningNoTable } from "./running-no.model";

/** Db or transaction client for methods that can run in or out of a transaction */
type DbClient = typeof db | DbTransaction;

export class RunningNoRepository {
  /**
   * Generate the next running number within a transaction using an atomic UPSERT.
   *
   * Requires a `main.running_no` table with UNIQUE(scope, partition_key).
   */
  async generateRunningNo(params: GenerateRunningNoParams, tx: DbClient): Promise<number> {
    const now = new Date();

    const [row] = await tx
      .insert(RunningNoTable)
      .values({
        scope: params.scope,
        partitionKey: params.partitionKey,
        currentValue: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [RunningNoTable.scope, RunningNoTable.partitionKey],
        set: {
          currentValue: sql<number>`${RunningNoTable.currentValue} + 1`,
          updatedAt: now,
        },
      })
      .returning({ currentValue: RunningNoTable.currentValue });

    if (!row) throw new Error("[RunningNoRepository.generateRunningNo] Upsert did not return a row");
    return row.currentValue;
  }
}

