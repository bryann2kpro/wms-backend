/**
 * Resolve GRN line rack allocations from GraphQL / service input.
 */

import { GraphQLError } from "graphql";
import { roundQtyPutaway } from "../stock-quant/putaway/putaway-stock-move.service";

export type GrnRackAllocationInput = {
  rackId?: string | null;
  quantity: string | number;
};

export type GrnItemRackInput = {
  qty: string;
  lossQty?: string | null;
  rackId?: string | null;
  rackIds?: string[] | null;
  rackAllocations?: GrnRackAllocationInput[] | null;
  lossRackId?: string | null;
  lossRackAllocations?: GrnRackAllocationInput[] | null;
};

export type ResolvedGrnRackAllocation = {
  rackId: string;
  quantity: number;
  quantityStr: string;
};

export function grnItemNetQty(item: Pick<GrnItemRackInput, "qty">): number {
  const qty = roundQtyPutaway(Number(item.qty ?? 0));
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

export function resolveGrnItemRackAllocations(
  item: GrnItemRackInput,
): ResolvedGrnRackAllocation[] {
  const netQty = grnItemNetQty(item);
  if (netQty <= 0) return [];

  const fromAllocations = (item.rackAllocations ?? [])
    .map((row) => ({
      rackId: (row.rackId ?? "").trim(),
      quantity: roundQtyPutaway(Number(row.quantity)),
    }))
    .filter((row) => row.rackId && row.quantity > 0);

  if (fromAllocations.length > 0) {
    return fromAllocations.map((row) => ({
      rackId: row.rackId,
      quantity: row.quantity,
      quantityStr: String(row.quantity),
    }));
  }

  const rackIds = (item.rackIds ?? []).filter((id): id is string => Boolean(id?.trim()));
  if (rackIds.length === 0) {
    const single = (item.rackId ?? "").trim();
    if (single) rackIds.push(single);
  }

  if (rackIds.length === 0) return [];

  if (rackIds.length === 1) {
    return [
      {
        rackId: rackIds[0],
        quantity: netQty,
        quantityStr: String(netQty),
      },
    ];
  }

  // Legacy multi-rack without quantities: split evenly across racks.
  const perRack = roundQtyPutaway(netQty / rackIds.length);
  if (perRack <= 0) return [];

  const rows: ResolvedGrnRackAllocation[] = [];
  let allocated = 0;
  for (let i = 0; i < rackIds.length; i++) {
    const isLast = i === rackIds.length - 1;
    const qty = isLast ? roundQtyPutaway(netQty - allocated) : perRack;
    if (qty > 0) {
      rows.push({
        rackId: rackIds[i],
        quantity: qty,
        quantityStr: String(qty),
      });
      allocated = roundQtyPutaway(allocated + qty);
    }
  }
  return rows;
}

export function assertGrnItemRackAllocations(
  items: GrnItemRackInput[] | null | undefined,
): void {
  if (!items?.length) return;

  for (const item of items) {
    const netQty = grnItemNetQty(item);
    if (netQty <= 0) continue;

    const allocations = resolveGrnItemRackAllocations(item);
    if (allocations.length === 0) continue;

    const total = roundQtyPutaway(
      allocations.reduce((sum, row) => sum + row.quantity, 0),
    );
    if (total !== netQty) {
      throw new GraphQLError(
        `Rack allocation total (${total}) must equal net received quantity (${netQty}).`,
        { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } },
      );
    }

    const seen = new Set<string>();
    for (const row of allocations) {
      if (seen.has(row.rackId)) {
        throw new GraphQLError("Duplicate rack in rackAllocations for the same GRN line.", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }
      seen.add(row.rackId);
    }
  }
}

export function buildGrnItemRackRows(
  grnItemId: string,
  item: GrnItemRackInput,
): Array<{ grnItemId: string; rackId: string; quantity: string }> {
  return resolveGrnItemRackAllocations(item).map((row) => ({
    grnItemId,
    rackId: row.rackId,
    quantity: row.quantityStr,
  }));
}

export function primaryRackIdFromAllocations(
  allocations: ResolvedGrnRackAllocation[],
): string | undefined {
  return allocations[0]?.rackId;
}

export function grnItemLossQty(item: Pick<GrnItemRackInput, "lossQty">): number {
  const qty = roundQtyPutaway(Number(item.lossQty ?? 0));
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
}

/**
 * Resolve GRN line loose/loss rack allocations. Mirrors resolveGrnItemRackAllocations
 * but keyed off lossQty/lossRackAllocations/lossRackId instead of qty/rackAllocations/rackId.
 */
export function resolveGrnItemLossRackAllocations(
  item: GrnItemRackInput,
): ResolvedGrnRackAllocation[] {
  const lossQty = grnItemLossQty(item);
  if (lossQty <= 0) return [];

  const fromAllocations = (item.lossRackAllocations ?? [])
    .map((row) => ({
      rackId: (row.rackId ?? "").trim(),
      quantity: roundQtyPutaway(Number(row.quantity)),
    }))
    .filter((row) => row.rackId && row.quantity > 0);

  if (fromAllocations.length > 0) {
    return fromAllocations.map((row) => ({
      rackId: row.rackId,
      quantity: row.quantity,
      quantityStr: String(row.quantity),
    }));
  }

  const single = (item.lossRackId ?? "").trim();
  if (!single) return [];

  return [
    {
      rackId: single,
      quantity: lossQty,
      quantityStr: String(lossQty),
    },
  ];
}

export function assertGrnItemLossRackAllocations(
  items: GrnItemRackInput[] | null | undefined,
): void {
  if (!items?.length) return;

  for (const item of items) {
    const lossQty = grnItemLossQty(item);
    if (lossQty <= 0) continue;

    const allocations = resolveGrnItemLossRackAllocations(item);
    if (allocations.length === 0) continue;

    const total = roundQtyPutaway(
      allocations.reduce((sum, row) => sum + row.quantity, 0),
    );
    if (total !== lossQty) {
      throw new GraphQLError(
        `Loose/loss rack allocation total (${total}) must equal loss quantity (${lossQty}).`,
        { extensions: { code: "BAD_USER_INPUT", http: { status: 400 } } },
      );
    }

    const seen = new Set<string>();
    for (const row of allocations) {
      if (seen.has(row.rackId)) {
        throw new GraphQLError("Duplicate rack in lossRackAllocations for the same GRN line.", {
          extensions: { code: "BAD_USER_INPUT", http: { status: 400 } },
        });
      }
      seen.add(row.rackId);
    }
  }
}

export function buildGrnItemLossRackRows(
  grnItemId: string,
  item: GrnItemRackInput,
): Array<{ grnItemId: string; rackId: string; quantity: string }> {
  return resolveGrnItemLossRackAllocations(item).map((row) => ({
    grnItemId,
    rackId: row.rackId,
    quantity: row.quantityStr,
  }));
}
