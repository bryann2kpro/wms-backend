import { vi, describe, test, expect, beforeEach } from "vitest";

// ─── Module-level mocks ───────────────────────────────────────────────────────

vi.mock("@/util/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { StockTransferServiceClass } from "./stock-transfer.service";
import {
  STOCK_TRANSFER_STATUS,
  STOCK_TRANSFER_TYPE,
  type StockTransferType,
  type StockTransferItemType,
} from "./stock-transfer.model";
import { InventoryMovementType } from "@/features/inventory/inventory-movement/inventory.model";
import type { StockTransferRepositoryClass } from "./stock-transfer.repository";
import type { StockQuantRepositoryClass, StockQuantType } from "../stock-quant.repository";
import type { StockQuantTransactionRepositoryClass } from "../stock-quant-transaction/stock-quant-transaction.repository";
import type {
  InventoryMovementRepositoryClass,
  InventoryMovementsInsertType,
} from "@/features/inventory/inventory-movement/inventory.repository";
import type { RacksRepositoryClass } from "@/features/master-data/racks.repository";

// ─── Constants ────────────────────────────────────────────────────────────────

const ORG = "org-1";
const USER = "user-1";
const SKU = "sku-1";

const WH_A = "wh-a";
const WH_B = "wh-b";

const RACK_A1 = "rack-a1";
const RACK_A2 = "rack-a2";
const RACK_B1 = "rack-b1";
const RACK_UZ1 = "rack-uz1"; // unzoned
const RACK_UZ2 = "rack-uz2"; // unzoned

const QUANT_A1 = "quant-a1";

// ─── In-memory stock_quant store (proves the SUM invariant) ─────────────────────

type QuantRow = StockQuantType;

function makeQuantStore() {
  const rows = new Map<string, QuantRow>();

  const seed = (
    id: string,
    rackId: string,
    quantity: string,
    reservedQty = "0",
    overrides: Partial<QuantRow> = {},
  ): QuantRow => {
    const row = {
      id,
      skuId: SKU,
      lotNo: null,
      expiryDate: null,
      description: null,
      quantity,
      lossQty: "0",
      reservedQty,
      rackId,
      organizationId: ORG,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: USER,
      updatedBy: USER,
      ...overrides,
    } as QuantRow;
    rows.set(id, row);
    return row;
  };

  const totalOnHand = () =>
    Array.from(rows.values()).reduce(
      (sum, r) => sum + Number(r.quantity) + Number(r.lossQty ?? 0),
      0,
    );

  return { rows, seed, totalOnHand };
}

// ─── Mock repositories ──────────────────────────────────────────────────────────

function makeStockTransferRepo(store: ReturnType<typeof makeQuantStore>) {
  let headerHolder: StockTransferType | null = null;
  let itemsHolder: StockTransferItemType[] = [];

  const repo = {
    generateTransferNo: vi.fn().mockResolvedValue("TRF-20260614-0001"),

    createStockTransfer: vi.fn(async (data: Record<string, unknown>) => {
      headerHolder = {
        id: "transfer-1",
        createdAt: new Date(),
        updatedAt: new Date(),
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        ...data,
      } as StockTransferType;
      return headerHolder;
    }),

    createStockTransferItems: vi.fn(async (items: Record<string, unknown>[]) => {
      itemsHolder = items.map((it, idx) => ({
        id: `item-${idx}`,
        createdAt: new Date(),
        ...it,
      })) as StockTransferItemType[];
      return itemsHolder;
    }),

    getStockTransferById: vi.fn(async () => headerHolder),
    getStockTransferItems: vi.fn(async () => itemsHolder),

    // test helpers
    __setHeader: (h: StockTransferType) => {
      headerHolder = h;
    },
    __setItems: (i: StockTransferItemType[]) => {
      itemsHolder = i;
    },
    __getHeader: () => headerHolder,
  };

  return repo as unknown as StockTransferRepositoryClass & {
    __setHeader: (h: StockTransferType) => void;
    __setItems: (i: StockTransferItemType[]) => void;
    __getHeader: () => StockTransferType | null;
  };
}

function makeStockQuantRepo(store: ReturnType<typeof makeQuantStore>) {
  const repo = {
    getStockQuantById: vi.fn(async (_org: string, id: string) => store.rows.get(id) ?? null),

    debitStockQuantIfAvailable: vi.fn(
      async (_org: string, id: string, qty: string, _user: string, _tx?: unknown, lossQty = "0") => {
        const row = store.rows.get(id);
        if (!row) throw new Error("row not found");
        const available = Number(row.quantity) - Number(row.reservedQty);
        const availableLoss = Number(row.lossQty ?? 0);
        if (available < Number(qty) || availableLoss < Number(lossQty)) {
          throw new Error("Insufficient available stock or row not found");
        }
        const newQty = Number(row.quantity) - Number(qty);
        const newLoss = availableLoss - Number(lossQty);
        row.quantity = newQty.toFixed(2);
        row.lossQty = newLoss.toFixed(2);
        if (
          Number(row.quantity) === 0 &&
          Number(row.reservedQty) === 0 &&
          Number(row.lossQty) === 0
        ) {
          store.rows.delete(id);
        }
        return row;
      },
    ),

    creditStockQuant: vi.fn(
      async (params: { rackId: string; qty: string; lossQty?: string | null; lotNo?: string | null }) => {
        const existing = Array.from(store.rows.values()).find(
          (r) => r.rackId === params.rackId && (r.lotNo ?? null) === (params.lotNo ?? null),
        );
        if (existing) {
          existing.quantity = (Number(existing.quantity) + Number(params.qty)).toFixed(2);
          existing.lossQty = (
            Number(existing.lossQty ?? 0) + Number(params.lossQty ?? 0)
          ).toFixed(2);
          return existing;
        }
        const id = `quant-${params.rackId}-${store.rows.size}`;
        const row = {
          id,
          skuId: SKU,
          lotNo: params.lotNo ?? null,
          expiryDate: null,
          description: null,
          quantity: Number(params.qty).toFixed(2),
          lossQty: Number(params.lossQty ?? 0).toFixed(2),
          reservedQty: "0",
          rackId: params.rackId,
          organizationId: ORG,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: USER,
          updatedBy: USER,
        } as QuantRow;
        store.rows.set(id, row);
        return row;
      },
    ),
  };
  return repo as unknown as StockQuantRepositoryClass;
}

function makeStockQuantTransactionRepo() {
  return {
    createStockQuantTransaction: vi.fn(async (data: unknown) => data),
  } as unknown as StockQuantTransactionRepositoryClass;
}

function makeInventoryMovementRepo() {
  const created: InventoryMovementsInsertType[] = [];
  const repo = {
    createInventoryMovement: vi.fn(
      async (data: InventoryMovementsInsertType | InventoryMovementsInsertType[]) => {
        const arr = Array.isArray(data) ? data : [data];
        created.push(...arr);
        return data;
      },
    ),
    __created: created,
  };
  return repo as unknown as InventoryMovementRepositoryClass & {
    __created: InventoryMovementsInsertType[];
  };
}

function makeRacksRepo(rackToWarehouse: Record<string, string | null>) {
  return {
    getRackWarehouseIds: vi.fn(async (rackIds: string[]) => {
      const map = new Map<string, string | null>();
      for (const id of rackIds) {
        map.set(id, rackToWarehouse[id] ?? null);
      }
      return map;
    }),
  } as unknown as RacksRepositoryClass;
}

// A `tx` mock whose `update().set().where().returning()` chain returns the
// merged header row (mirrors patchHeaderStatus behaviour against the header).
function makeTx(transferRepo: ReturnType<typeof makeStockTransferRepo>) {
  const tx = {
    update: vi.fn(() => {
      let patch: Record<string, unknown> = {};
      const chain = {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return chain;
        }),
        where: vi.fn(() => chain),
        returning: vi.fn(async () => {
          const current = transferRepo.__getHeader();
          const merged = { ...(current ?? {}), ...patch } as StockTransferType;
          transferRepo.__setHeader(merged);
          return [merged];
        }),
      };
      return chain;
    }),
  };
  return tx as unknown as Parameters<StockTransferServiceClass["createTransferDraft"]>[1];
}

async function createAndApprove(
  ctx: ReturnType<typeof buildService>,
  input: Parameters<StockTransferServiceClass["createTransferDraft"]>[0],
) {
  const draft = await ctx.service.createTransferDraft(input, ctx.tx, USER, ORG);
  return ctx.service.approveTransfer(draft.id, ORG, USER, ctx.tx);
}

// ─── Wiring helper ──────────────────────────────────────────────────────────────

function buildService(rackToWarehouse: Record<string, string | null>) {
  const store = makeQuantStore();
  const transferRepo = makeStockTransferRepo(store);
  const quantRepo = makeStockQuantRepo(store);
  const txnRepo = makeStockQuantTransactionRepo();
  const movementRepo = makeInventoryMovementRepo();
  const racksRepo = makeRacksRepo(rackToWarehouse);
  const tx = makeTx(transferRepo);

  const service = new StockTransferServiceClass(
    transferRepo,
    quantRepo,
    txnRepo,
    movementRepo,
    racksRepo,
  );

  return { service, store, transferRepo, quantRepo, txnRepo, movementRepo, racksRepo, tx };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StockTransferService.createTransferDraft — type derivation", () => {
  test("same warehouse → BIN_TO_BIN draft", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    const result = await ctx.service.createTransferDraft(
      { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "10" }] },
      ctx.tx,
      USER,
      ORG,
    );

    expect(result.type).toBe(STOCK_TRANSFER_TYPE.BIN_TO_BIN);
    expect(result.status).toBe(STOCK_TRANSFER_STATUS.DRAFT);
  });

  test("different warehouses → WAREHOUSE_TO_WAREHOUSE draft", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_B1]: WH_B });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    const result = await ctx.service.createTransferDraft(
      { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_B1, quantity: "10" }] },
      ctx.tx,
      USER,
      ORG,
    );

    expect(result.type).toBe(STOCK_TRANSFER_TYPE.WAREHOUSE_TO_WAREHOUSE);
    expect(result.status).toBe(STOCK_TRANSFER_STATUS.DRAFT);
  });

  test("unzoned ↔ unzoned → BIN_TO_BIN draft", async () => {
    const ctx = buildService({ [RACK_UZ1]: null, [RACK_UZ2]: null });
    ctx.store.seed(QUANT_A1, RACK_UZ1, "100");

    const result = await ctx.service.createTransferDraft(
      { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_UZ2, quantity: "10" }] },
      ctx.tx,
      USER,
      ORG,
    );

    expect(result.type).toBe(STOCK_TRANSFER_TYPE.BIN_TO_BIN);
    expect(result.status).toBe(STOCK_TRANSFER_STATUS.DRAFT);
  });

  test("unzoned ↔ zoned → rejected", async () => {
    const ctx = buildService({ [RACK_UZ1]: null, [RACK_A1]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_UZ1, "100");

    await expect(
      ctx.service.createTransferDraft(
        { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A1, quantity: "10" }] },
        ctx.tx,
        USER,
        ORG,
      ),
    ).rejects.toThrow("rack has no zone/warehouse assigned");
  });
});

describe("StockTransferService — validation & guards", () => {
  test("same-rack line → validation error", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    await expect(
      ctx.service.createTransferDraft(
        { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A1, quantity: "10" }] },
        ctx.tx,
        USER,
        ORG,
      ),
    ).rejects.toThrow("Destination rack must be different");
  });

  test("non-positive qty → validation error", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    await expect(
      ctx.service.createTransferDraft(
        { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "0" }] },
        ctx.tx,
        USER,
        ORG,
      ),
    ).rejects.toThrow("At least one of quantity or loss quantity");
  });

  test("draft does not move stock", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");
    const before = ctx.store.totalOnHand();

    await ctx.service.createTransferDraft(
      { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "10" }] },
      ctx.tx,
      USER,
      ORG,
    );

    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("100");
    expect(ctx.store.totalOnHand()).toBe(before);
  });

  test("reserved-qty guard: draft rejects when available carton < qty", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100", "95");

    await expect(
      ctx.service.createTransferDraft(
        { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "10" }] },
        ctx.tx,
        USER,
        ORG,
      ),
    ).rejects.toThrow("Insufficient available carton stock");
  });
});

describe("StockTransferService.approveTransfer — B2B happy path", () => {
  test("dispatch → IN_TRANSIT writes only TRANSFER_OUT; receive → COMPLETED credits dest", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    const before = ctx.store.totalOnHand();
    const created = (ctx.movementRepo as unknown as { __created: InventoryMovementsInsertType[] }).__created;

    const dispatched = await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "30" }],
    });

    expect(dispatched.status).toBe(STOCK_TRANSFER_STATUS.IN_TRANSIT);
    expect(dispatched.receivedAt).toBeNull();
    expect(dispatched.receivedBy).toBeNull();
    // Source debited, dest NOT yet credited.
    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("70.00");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_A2)).toBe(false);
    // Only TRANSFER_OUT so far.
    expect(created.filter((m) => m.movementType === InventoryMovementType.TRANSFER_OUT)).toHaveLength(1);
    expect(created.filter((m) => m.movementType === InventoryMovementType.TRANSFER_IN)).toHaveLength(0);

    const received = await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);
    expect(received.status).toBe(STOCK_TRANSFER_STATUS.COMPLETED);
    const destRow = Array.from(ctx.store.rows.values()).find((r) => r.rackId === RACK_A2);
    expect(destRow?.quantity).toBe("30.00");
    expect(created.filter((m) => m.movementType === InventoryMovementType.TRANSFER_IN)).toHaveLength(1);
    expect(ctx.store.totalOnHand()).toBe(before);
  });
});

describe("StockTransferService — B2B receive / cancel", () => {
  test("double-receive is rejected", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "40" }],
    });

    await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);

    await expect(
      ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx),
    ).rejects.toThrow("Only in-transit transfers can be received");
  });

  test("cancel → CANCELLED re-credits SOURCE rack", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    const before = ctx.store.totalOnHand();

    await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "40" }],
    });

    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("60.00");

    const cancelled = await ctx.service.cancelTransfer(
      "transfer-1",
      ORG,
      USER,
      "changed mind",
      ctx.tx,
    );

    expect(cancelled.status).toBe(STOCK_TRANSFER_STATUS.CANCELLED);
    expect(cancelled.cancelReason).toBe("changed mind");
    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("100.00");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_A2)).toBe(false);
    expect(ctx.store.totalOnHand()).toBe(before);
  });
});

describe("StockTransferService — W2W two-leg dispatch / receive / cancel", () => {
  test("approve → AWAITING_DISPATCH (no stock move); dispatch → IN_TRANSIT debits source; receive → COMPLETED", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_B1]: WH_B });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    const created = (ctx.movementRepo as unknown as { __created: InventoryMovementsInsertType[] }).__created;
    const before = ctx.store.totalOnHand();

    const draft = await ctx.service.createTransferDraft(
      { lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_B1, quantity: "40" }] },
      ctx.tx,
      USER,
      ORG,
    );
    const approved = await ctx.service.approveTransfer(draft.id, ORG, USER, ctx.tx);

    expect(approved.status).toBe(STOCK_TRANSFER_STATUS.AWAITING_DISPATCH);
    expect(approved.dispatchedAt).toBeNull();
    // Source unchanged until dispatch.
    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("100");
    expect(created.filter((m) => m.movementType === InventoryMovementType.TRANSFER_OUT)).toHaveLength(0);
    expect(ctx.store.totalOnHand()).toBe(before);

    const dispatched = await ctx.service.dispatchTransfer("transfer-1", ORG, USER, ctx.tx);
    expect(dispatched.status).toBe(STOCK_TRANSFER_STATUS.IN_TRANSIT);
    expect(dispatched.dispatchedAt).not.toBeNull();
    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("60.00");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_B1)).toBe(false);
    expect(created.filter((m) => m.movementType === InventoryMovementType.TRANSFER_OUT)).toHaveLength(1);
    expect(created.filter((m) => m.movementType === InventoryMovementType.TRANSFER_IN)).toHaveLength(0);

    const received = await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);
    expect(received.status).toBe(STOCK_TRANSFER_STATUS.COMPLETED);
    const destRow = Array.from(ctx.store.rows.values()).find((r) => r.rackId === RACK_B1);
    expect(destRow?.quantity).toBe("40.00");
    expect(created.filter((m) => m.movementType === InventoryMovementType.TRANSFER_IN)).toHaveLength(1);
    expect(ctx.store.totalOnHand()).toBe(before);
  });

  test("cancel from AWAITING_DISPATCH → CANCELLED with no stock change", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_B1]: WH_B });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    const before = ctx.store.totalOnHand();

    await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_B1, quantity: "40" }],
    });

    expect(ctx.transferRepo.__getHeader()?.status).toBe(STOCK_TRANSFER_STATUS.AWAITING_DISPATCH);
    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("100");

    const cancelled = await ctx.service.cancelTransfer(
      "transfer-1",
      ORG,
      USER,
      "no longer needed",
      ctx.tx,
    );

    expect(cancelled.status).toBe(STOCK_TRANSFER_STATUS.CANCELLED);
    expect(cancelled.cancelReason).toBe("no longer needed");
    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("100");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_B1)).toBe(false);
    expect(ctx.store.totalOnHand()).toBe(before);
  });

  test("double-receive is rejected", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_B1]: WH_B });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_B1, quantity: "40" }],
    });
    await ctx.service.dispatchTransfer("transfer-1", ORG, USER, ctx.tx);
    await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);

    await expect(
      ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx),
    ).rejects.toThrow("Only in-transit transfers can be received");
  });

  test("cancel from IN_TRANSIT → CANCELLED re-credits SOURCE rack", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_B1]: WH_B });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    const before = ctx.store.totalOnHand();

    await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_B1, quantity: "40" }],
    });
    await ctx.service.dispatchTransfer("transfer-1", ORG, USER, ctx.tx);

    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("60.00");

    const cancelled = await ctx.service.cancelTransfer(
      "transfer-1",
      ORG,
      USER,
      "changed mind",
      ctx.tx,
    );

    expect(cancelled.status).toBe(STOCK_TRANSFER_STATUS.CANCELLED);
    expect(cancelled.cancelReason).toBe("changed mind");
    expect(ctx.store.rows.get(QUANT_A1)!.quantity).toBe("100.00");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_B1)).toBe(false);
    expect(ctx.store.totalOnHand()).toBe(before);
  });

  test("cancel after completion is rejected", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_B1]: WH_B });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_B1, quantity: "10" }],
    });
    await ctx.service.dispatchTransfer("transfer-1", ORG, USER, ctx.tx);
    await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);

    await expect(
      ctx.service.cancelTransfer("transfer-1", ORG, USER, "nope", ctx.tx),
    ).rejects.toThrow("Only in-transit or awaiting-dispatch transfers can be cancelled");
  });
});

describe("StockTransferService.createTransferDraft — duplicate lines", () => {
  test("duplicate (source,dest,sku,lot,expiry) pair → rejected", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100");

    await expect(
      ctx.service.createTransferDraft(
        {
          lines: [
            { sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "10" },
            { sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "5" },
          ],
        },
        ctx.tx,
        USER,
        ORG,
      ),
    ).rejects.toThrow("Duplicate transfer line");
  });
});

describe("StockTransferService — loose (LOSS) movement", () => {
  test("loose-only B2B: source loss -5, dest +5 after receive; carton unchanged", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "10", "0", { lossQty: "5" });

    await createAndApprove(ctx, {
      lines: [
        {
          sourceStockQuantId: QUANT_A1,
          destinationRackId: RACK_A2,
          quantity: "0",
          lossQuantity: "5",
        },
      ],
    });

    expect(ctx.store.rows.get(QUANT_A1)?.quantity).toBe("10.00");
    expect(ctx.store.rows.get(QUANT_A1)?.lossQty).toBe("0.00");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_A2)).toBe(false);

    await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);

    const dest = Array.from(ctx.store.rows.values()).find((r) => r.rackId === RACK_A2);
    expect(dest?.quantity).toBe("0.00");
    expect(dest?.lossQty).toBe("5.00");
  });

  test("carton + loose in one transfer", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "10", "0", { lossQty: "8" });

    await createAndApprove(ctx, {
      lines: [
        {
          sourceStockQuantId: QUANT_A1,
          destinationRackId: RACK_A2,
          quantity: "2",
          lossQuantity: "5",
        },
      ],
    });

    expect(ctx.store.rows.get(QUANT_A1)?.quantity).toBe("8.00");
    expect(ctx.store.rows.get(QUANT_A1)?.lossQty).toBe("3.00");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_A2)).toBe(false);

    await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);

    const dest = Array.from(ctx.store.rows.values()).find((r) => r.rackId === RACK_A2);
    expect(dest?.quantity).toBe("2.00");
    expect(dest?.lossQty).toBe("5.00");
  });

  test("insufficient loose rejects entire transfer", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "10", "0", { lossQty: "3" });

    await expect(
      createAndApprove(ctx, {
        lines: [
          {
            sourceStockQuantId: QUANT_A1,
            destinationRackId: RACK_A2,
            quantity: "0",
            lossQuantity: "5",
          },
        ],
      }),
    ).rejects.toThrow("Insufficient loose stock");
  });

  test("carton-only (loss=0) behaves as before", async () => {
    const ctx = buildService({ [RACK_A1]: WH_A, [RACK_A2]: WH_A });
    ctx.store.seed(QUANT_A1, RACK_A1, "100", "0", { lossQty: "4" });

    await createAndApprove(ctx, {
      lines: [{ sourceStockQuantId: QUANT_A1, destinationRackId: RACK_A2, quantity: "10" }],
    });

    expect(ctx.store.rows.get(QUANT_A1)?.quantity).toBe("90.00");
    expect(ctx.store.rows.get(QUANT_A1)?.lossQty).toBe("4.00");
    expect(Array.from(ctx.store.rows.values()).some((r) => r.rackId === RACK_A2)).toBe(false);

    await ctx.service.receiveTransfer("transfer-1", ORG, USER, ctx.tx);

    const dest = Array.from(ctx.store.rows.values()).find((r) => r.rackId === RACK_A2);
    expect(dest?.quantity).toBe("10.00");
    expect(dest?.lossQty).toBe("0.00");
  });
});
