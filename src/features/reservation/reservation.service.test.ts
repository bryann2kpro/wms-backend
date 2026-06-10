import { vi, describe, test, expect, beforeEach } from "vitest";

// ─── Module-level mocks ───────────────────────────────────────────────────────

vi.mock("@/db", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: object) => Promise<unknown>) => fn({})),
  },
}));

vi.mock("@/util/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { ReservationService } from "./reservation.service";
import type { ReservationRepository } from "./reservation.repository";
import type { RunningNoRepositoryClass } from "@/features/running-no/running-no.repository";

// ─── Shared mock dependencies (injected via constructor) ──────────────────────

function makeMockRepo(): ReservationRepository {
  return {
    getById: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    listActiveBySku: vi.fn(),
    adjustInventoryReservedQty: vi.fn(),
    getInventoryBalanceBySku: vi.fn(),
  } as unknown as ReservationRepository;
}

function makeMockRunningNoRepo(): RunningNoRepositoryClass {
  return {
    generateRunningNo: vi.fn().mockResolvedValue("RSV-20260609-0001"),
  } as unknown as RunningNoRepositoryClass;
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ORG = "org-1";
const USER = "user-1";
const SKU = "sku-1";
const BAL_ID = "bal-1";
const RES_ID = "res-1";

const makeBalance = (onHand: string, reserved: string) => ({
  id: BAL_ID,
  onHandQty: onHand,
  reservedQty: reserved,
});

const makeReservation = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: RES_ID,
  organizationId: ORG,
  reservationNo: "RSV-20260609-0001",
  customerCode: "ES",
  skuId: SKU,
  grnItemId: null,
  inventoryBalanceId: BAL_ID,
  qtyReserved: "50.00",
  qtyConsumed: "0.00",
  reserveStart: new Date("2026-06-01"),
  reserveEnd: new Date("2026-06-30"),
  priorityFlag: false,
  status: "ACTIVE",
  sourceType: null,
  sourceId: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: USER,
  updatedBy: null,
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ReservationService.createReservation", () => {
  let service: ReservationService;
  let mockRepo: ReturnType<typeof makeMockRepo>;
  let mockRunningNo: ReturnType<typeof makeMockRunningNoRepo>;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    mockRunningNo = makeMockRunningNoRepo();
    service = new ReservationService(mockRepo, mockRunningNo);
  });

  test("creates reservation and bumps balance when qty is available", async () => {
    (mockRepo.getInventoryBalanceBySku as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBalance("100.00", "10.00"),
    );
    (mockRepo.insert as ReturnType<typeof vi.fn>).mockResolvedValue(makeReservation());
    (mockRepo.adjustInventoryReservedQty as ReturnType<typeof vi.fn>).mockResolvedValue({
      reservedQty: "60.00",
      onHandQty: "100.00",
    });

    const result = await service.createReservation(ORG, USER, {
      customerCode: "ES",
      skuId: SKU,
      qtyReserved: 50,
      reserveStart: new Date("2026-06-01"),
      reserveEnd: new Date("2026-06-30"),
    });

    expect(result.reservationNo).toBe("RSV-20260609-0001");
    expect(mockRepo.adjustInventoryReservedQty).toHaveBeenCalledWith(
      ORG,
      BAL_ID,
      "50.00",
      expect.anything(),
    );
  });

  test("throws when requested qty exceeds available ATP", async () => {
    (mockRepo.getInventoryBalanceBySku as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBalance("100.00", "80.00"), // only 20 available
    );

    await expect(
      service.createReservation(ORG, USER, {
        customerCode: "ES",
        skuId: SKU,
        qtyReserved: 50,
        reserveStart: new Date("2026-06-01"),
        reserveEnd: new Date("2026-06-30"),
      }),
    ).rejects.toThrow("Insufficient available qty");
  });

  test("throws when qtyReserved ≤ 0", async () => {
    await expect(
      service.createReservation(ORG, USER, {
        customerCode: "ES",
        skuId: SKU,
        qtyReserved: 0,
        reserveStart: new Date("2026-06-01"),
        reserveEnd: new Date("2026-06-30"),
      }),
    ).rejects.toThrow("qtyReserved must be greater than zero");
  });

  test("throws when reserveEnd ≤ reserveStart", async () => {
    await expect(
      service.createReservation(ORG, USER, {
        customerCode: "ES",
        skuId: SKU,
        qtyReserved: 10,
        reserveStart: new Date("2026-06-30"),
        reserveEnd: new Date("2026-06-01"),
      }),
    ).rejects.toThrow("reserveEnd must be after reserveStart");
  });

  test("throws when no inventory balance exists for SKU", async () => {
    (mockRepo.getInventoryBalanceBySku as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      service.createReservation(ORG, USER, {
        customerCode: "ES",
        skuId: SKU,
        qtyReserved: 10,
        reserveStart: new Date("2026-06-01"),
        reserveEnd: new Date("2026-06-30"),
      }),
    ).rejects.toThrow("No inventory balance record found");
  });
});

describe("ReservationService.updateReservation", () => {
  let service: ReservationService;
  let mockRepo: ReturnType<typeof makeMockRepo>;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    service = new ReservationService(mockRepo, makeMockRunningNoRepo());
  });

  test("increases qty after validating headroom", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ qtyReserved: "50.00" }),
    );
    (mockRepo.getInventoryBalanceBySku as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeBalance("100.00", "50.00"),
    );
    (mockRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ qtyReserved: "80.00" }),
    );
    (mockRepo.adjustInventoryReservedQty as ReturnType<typeof vi.fn>).mockResolvedValue({
      reservedQty: "80.00",
      onHandQty: "100.00",
    });

    const result = await service.updateReservation(ORG, USER, RES_ID, {
      qtyReserved: 80,
    });

    expect(result.qtyReserved).toBe("80.00");
    expect(mockRepo.adjustInventoryReservedQty).toHaveBeenCalledWith(
      ORG,
      BAL_ID,
      "30.00",
      expect.anything(),
    );
  });

  test("decreases qty and releases delta back to ATP", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ qtyReserved: "50.00" }),
    );
    (mockRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ qtyReserved: "20.00" }),
    );
    (mockRepo.adjustInventoryReservedQty as ReturnType<typeof vi.fn>).mockResolvedValue({
      reservedQty: "20.00",
      onHandQty: "100.00",
    });

    await service.updateReservation(ORG, USER, RES_ID, { qtyReserved: 20 });

    expect(mockRepo.adjustInventoryReservedQty).toHaveBeenCalledWith(
      ORG,
      BAL_ID,
      "-30.00",
      expect.anything(),
    );
  });

  test("throws when reservation is not ACTIVE", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ status: "CANCELLED" }),
    );

    await expect(
      service.updateReservation(ORG, USER, RES_ID, { qtyReserved: 10 }),
    ).rejects.toThrow('Cannot update reservation in status "CANCELLED"');
  });

  test("throws when new qtyReserved < qtyConsumed", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ qtyReserved: "50.00", qtyConsumed: "30.00" }),
    );

    await expect(
      service.updateReservation(ORG, USER, RES_ID, { qtyReserved: 20 }),
    ).rejects.toThrow("cannot be less than already consumed qty");
  });
});

describe("ReservationService.cancelReservation", () => {
  let service: ReservationService;
  let mockRepo: ReturnType<typeof makeMockRepo>;

  beforeEach(() => {
    mockRepo = makeMockRepo();
    service = new ReservationService(mockRepo, makeMockRunningNoRepo());
  });

  test("cancels ACTIVE reservation and releases unconsumed qty", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ qtyReserved: "50.00", qtyConsumed: "20.00" }),
    );
    (mockRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ status: "CANCELLED" }),
    );
    (mockRepo.adjustInventoryReservedQty as ReturnType<typeof vi.fn>).mockResolvedValue({
      reservedQty: "0.00",
      onHandQty: "100.00",
    });

    const result = await service.cancelReservation(ORG, USER, RES_ID);

    expect(result.status).toBe("CANCELLED");
    // unconsumed = 50 - 20 = 30
    expect(mockRepo.adjustInventoryReservedQty).toHaveBeenCalledWith(
      ORG,
      BAL_ID,
      "-30.00",
      expect.anything(),
    );
  });

  test("does not adjust balance when reservation is fully consumed", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ qtyReserved: "50.00", qtyConsumed: "50.00" }),
    );
    (mockRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ status: "CANCELLED" }),
    );

    await service.cancelReservation(ORG, USER, RES_ID);

    expect(mockRepo.adjustInventoryReservedQty).not.toHaveBeenCalled();
  });

  test("throws when reservation is already CANCELLED", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeReservation({ status: "CANCELLED" }),
    );

    await expect(
      service.cancelReservation(ORG, USER, RES_ID),
    ).rejects.toThrow("already CANCELLED");
  });

  test("throws when reservation is not found", async () => {
    (mockRepo.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      service.cancelReservation(ORG, USER, RES_ID),
    ).rejects.toThrow("not found");
  });
});
