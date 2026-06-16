/**
 * Reservation service
 *
 * Business rules:
 *  1. createReservation — validates available qty, creates reservation row,
 *     atomically bumps inventory_balances.reserved_qty.
 *  2. updateReservation — adjusts qty/window fields; difference in qty is
 *     applied as a delta to the balance.
 *  3. cancelReservation — flips status to CANCELLED and releases the remaining
 *     unconsumed qty back to the balance.
 *  4. expireReservations — cron path for ACTIVE rows past reserveEnd.
 *
 * All stock-qty mutations run inside a single db.transaction to keep the
 * reservation table and the balance counter in sync.
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import type { PaginatedResponse, PaginationParams } from "@/features/rbac/rbac.model";
import { RunningNoRepositoryClass } from "@/features/running-no/running-no.repository";
import {
  ReservationRepository,
  type UpsertCustomerPriorityInput,
} from "./reservation.repository";
import type {
  CustomerPriorityType,
  StockReservationFilter,
  StockReservationType,
} from "./reservation.model";

// ---------- helpers ---------------------------------------------------------

function parseQty(v: string | null | undefined): number {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function toDbQty(n: number): string {
  return n.toFixed(2);
}

// ---------- input types -----------------------------------------------------

export type CreateReservationInput = {
  customerCode: string;
  skuId: string;
  grnItemId?: string | null;
  qtyReserved: number;
  reserveStart: Date;
  reserveEnd: Date;
  priorityFlag?: boolean;
  sourceType?: string | null;
  sourceId?: string | null;
  notes?: string | null;
};

export type UpdateReservationInput = {
  qtyReserved?: number;
  reserveStart?: Date;
  reserveEnd?: Date;
  priorityFlag?: boolean;
  customerCode?: string;
  grnItemId?: string | null;
  notes?: string | null;
};

export type ExpireReservationsResult = {
  scannedCount: number;
  expiredCount: number;
  errors: Array<{ reservationId: string; message: string }>;
};

// ---------- service ---------------------------------------------------------

export class ReservationService {
  private readonly repo: ReservationRepository;
  private readonly runningNoRepo: RunningNoRepositoryClass;

  constructor(
    repo: ReservationRepository = new ReservationRepository(),
    runningNoRepo: RunningNoRepositoryClass = new RunningNoRepositoryClass(),
  ) {
    this.repo = repo;
    this.runningNoRepo = runningNoRepo;
  }

  async listReservations(
    organizationId: string,
    filter: StockReservationFilter = {},
    paginationParams?: PaginationParams,
  ): Promise<PaginatedResponse<StockReservationType>> {
    return this.repo.list(organizationId, filter, paginationParams);
  }

  async createReservation(
    organizationId: string,
    userId: string,
    input: CreateReservationInput,
  ): Promise<StockReservationType> {
    if (input.qtyReserved <= 0) {
      throw new Error("qtyReserved must be greater than zero.");
    }
    if (input.reserveEnd <= input.reserveStart) {
      throw new Error("reserveEnd must be after reserveStart.");
    }

    return db.transaction(async (tx) => {
      const balance = await this.repo.getInventoryBalanceBySkuForUpdate(
        organizationId,
        input.skuId,
        tx,
      );

      if (!balance) {
        throw new Error(
          `No inventory balance record found for SKU ${input.skuId}. Ensure stock has been received before reserving.`,
        );
      }

      const onHand = parseQty(balance.onHandQty);
      const alreadyReserved = parseQty(balance.reservedQty);
      const available = onHand - alreadyReserved;

      if (input.qtyReserved > available) {
        throw new Error(
          `Insufficient available qty for SKU ${input.skuId}: requested ${input.qtyReserved}, available ${available.toFixed(2)}.`,
        );
      }

      const reservationNo = await this.runningNoRepo.generateRunningNo(
        { scope: "reservation", prefix: "RSV" },
        tx,
      );

      const reservation = await this.repo.insert(
        {
          organizationId,
          reservationNo,
          customerCode: input.customerCode,
          skuId: input.skuId,
          grnItemId: input.grnItemId ?? null,
          inventoryBalanceId: balance.id,
          qtyReserved: toDbQty(input.qtyReserved),
          qtyConsumed: "0.00",
          reserveStart: input.reserveStart,
          reserveEnd: input.reserveEnd,
          priorityFlag: input.priorityFlag ?? false,
          status: "ACTIVE",
          sourceType: input.sourceType ?? null,
          sourceId: input.sourceId ?? null,
          notes: input.notes ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
        tx,
      );

      const newBalance = await this.repo.adjustInventoryReservedQty(
        organizationId,
        balance.id,
        toDbQty(input.qtyReserved),
        tx,
      );

      if (!newBalance) {
        throw new Error("Failed to update inventory balance — balance row missing.");
      }

      logger.info(
        `[ReservationService.create] ${reservationNo} qty=${input.qtyReserved} skuId=${input.skuId}`,
      );
      return reservation;
    });
  }

  async updateReservation(
    organizationId: string,
    userId: string,
    id: string,
    input: UpdateReservationInput,
  ): Promise<StockReservationType> {
    if (
      input.reserveStart != null &&
      input.reserveEnd != null &&
      input.reserveEnd <= input.reserveStart
    ) {
      throw new Error("reserveEnd must be after reserveStart.");
    }

    return db.transaction(async (tx) => {
      const existing = await this.repo.getById(organizationId, id, tx);
      if (!existing) throw new Error(`Reservation ${id} not found.`);

      if (existing.status !== "ACTIVE") {
        throw new Error(
          `Cannot update reservation in status "${existing.status}". Only ACTIVE reservations can be modified.`,
        );
      }

      let qtyDelta = 0;

      if (input.qtyReserved != null) {
        if (input.qtyReserved <= 0) {
          throw new Error("qtyReserved must be greater than zero.");
        }

        const consumed = parseQty(existing.qtyConsumed);
        if (input.qtyReserved < consumed) {
          throw new Error(
            `New qtyReserved (${input.qtyReserved}) cannot be less than already consumed qty (${consumed}).`,
          );
        }

        qtyDelta = input.qtyReserved - parseQty(existing.qtyReserved);

        if (qtyDelta > 0) {
          const balance = await this.repo.getInventoryBalanceBySkuForUpdate(
            organizationId,
            existing.skuId,
            tx,
          );
          if (!balance) throw new Error("Inventory balance row not found.");

          const onHand = parseQty(balance.onHandQty);
          const alreadyReserved = parseQty(balance.reservedQty);
          const available = onHand - alreadyReserved;

          if (qtyDelta > available) {
            throw new Error(
              `Insufficient available qty to increase reservation: need ${qtyDelta.toFixed(2)} more, only ${available.toFixed(2)} free.`,
            );
          }
        }
      }

      const patch: Record<string, unknown> = { updatedBy: userId };

      if (input.qtyReserved != null)
        patch.qtyReserved = toDbQty(input.qtyReserved);
      if (input.reserveStart != null) patch.reserveStart = input.reserveStart;
      if (input.reserveEnd != null) patch.reserveEnd = input.reserveEnd;
      if (input.priorityFlag != null) patch.priorityFlag = input.priorityFlag;
      if (input.customerCode != null) patch.customerCode = input.customerCode;
      if ("grnItemId" in input) patch.grnItemId = input.grnItemId ?? null;
      if ("notes" in input) patch.notes = input.notes ?? null;

      const updated = await this.repo.update(organizationId, id, patch, tx);
      if (!updated) throw new Error(`Failed to update reservation ${id}.`);

      if (qtyDelta !== 0) {
        await this.repo.adjustInventoryReservedQty(
          organizationId,
          existing.inventoryBalanceId,
          toDbQty(qtyDelta),
          tx,
        );
      }

      logger.info(
        `[ReservationService.update] ${existing.reservationNo} qtyDelta=${qtyDelta}`,
      );
      return updated;
    });
  }

  async cancelReservation(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<StockReservationType> {
    return db.transaction(async (tx) => {
      const existing = await this.repo.getById(organizationId, id, tx);
      if (!existing) throw new Error(`Reservation ${id} not found.`);

      if (existing.status === "CANCELLED" || existing.status === "RELEASED") {
        throw new Error(
          `Reservation ${existing.reservationNo} is already ${existing.status}.`,
        );
      }

      const unconsumed =
        parseQty(existing.qtyReserved) - parseQty(existing.qtyConsumed);

      const cancelled = await this.repo.update(
        organizationId,
        id,
        { status: "CANCELLED", updatedBy: userId },
        tx,
      );
      if (!cancelled) throw new Error(`Failed to cancel reservation ${id}.`);

      if (unconsumed > 0) {
        await this.repo.adjustInventoryReservedQty(
          organizationId,
          existing.inventoryBalanceId,
          toDbQty(-unconsumed),
          tx,
        );
      }

      logger.info(
        `[ReservationService.cancel] ${existing.reservationNo} released=${unconsumed}`,
      );
      return cancelled;
    });
  }

  async expireReservation(
    organizationId: string,
    userId: string,
    id: string,
    asOf: Date = new Date(),
  ): Promise<StockReservationType | null> {
    return db.transaction(async (tx) => {
      const existing = await this.repo.getById(organizationId, id, tx);
      if (!existing || existing.status !== "ACTIVE") return null;
      if (existing.reserveEnd >= asOf) return null;

      const unconsumed =
        parseQty(existing.qtyReserved) - parseQty(existing.qtyConsumed);

      const expired = await this.repo.update(
        organizationId,
        id,
        { status: "EXPIRED", updatedBy: userId },
        tx,
      );
      if (!expired) return null;

      if (unconsumed > 0) {
        await this.repo.adjustInventoryReservedQty(
          organizationId,
          existing.inventoryBalanceId,
          toDbQty(-unconsumed),
          tx,
        );
      }

      logger.info(
        `[ReservationService.expire] ${existing.reservationNo} released=${unconsumed}`,
      );
      return expired;
    });
  }

  async expireReservations(
    asOf: Date = new Date(),
    organizationId?: string,
    userId = "00000000-0000-0000-0000-000000000000",
  ): Promise<ExpireReservationsResult> {
    const candidates = await this.repo.listExpiredActive(asOf, organizationId);
    const errors: Array<{ reservationId: string; message: string }> = [];
    let expiredCount = 0;

    for (const row of candidates) {
      try {
        const expired = await this.expireReservation(
          row.organizationId,
          userId,
          row.id,
          asOf,
        );
        if (expired) expiredCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ reservationId: row.id, message });
        logger.error(`[ReservationService.expireReservations] ${row.id}:`, error);
      }
    }

    return {
      scannedCount: candidates.length,
      expiredCount,
      errors,
    };
  }

  async getReservation(
    organizationId: string,
    id: string,
  ): Promise<StockReservationType | null> {
    return this.repo.getById(organizationId, id);
  }

  // ─── Customer priority ───────────────────────────────────────────────────

  async listCustomerPriorities(
    organizationId: string,
  ): Promise<CustomerPriorityType[]> {
    return this.repo.listCustomerPriorities(organizationId);
  }

  async upsertCustomerPriority(
    organizationId: string,
    userId: string,
    input: UpsertCustomerPriorityInput,
  ): Promise<CustomerPriorityType> {
    const code = input.customerCode.trim();
    if (!code) throw new Error("customerCode is required.");

    return db.transaction(async (tx) => {
      const existing = await this.repo.getCustomerPriorityByCode(
        organizationId,
        code,
        tx,
      );

      if (existing) {
        const patch: Parameters<ReservationRepository["updateCustomerPriority"]>[2] =
          { updatedBy: userId };
        if (input.customerName !== undefined) patch.customerName = input.customerName;
        if (input.isActive !== undefined) patch.isActive = input.isActive;
        if (input.notes !== undefined) patch.notes = input.notes;

        if (input.rank != null) {
          if (input.rank <= 0) throw new Error("rank must be a positive integer.");
          const peers = await this.repo.listCustomerPriorities(organizationId, tx);
          const occupant = peers.find(
            (p) => p.rank === input.rank && p.customerCode !== code,
          );
          if (occupant) {
            await this.repo.updateCustomerPriority(
              organizationId,
              occupant.customerCode,
              { rank: existing.rank, updatedBy: userId },
              tx,
            );
          }
          patch.rank = input.rank;
        }

        const updated = await this.repo.updateCustomerPriority(
          organizationId,
          code,
          patch,
          tx,
        );
        if (!updated) throw new Error(`Failed to update customer priority for ${code}.`);
        return updated;
      }

      let rank = input.rank;
      if (rank == null) {
        rank = (await this.repo.getMaxRank(organizationId, tx)) + 1;
      } else if (rank <= 0) {
        throw new Error("rank must be a positive integer.");
      }

      const peers = await this.repo.listCustomerPriorities(organizationId, tx);
      const occupant = peers.find((p) => p.rank === rank);
      if (occupant) {
        const maxRank = await this.repo.getMaxRank(organizationId, tx);
        await this.repo.updateCustomerPriority(
          organizationId,
          occupant.customerCode,
          { rank: maxRank + 1, updatedBy: userId },
          tx,
        );
      }

      return this.repo.insertCustomerPriority(
        {
          organizationId,
          customerCode: code,
          customerName: input.customerName ?? null,
          rank,
          isActive: input.isActive ?? true,
          notes: input.notes ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
        tx,
      );
    });
  }

  async reorderCustomerPriorities(
    organizationId: string,
    userId: string,
    ranking: Array<{ customerCode: string }>,
  ): Promise<CustomerPriorityType[]> {
    return db.transaction(async (tx) =>
      this.repo.reorderCustomerPriorities(organizationId, userId, ranking, tx),
    );
  }
}
