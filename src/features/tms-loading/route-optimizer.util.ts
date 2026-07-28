/**
 * Route Optimizer
 *
 * Nearest-neighbour greedy seed + 3-opt improvement (Haversine distance),
 * ported from TMS's waypoint-optimization.service.ts. Intentionally skips
 * TMS's step 3 (a paid Google Routes API call for traffic-aware leg
 * durations) — that's an ETA nicety, not what determines stop order.
 */

export interface RouteStop {
  doId: string;
  lat: number;
  lng: number;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function nearestNeighbour(stops: RouteStop[], depot: { lat: number; lng: number }): RouteStop[] {
  const remaining = [...stops];
  const ordered: RouteStop[] = [];
  let current: { lat: number; lng: number } = depot;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = haversineKm(current, remaining[0]);
    for (let i = 1; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0];
    ordered.push(current as RouteStop);
  }
  return ordered;
}

function threeOpt(stops: RouteStop[], depot: { lat: number; lng: number }): RouteStop[] {
  if (stops.length <= 2) return stops;

  const d = (a: { lat: number; lng: number } | null, b: { lat: number; lng: number } | null) =>
    a && b ? haversineKm(a, b) : 0;

  let route = [...stops];
  const n = route.length;
  let improved = true;

  while (improved) {
    improved = false;

    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        for (let k = j + 1; k <= n; k++) {
          const s0End = i > 0 ? route[i - 1] : depot;
          const s1Start = route[i];
          const s1End = route[j - 1];
          const s2Start = route[j];
          const s2End = route[k - 1];
          const s3Start = k < n ? route[k] : null;

          const S1 = route.slice(i, j);
          const S2 = route.slice(j, k);
          const S1r = [...S1].reverse();
          const S2r = [...S2].reverse();

          const orig = d(s0End, s1Start) + d(s1End, s2Start) + d(s2End, s3Start);

          const alts: [number, RouteStop[], RouteStop[]][] = [
            [d(s0End, s1End) + d(s1Start, s2Start) + d(s2End, s3Start), S1r, S2],
            [d(s0End, s1Start) + d(s1End, s2End) + d(s2Start, s3Start), S1, S2r],
            [d(s0End, s1End) + d(s1Start, s2End) + d(s2Start, s3Start), S1r, S2r],
            [d(s0End, s2Start) + d(s2End, s1Start) + d(s1End, s3Start), S2, S1],
            [d(s0End, s2Start) + d(s2End, s1End) + d(s1Start, s3Start), S2, S1r],
            [d(s0End, s2End) + d(s2Start, s1Start) + d(s1End, s3Start), S2r, S1],
            [d(s0End, s2End) + d(s2Start, s1End) + d(s1Start, s3Start), S2r, S1r],
          ];

          let bestCost = orig;
          let bestAlt = -1;
          for (let a = 0; a < alts.length; a++) {
            if (alts[a][0] < bestCost - 1e-10) {
              bestCost = alts[a][0];
              bestAlt = a;
            }
          }

          if (bestAlt >= 0) {
            route = [...route.slice(0, i), ...alts[bestAlt][1], ...alts[bestAlt][2], ...route.slice(k)];
            improved = true;
          }
        }
      }
    }
  }

  return route;
}

/** Returns the ordered doIds for the given stops, starting from depot. */
export function optimizeRoute(stops: RouteStop[], depot: { lat: number; lng: number }): string[] {
  if (stops.length === 0) return [];
  if (stops.length === 1) return [stops[0].doId];

  const nnOrdered = nearestNeighbour(stops, depot);
  const ordered = threeOpt(nnOrdered, depot);
  return ordered.map((s) => s.doId);
}
