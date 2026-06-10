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
 *
 * All three operations run inside a single db.transaction to keep the
 * reservation table and the balance counter in sync.
 */

import { db } from "@/db";
import { logger } from "@/util/logger";
import { RunningNoRepositoryClass } from "@/features/running-no/running-no.repository";
import { ReservationRepository } from "./reservation.repository";
import type { StockReservationType } from "./reservation.model";

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
      const balance = await this.repo.getInventoryBalanceBySku(
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
          const balance = await this.repo.getInventoryBalanceBySku(
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

  async getReservation(
    organizationId: string,
    id: string,
  ): Promise<StockReservationType | null> {
    return this.repo.getById(organizationId, id);
  }
}
