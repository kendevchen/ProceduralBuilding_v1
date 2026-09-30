import type { CityModule } from "./types";

/**
 * Raised block islands: curb stone (top band + outer wall) and the sidewalk between
 * the curb stone and the lot. Every surface is disjoint from its neighbours (holes,
 * not overlaps), so nothing z-fights at any distance.
 */
export const islands: CityModule = ({ params, derived }, out) => {
  const h = params.curbHeight;
  const curb = out.get("curb");
  const walk = out.get("sidewalk");
  for (const isl of derived.islands) {
    curb.polygon(isl.curb, [isl.curbInner], h);
    curb.wall(isl.curb, 0, h);
    walk.polygon(isl.curbInner, [isl.lot], h);
  }
};
