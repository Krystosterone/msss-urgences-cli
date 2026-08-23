import type { Region } from './types';

/**
 * Add objective, deterministic derived metrics to parsed regions:
 *  - facility.occupancyPct       = occupied/functional, as an integer % (null if functional is 0)
 *  - facility.available          = reports any live count
 *  - region.averageOccupancyPct  = mean occupancy across available facilities
 *  - facility.deltaFromRegionAvgPct = occupancy minus that region average
 *
 * Pure: returns new objects, does not mutate input. Value judgements ("lower
 * is better", rankings) deliberately live in the agent skill, not here.
 */
export function withDerivedMetrics(regions: Region[]): Region[] {
  return regions.map((region) => {
    const facilities = region.facilities.map((f) => {
      const occ =
        f.stretchersOccupied != null && f.stretchersFunctional != null && f.stretchersFunctional > 0
          ? Math.round((f.stretchersOccupied / f.stretchersFunctional) * 100)
          : null;
      return { ...f, occupancyPct: occ };
    });

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

    return { ...region, facilities: withDelta, averageOccupancyPct };
  });
}
