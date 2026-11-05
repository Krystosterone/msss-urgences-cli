import type { Region, RegionTotal } from './types';

/**
 * Add objective, deterministic derived metrics to parsed regions:
 *  - facility.occupancyPct       = occupied/functional, as an integer % (null if functional is 0)
 *  - facility.available          = reports any live count
 *  - region.averageOccupancyPct  = mean occupancy across available facilities
 *  - facility.deltaFromRegionAvgPct = occupancy minus that region average
 *  - region.total.occupancyPct   = the same ratio on MSSS's "Total régional" row
 *
 * Pure: returns new objects, does not mutate input. Value judgements ("lower
 * is better", rankings) deliberately live in the agent skill, not here.
 */
function occupancy(occupied: number | null, functional: number | null): number | null {
  return occupied != null && functional != null && functional > 0 ? Math.round((occupied / functional) * 100) : null;
}

/** An aggregate row with its occupancy derived. Null stays null. */
export function withTotalOccupancy(total: RegionTotal | null | undefined): RegionTotal | null {
  return total ? { ...total, occupancyPct: occupancy(total.stretchersOccupied, total.stretchersFunctional) } : null;
}

export function withDerivedMetrics(regions: Region[]): Region[] {
  return regions.map((region) => {
    const facilities = region.facilities.map((f) => ({
      ...f,
      occupancyPct: occupancy(f.stretchersOccupied, f.stretchersFunctional),
    }));

    const occupancies = facilities
      .map((f) => f.occupancyPct)
      .filter((v): v is number => v !== null);

    const averageOccupancyPct =
      occupancies.length === 0 ? null : Math.round(occupancies.reduce((s, v) => s + v, 0) / occupancies.length);

    const withDelta = facilities.map((f) => ({
      ...f,
      deltaFromRegionAvgPct:
        f.occupancyPct === null || averageOccupancyPct === null ? null : f.occupancyPct - averageOccupancyPct,
    }));

    return { ...region, facilities: withDelta, averageOccupancyPct, total: withTotalOccupancy(region.total) };
  });
}
