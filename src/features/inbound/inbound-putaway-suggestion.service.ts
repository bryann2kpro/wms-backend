/**
 * Suggests a rack for inbound (GRN) putaway:
 * 1. Default rack from m_pick_face_strategies (storage_bin_id)
 * 2. Capacity check using m_racks + m_skus dimensions and stock_quant occupancy
 * 3. Fallback to an empty rack when the default is full
 */

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbTransaction } from "@/types/db-transaction";
import { PickFaceStrategyRepositoryClass } from "../master-data/pick-face-strategy.repository";
import { SkuRepositoryClass } from "../master-data/sku.repository";
import { RacksRepositoryClass } from "../master-data/racks.repository";
import { StockQuantRepositoryClass } from "../stock-quant/stock-quant.repository";
import { StockQuantTable } from "../stock-quant/stock-quant.model";
import {
  maxCasesForSkuInRack,
  rackHasCapacityForQty,
} from "./rack-capacity.util";

export type InboundRackSuggestionSource = "DEFAULT" | "FALLBACK_EMPTY" | "NONE";

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
};

export type SuggestInboundRackInput = {
  organizationId: string;
  skuId?: string | null;
  skuCode?: string | null;
  quantity: number;
};

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

    if (!defaultRackId) {
      const fallback = await this.findEmptyRackWithCapacity(
        organizationId,
        sku,
        incomingQty,
        null,
        tx,
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
        };
      }
      return emptySuggestion(null, "No default rack configured for this SKU.");
    }

    const defaultRack = await this.racksRepository.getRackById(
      defaultRackId,
      organizationId,
    );
    if (!defaultRack) {
      return emptySuggestion(defaultRackId, "Default rack from pick-face strategy was not found.");
    }

    const maxCapacity = maxCasesForSkuInRack(defaultRack, sku);
    const currentQty = await this.stockQuantRepository.sumQuantityByRackAndSku(
      organizationId,
      defaultRackId,
      sku.skuId,
      tx,
    );
    const availableCapacity =
      maxCapacity != null ? Math.max(0, maxCapacity - currentQty) : null;
    const defaultLabel = formatRackLabel(defaultRack);

    const defaultFits = rackHasCapacityForQty(maxCapacity, currentQty, incomingQty);
    if (defaultFits) {
      return {
        rackId: defaultRackId,
        rackLabel: defaultLabel,
        source: "DEFAULT",
        defaultRackId,
        isDefaultFull: false,
        maxCapacity,
        currentQuantity: currentQty,
        availableCapacity,
        message: "Default pick-face rack has available capacity.",
      };
    }

    const fallback = await this.findEmptyRackWithCapacity(
      organizationId,
      sku,
      incomingQty,
      defaultRackId,
      tx,
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
      };
    }

    return {
      rackId: defaultRackId,
      rackLabel: defaultLabel,
      source: "DEFAULT",
      defaultRackId,
      isDefaultFull: true,
      maxCapacity,
      currentQuantity: currentQty,
      availableCapacity,
      message:
        "Default rack is at capacity and no suitable empty rack was found. Review manually.",
    };
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

  private async findEmptyRackWithCapacity(
    organizationId: string,
    sku: {
      skuId: string;
      caseExtLengthMm?: string | null;
      caseExtWidthMm?: string | null;
      caseExtHeightMm?: string | null;
      caseGrossWeightKg?: string | null;
      casesPerLayer?: string | null;
      noOfLayers?: string | null;
    },
    incomingQty: number,
    excludeRackId: string | null,
    tx?: DbTransaction,
  ): Promise<{
    rackId: string;
    rackLabel: string;
    maxCapacity: number | null;
    availableCapacity: number | null;
  } | null> {
    const client = tx ?? db;
    const occupiedRows = await client
      .select({ rackId: StockQuantTable.rackId })
      .from(StockQuantTable)
      .where(
        and(
          eq(StockQuantTable.organizationId, organizationId),
          gt(sql`${StockQuantTable.quantity}::numeric`, 0),
        ),
      );
    const occupied = new Set(occupiedRows.map((r) => r.rackId));

    const racksResult = await this.racksRepository.getRack(
      { isActive: true },
      { pageSize: 50000, pageNumber: 1 },
      organizationId,
    );
    const candidates = (racksResult.query ?? [])
      .filter((r) => r.rackId && !occupied.has(r.rackId))
      .filter((r) => !excludeRackId || r.rackId !== excludeRackId)
      .sort((a, b) =>
        formatRackLabel(a).localeCompare(formatRackLabel(b), undefined, {
          numeric: true,
        }),
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
  };
}
