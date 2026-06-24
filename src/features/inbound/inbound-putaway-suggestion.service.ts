/**
 * Suggests a rack for inbound (GRN) putaway:
 * 1. Default rack from m_pick_face_strategies (storage_bin_id)
 * 2. Capacity check using m_racks + m_skus dimensions and stock_quant occupancy
 * 3. Fallback to an empty rack when the default is full
 */

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/types/db-transaction";
import { PickFaceStrategyRepositoryClass } from "../master-data/pick-face-strategy.repository";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import { RacksRepositoryClass } from "../master-data/racks.repository";
import { StockQuantRepositoryClass } from "../stock-quant/stock-quant.repository";
import { GrnsTable, GrnItemsTable, GrnItemRacksTable } from "./grns.model";
import { SkuTable } from "../master-data/sku.model";
import {
  capacityForSkuOnRack,
  maxCasesForSkuInRack,
  rackHasCapacityForIncomingSku,
  rackHasCapacityForQty,
  computeRackUsage,
  type RackOccupant,
  type SkuCaseDimensions,
} from "./rack-capacity.util";

export type InboundRackSuggestionSource = "DEFAULT" | "FALLBACK_EMPTY" | "NONE";

export type InboundPutawayAllocationSource =
  | "DEFAULT"
  | "UNASSIGNED_EMPTY"
  | "FALLBACK";

export type InboundPutawayAllocation = {
  rackId: string;
  rackLabel: string;
  quantity: number;
  maxCapacity: number | null;
  availableCapacity: number | null;
  source: InboundPutawayAllocationSource;
};

export type InboundPutawayPlan = {
  allocations: InboundPutawayAllocation[];
  totalAllocated: number;
  remainingQty: number;
  message: string | null;
  defaultRackId: string | null;
  capacityForRack: RackSkuCapacity | null;
};

export type RackSkuCapacity = {
  rackId: string;
  maxCapacity: number | null;
  currentQuantity: number;
  availableCapacity: number | null;
};

export type RackCapacityOption = {
  rackId: string;
  rackRow: string;
  rackLevel: string;
  rackColumn: string;
  availableCapacity: number | null;
};

export type ListRacksWithCapacityInput = {
  organizationId: string;
  skuId?: string | null;
  skuCode?: string | null;
  quantity: number;
  excludeRackIds?: string[] | null;
};

export type InboundRackSuggestion = {
  rackId: string | null;
  rackLabel: string | null;
  source: InboundRackSuggestionSource;
  defaultRackId: string | null;
  isDefaultFull: boolean;
  maxCapacity: number | null;
  currentQuantity: number | null;
  availableCapacity: number | null;
  message: string | null;
  capacityForRack: RackSkuCapacity | null;
};

export type SuggestInboundRackInput = {
  organizationId: string;
  skuId?: string | null;
  skuCode?: string | null;
  quantity: number;
  /** When set, response includes capacity for this rack (selected bin). */
  forRackId?: string | null;
  /** Rack IDs already assigned to other SKUs in the same form session — excluded from suggestion. */
  excludeRackIds?: string[] | null;
};

type PutawayRack = {
  rackId: string;
  rackRow: string;
  rackColumn: string;
  rackLevel: string;
  length: string | null;
  width: string | null;
  height: string | null;
  weight: string | null;
};

type CommittedOccupantRow = {
  quantity: number;
  caseExtLengthMm: string | null;
  caseExtWidthMm: string | null;
  caseExtHeightMm: string | null;
  caseGrossWeightKg: string | null;
  casesPerLayer: string | null;
  noOfLayers: string | null;
};

/** Preloaded racks + occupancy — avoids per-rack DB round-trips during allocation. */
type PutawayContext = {
  committedByRack: Map<string, CommittedOccupantRow[]>;
  pendingByRack: Map<string, RackOccupant[]>;
  racksById: Map<string, PutawayRack>;
  sortedActiveRacks: PutawayRack[];
  occupiedRackIds: Set<string>;
  pickFaceBinIds: Set<string>;
};

type ResolvedSku = NonNullable<Awaited<ReturnType<InboundPutawaySuggestionService["resolveSku"]>>>;

export class InboundPutawaySuggestionService {
  constructor(
    private readonly pickFaceStrategyRepository: PickFaceStrategyRepositoryClass,
    private readonly skuRepository: SkuRepositoryClass,
    private readonly racksRepository: RacksRepositoryClass,
    private readonly stockQuantRepository: StockQuantRepositoryClass,
  ) {}

  async suggestRack(
    input: SuggestInboundRackInput,
    tx?: DbTransaction,
  ): Promise<InboundRackSuggestion> {
    const { organizationId, quantity } = input;
    const incomingQty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

    const sku = await this.resolveSku(input, organizationId, tx);
    if (!sku) {
      return emptySuggestion(null, "SKU not found — cannot suggest a rack.");
    }

    const strategy = await this.pickFaceStrategyRepository.getActiveBySkuId(
      sku.skuId,
      organizationId,
      tx,
    );
    const defaultRackId = strategy?.storageBinId ?? null;

    const ctx = await this.buildPutawayContext(organizationId, tx, [
      input.forRackId,
      defaultRackId,
    ].filter(Boolean) as string[]);

    const capacityForRack = input.forRackId
      ? this.getRackSkuCapacityFromContext(ctx, input.forRackId, sku)
      : null;

    if (!defaultRackId) {
      const fallback = this.findEmptyRackWithCapacityFromContext(
        ctx,
        sku,
        incomingQty,
        null,
      );
      if (fallback) {
        return {
          rackId: fallback.rackId,
          rackLabel: fallback.rackLabel,
          source: "FALLBACK_EMPTY",
          defaultRackId: null,
          isDefaultFull: false,
          maxCapacity: fallback.maxCapacity,
          currentQuantity: 0,
          availableCapacity: fallback.availableCapacity,
          message: "No pick-face strategy configured; suggested an empty rack.",
          capacityForRack,
        };
      }
      return emptySuggestion(null, "No default rack configured for this SKU.", capacityForRack);
    }

    const defaultRack = ctx.racksById.get(defaultRackId);
    if (!defaultRack) {
      return emptySuggestion(
        defaultRackId,
        "Default rack from pick-face strategy was not found.",
        capacityForRack,
      );
    }

    const defaultOccupants = this.occupantsFromContext(ctx, defaultRackId);
    const defaultCapacity = capacityForSkuOnRack(defaultRack, sku, defaultOccupants);
    const defaultLabel = formatRackLabel(defaultRack);

    const defaultFits = rackHasCapacityForIncomingSku(
      defaultRack,
      sku,
      defaultOccupants,
      incomingQty,
    );
    if (defaultFits) {
      return {
        rackId: defaultRackId,
        rackLabel: defaultLabel,
        source: "DEFAULT",
        defaultRackId,
        isDefaultFull: false,
        maxCapacity: defaultCapacity.maxCapacity,
        currentQuantity: defaultCapacity.currentQuantity,
        availableCapacity: defaultCapacity.availableCapacity,
        message: "Default pick-face rack has available capacity.",
        capacityForRack,
      };
    }

    const fallback = this.findEmptyRackWithCapacityFromContext(
      ctx,
      sku,
      incomingQty,
      defaultRackId,
    );
    if (fallback) {
      return {
        rackId: fallback.rackId,
        rackLabel: fallback.rackLabel,
        source: "FALLBACK_EMPTY",
        defaultRackId,
        isDefaultFull: true,
        maxCapacity: fallback.maxCapacity,
        currentQuantity: 0,
        availableCapacity: fallback.availableCapacity,
        message: "Default rack is at capacity; suggested an empty rack.",
        capacityForRack,
      };
    }

    return {
      rackId: defaultRackId,
      rackLabel: defaultLabel,
      source: "DEFAULT",
      defaultRackId,
      isDefaultFull: true,
      maxCapacity: defaultCapacity.maxCapacity,
      currentQuantity: defaultCapacity.currentQuantity,
      availableCapacity: defaultCapacity.availableCapacity,
      message:
        "Default rack is at capacity and no suitable empty rack was found. Review manually.",
      capacityForRack,
    };
  }

  async suggestPutawayPlan(
    input: SuggestInboundRackInput,
    tx?: DbTransaction,
  ): Promise<InboundPutawayPlan> {
    const { organizationId } = input;
    const incomingQty = Number.isFinite(input.quantity) && input.quantity > 0
      ? input.quantity
      : 0;

    const sku = await this.resolveSku(input, organizationId, tx);
    if (!sku) {
      return emptyPutawayPlan(null, "SKU not found — cannot suggest racks.");
    }

    const strategy = await this.pickFaceStrategyRepository.getActiveBySkuId(
      sku.skuId,
      organizationId,
      tx,
    );
    const defaultRackId = strategy?.storageBinId ?? null;

    const ctx = await this.buildPutawayContext(organizationId, tx, [
      input.forRackId,
      defaultRackId,
    ].filter(Boolean) as string[]);

    const capacityForRack = input.forRackId
      ? this.getRackSkuCapacityFromContext(ctx, input.forRackId, sku)
      : null;

    if (incomingQty <= 0) {
      return {
        allocations: [],
        totalAllocated: 0,
        remainingQty: 0,
        message: "Enter a quantity to suggest rack locations.",
        defaultRackId: null,
        capacityForRack,
      };
    }

    const pickFaceBinIds = ctx.pickFaceBinIds;

    const allocations: InboundPutawayAllocation[] = [];
    const usedRackIds = new Set<string>(input.excludeRackIds?.filter(Boolean) ?? []);
    let remaining = incomingQty;

    if (defaultRackId) {
      remaining = this.allocateFromRackInMemory(
        ctx,
        sku,
        defaultRackId,
        remaining,
        usedRackIds,
        allocations,
        "DEFAULT",
      );
    }

    if (remaining > 0) {
      const unassignedEmpty = this.filterCandidateRacks(ctx, usedRackIds, {
        emptyOnly: true,
        excludePickFaceBins: true,
        pickFaceBinIds,
      });
      remaining = this.allocateAcrossRacksInMemory(
        ctx,
        sku,
        remaining,
        usedRackIds,
        allocations,
        unassignedEmpty,
        "UNASSIGNED_EMPTY",
      );
    }

    if (remaining > 0) {
      const fallbackRacks = this.filterCandidateRacks(ctx, usedRackIds, {
        emptyOnly: false,
        excludePickFaceBins: false,
        pickFaceBinIds,
      });
      remaining = this.allocateAcrossRacksInMemory(
        ctx,
        sku,
        remaining,
        usedRackIds,
        allocations,
        fallbackRacks,
        "FALLBACK",
      );
    }

    const totalAllocated = roundAllocated(incomingQty - remaining);
    let message: string | null = null;
    if (allocations.length === 0) {
      message = defaultRackId
        ? "No rack with available capacity was found. Review manually."
        : "No pick-face strategy configured and no suitable rack was found.";
    } else if (remaining > 0) {
      message = `Allocated ${totalAllocated} of ${incomingQty} CTN across ${allocations.length} rack(s). ${remaining} CTN still need a location.`;
    } else if (allocations.length === 1) {
      message =
        allocations[0].source === "DEFAULT"
          ? "Default pick-face rack has available capacity."
          : "Suggested rack location for putaway.";
    } else {
      message = `Split across ${allocations.length} rack locations based on capacity.`;
    }

    return {
      allocations,
      totalAllocated,
      remainingQty: remaining,
      message,
      defaultRackId,
      capacityForRack,
    };
  }

  private availableQtyForAllocation(
    capacity: {
      maxCapacity: number | null;
      currentQuantity: number;
      availableCapacity: number | null;
    },
    remaining: number,
    totalCartonsOnRack: number,
  ): number {
    if (capacity.availableCapacity != null) {
      return Math.max(0, capacity.availableCapacity);
    }
    if (capacity.maxCapacity != null) {
      return Math.max(0, capacity.maxCapacity - capacity.currentQuantity);
    }
    // Capacity model unknown — only empty racks are eligible.
    if (totalCartonsOnRack > 0) return 0;
    return remaining > 0 ? remaining : 0;
  }

  private toPutawayRack(rack: {
    rackId: string;
    rackRow?: string | null;
    rackColumn?: string | null;
    rackLevel?: string | null;
    length?: string | null;
    width?: string | null;
    height?: string | null;
    weight?: string | null;
  }): PutawayRack {
    return {
      rackId: rack.rackId,
      rackRow: rack.rackRow ?? "",
      rackColumn: rack.rackColumn ?? "",
      rackLevel: rack.rackLevel ?? "",
      length: rack.length ?? null,
      width: rack.width ?? null,
      height: rack.height ?? null,
      weight: rack.weight ?? null,
    };
  }

  private async buildPutawayContext(
    organizationId: string,
    tx?: DbTransaction,
    includeRackIds: string[] = [],
  ): Promise<PutawayContext> {
    const [committedByRack, pendingByRack, sortedActiveRacks, pickFaceBinIds] =
      await Promise.all([
        this.stockQuantRepository.listAllRackOccupancy(organizationId, tx),
        this.fetchPendingGrnOccupants(organizationId, tx),
        this.racksRepository.listActiveRacksForPutaway(organizationId, tx),
        this.pickFaceStrategyRepository.listStorageBinIds(organizationId, tx),
      ]);

    const racksById = new Map(
      sortedActiveRacks.map((rack) => [rack.rackId, rack] as const),
    );

    const mustInclude = new Set<string>([
      ...includeRackIds.filter(Boolean),
      ...pickFaceBinIds,
    ]);
    const missingIds = [...mustInclude].filter((id) => !racksById.has(id));
    if (missingIds.length > 0) {
      const extraRacks = await this.racksRepository.getRack(
        { rackId: missingIds },
        { pageSize: missingIds.length, pageNumber: 1 },
        organizationId,
      );
      for (const rack of extraRacks.query ?? []) {
        if (!rack?.rackId || racksById.has(rack.rackId)) continue;
        const putawayRack = this.toPutawayRack(rack);
        racksById.set(putawayRack.rackId, putawayRack);
        sortedActiveRacks.push(putawayRack);
      }
    }

    const occupiedRackIds = new Set<string>(committedByRack.keys());
    for (const rackId of pendingByRack.keys()) {
      occupiedRackIds.add(rackId);
    }

    return {
      committedByRack,
      pendingByRack,
      racksById,
      sortedActiveRacks,
      occupiedRackIds,
      pickFaceBinIds,
    };
  }

  private occupantsFromContext(ctx: PutawayContext, rackId: string): RackOccupant[] {
    const committed = (ctx.committedByRack.get(rackId) ?? []).map((row) => ({
      quantity: row.quantity,
      sku: toSkuCaseDimensions(row),
    }));
    const pending = ctx.pendingByRack.get(rackId) ?? [];
    return pending.length > 0 ? [...committed, ...pending] : committed;
  }

  private getRackSkuCapacityFromContext(
    ctx: PutawayContext,
    rackId: string,
    sku: ResolvedSku,
  ): RackSkuCapacity | null {
    const rack = ctx.racksById.get(rackId);
    if (!rack) return null;

    const capacity = capacityForSkuOnRack(rack, sku, this.occupantsFromContext(ctx, rackId));
    return {
      rackId,
      maxCapacity: capacity.maxCapacity,
      currentQuantity: capacity.currentQuantity,
      availableCapacity: capacity.availableCapacity,
    };
  }

  private allocateFromRackInMemory(
    ctx: PutawayContext,
    sku: ResolvedSku,
    rackId: string,
    remaining: number,
    usedRackIds: Set<string>,
    allocations: InboundPutawayAllocation[],
    source: InboundPutawayAllocationSource,
  ): number {
    if (remaining <= 0 || usedRackIds.has(rackId)) return remaining;

    const rack = ctx.racksById.get(rackId);
    if (!rack) return remaining;

    const occupants = this.occupantsFromContext(ctx, rackId);
    const capacity = capacityForSkuOnRack(rack, sku, occupants);
    const totalCartons = computeRackUsage(occupants).totalCartons;
    const available = this.availableQtyForAllocation(capacity, remaining, totalCartons);
    if (available <= 0) return remaining;

    const take = Math.min(remaining, available);
    if (take <= 0) return remaining;

    allocations.push({
      rackId,
      rackLabel: formatRackLabel(rack),
      quantity: take,
      maxCapacity: capacity.maxCapacity,
      availableCapacity: capacity.availableCapacity,
      source,
    });
    usedRackIds.add(rackId);
    return roundAllocated(remaining - take);
  }

  private allocateAcrossRacksInMemory(
    ctx: PutawayContext,
    sku: ResolvedSku,
    remaining: number,
    usedRackIds: Set<string>,
    allocations: InboundPutawayAllocation[],
    racks: PutawayRack[],
    source: InboundPutawayAllocationSource,
  ): number {
    let left = remaining;
    for (const rack of racks) {
      if (left <= 0) break;
      if (!rack?.rackId || usedRackIds.has(rack.rackId)) continue;
      left = this.allocateFromRackInMemory(
        ctx,
        sku,
        rack.rackId,
        left,
        usedRackIds,
        allocations,
        source,
      );
    }
    return left;
  }

  private filterCandidateRacks(
    ctx: PutawayContext,
    usedRackIds: Set<string>,
    options: {
      emptyOnly: boolean;
      excludePickFaceBins: boolean;
      pickFaceBinIds: Set<string>;
    },
  ): PutawayRack[] {
    return ctx.sortedActiveRacks.filter((rack) => {
      if (!rack.rackId || usedRackIds.has(rack.rackId)) return false;
      if (options.emptyOnly && ctx.occupiedRackIds.has(rack.rackId)) return false;
      if (options.excludePickFaceBins && options.pickFaceBinIds.has(rack.rackId)) {
        return false;
      }
      return true;
    });
  }

  async getRackSkuCapacity(
    organizationId: string,
    rackId: string,
    sku: {
      skuId: string;
      caseExtLengthMm?: string | null;
      caseExtWidthMm?: string | null;
      caseExtHeightMm?: string | null;
      caseGrossWeightKg?: string | null;
      casesPerLayer?: string | null;
      noOfLayers?: string | null;
    },
    _pendingByRack?: Map<string, RackOccupant[]>,
    tx?: DbTransaction,
  ): Promise<RackSkuCapacity | null> {
    const ctx = await this.buildPutawayContext(organizationId, tx, [rackId]);
    return this.getRackSkuCapacityFromContext(ctx, rackId, sku as ResolvedSku);
  }

  private async fetchPendingGrnOccupants(
    organizationId: string,
    tx?: DbTransaction,
  ): Promise<Map<string, RackOccupant[]>> {
    const client = tx ?? db;
    const rows = await client
      .select({
        rackId: GrnItemRacksTable.rackId,
        qty: GrnItemsTable.qty,
        lossQty: GrnItemsTable.lossQty,
        caseExtLengthMm: SkuTable.caseExtLengthMm,
        caseExtWidthMm: SkuTable.caseExtWidthMm,
        caseExtHeightMm: SkuTable.caseExtHeightMm,
        caseGrossWeightKg: SkuTable.caseGrossWeightKg,
        casesPerLayer: SkuTable.casesPerLayer,
        noOfLayers: SkuTable.noOfLayers,
      })
      .from(GrnItemRacksTable)
      .innerJoin(GrnItemsTable, eq(GrnItemRacksTable.grnItemId, GrnItemsTable.id))
      .innerJoin(GrnsTable, eq(GrnItemsTable.grnId, GrnsTable.id))
      .innerJoin(SkuTable, eq(GrnItemsTable.skuId, SkuTable.skuId))
      .where(
        and(
          eq(GrnsTable.organizationId, organizationId),
          inArray(GrnsTable.status, ["DRAFT", "SUBMITTED", "Draft", "Submitted"]),
          gt(sql`${GrnItemsTable.qty}::numeric`, 0),
        ),
      );

    const map = new Map<string, RackOccupant[]>();
    for (const row of rows) {
      const qty = Number(row.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const occupant: RackOccupant = { quantity: qty, sku: toSkuCaseDimensions(row) };
      const existing = map.get(row.rackId);
      if (existing) {
        existing.push(occupant);
      } else {
        map.set(row.rackId, [occupant]);
      }
    }
    return map;
  }

  private async resolveSku(
    input: SuggestInboundRackInput,
    organizationId: string,
    tx?: DbTransaction,
  ) {
    if (input.skuId) {
      const byId = await this.skuRepository.getSkuById(input.skuId, tx, organizationId);
      if (byId) return byId;
    }
    if (input.skuCode) {
      const result = await this.skuRepository.getSku(
        { skuCode: input.skuCode },
        { pageSize: 1, pageNumber: 1 },
        tx,
        organizationId,
      );
      return result.query?.[0] ?? null;
    }
    return null;
  }

  private findEmptyRackWithCapacityFromContext(
    ctx: PutawayContext,
    sku: ResolvedSku,
    incomingQty: number,
    excludeRackId: string | null,
  ): {
    rackId: string;
    rackLabel: string;
    maxCapacity: number | null;
    availableCapacity: number | null;
  } | null {
    const candidates = ctx.sortedActiveRacks.filter(
      (rack) =>
        rack.rackId &&
        !ctx.committedByRack.has(rack.rackId) &&
        (!excludeRackId || rack.rackId !== excludeRackId),
    );

    for (const rack of candidates) {
      const maxCapacity = maxCasesForSkuInRack(rack, sku);
      if (rackHasCapacityForQty(maxCapacity, 0, incomingQty)) {
        return {
          rackId: rack.rackId,
          rackLabel: formatRackLabel(rack),
          maxCapacity,
          availableCapacity: maxCapacity,
        };
      }
    }

    const firstEmpty = candidates[0];
    if (firstEmpty && incomingQty <= 0) {
      return {
        rackId: firstEmpty.rackId,
        rackLabel: formatRackLabel(firstEmpty),
        maxCapacity: maxCasesForSkuInRack(firstEmpty, sku),
        availableCapacity: null,
      };
    }

    return null;
  }

  async listRacksWithCapacity(
    input: ListRacksWithCapacityInput,
    tx?: DbTransaction,
  ): Promise<RackCapacityOption[]> {
    const { organizationId } = input;
    const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
    const excluded = new Set(input.excludeRackIds?.filter(Boolean) ?? []);

    const sku = await this.resolveSku(input, organizationId, tx);
    if (!sku) return [];

    const ctx = await this.buildPutawayContext(organizationId, tx);

    const result: RackCapacityOption[] = [];
    for (const rack of ctx.sortedActiveRacks) {
      if (!rack.rackId || excluded.has(rack.rackId) || ctx.pendingByRack.has(rack.rackId)) {
        continue;
      }

      const { availableCapacity } = capacityForSkuOnRack(
        rack,
        sku,
        this.occupantsFromContext(ctx, rack.rackId),
      );
      if (availableCapacity == null || availableCapacity >= quantity) {
        result.push({
          rackId: rack.rackId,
          rackRow: rack.rackRow ?? "",
          rackLevel: rack.rackLevel ?? "",
          rackColumn: rack.rackColumn ?? "",
          availableCapacity,
        });
      }
    }

    return result.sort((a, b) =>
      formatRackLabel(a).localeCompare(formatRackLabel(b), undefined, { numeric: true }),
    );
  }
}

function toSkuCaseDimensions(row: {
  caseExtLengthMm: string | null;
  caseExtWidthMm: string | null;
  caseExtHeightMm: string | null;
  caseGrossWeightKg: string | null;
  casesPerLayer: string | null;
  noOfLayers: string | null;
}): SkuCaseDimensions {
  return {
    caseExtLengthMm: row.caseExtLengthMm,
    caseExtWidthMm: row.caseExtWidthMm,
    caseExtHeightMm: row.caseExtHeightMm,
    caseGrossWeightKg: row.caseGrossWeightKg,
    casesPerLayer: row.casesPerLayer,
    noOfLayers: row.noOfLayers,
  };
}

function formatRackLabel(rack: {
  rackRow?: string | null;
  rackLevel?: string | null;
  rackColumn?: string | null;
}): string {
  return [rack.rackRow, rack.rackLevel, rack.rackColumn]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join("-");
}

function emptySuggestion(
  defaultRackId: string | null,
  message: string,
  capacityForRack: RackSkuCapacity | null = null,
): InboundRackSuggestion {
  return {
    rackId: null,
    rackLabel: null,
    source: "NONE",
    defaultRackId,
    isDefaultFull: false,
    maxCapacity: null,
    currentQuantity: null,
    availableCapacity: null,
    message,
    capacityForRack,
  };
}

function emptyPutawayPlan(
  defaultRackId: string | null,
  message: string,
  capacityForRack: RackSkuCapacity | null = null,
): InboundPutawayPlan {
  return {
    allocations: [],
    totalAllocated: 0,
    remainingQty: 0,
    message,
    defaultRackId,
    capacityForRack,
  };
}

function roundAllocated(value: number): number {
  return Math.round(value * 1000) / 1000;
}
