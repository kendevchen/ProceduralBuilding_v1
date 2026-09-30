/**
 * Building massing: lots are cut into parcels and every parcel becomes a simple block
 * (sometimes a podium with a set-back tower). Everything happens in (u, v) of the lot's
 * corner quad, so rectangles and convex irregular quads work alike:
 *   - u runs along the longer sides (the street frontages); parcels get random
 *     frontages in [minFrontage, maxFrontage]
 *   - lots deeper than maxDepth get two back-to-back rows, each facing its own street
 *   - each parcel is inset by gap/2 and then clipped to the (rounded) lot outline, so
 *     corner buildings follow the curb and nothing ever reaches the sidewalk
 *   - the hero block keeps its hero lot free — parcels fill the front strip left and
 *     right of it and the part behind it — and the hero lot gets a placeholder block
 */
import type { CityParams, MassingParams } from "../params";
import type { RoadGraph } from "./graph";
import type { Derived } from "./derive";
import {
  bilinear, centroid, clipToPolygon, dist, dominantCorners, insetConvex, signedArea, type Bounds, type Vec2,
} from "./math2d";
import { hash01 } from "./rng";

export interface Building {
  block: number;
  /** CCW convex footprint on the lot */
  footprint: Vec2[];
  floors: number;
  /** roof height above the lot surface (m) */
  height: number;
  /** facade brightness factor */
  shade: number;
  /** podium: the footprint rises to `height`; the tower continues to the full height */
  podium?: { height: number; tower: Vec2[] };
  hero?: boolean;
}

export interface MassingPlan {
  buildings: Building[];
}

/** a (u, v) window of a lot quad, split into `rows` back-to-back rows */
interface Region {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  rows: number;
}

/** tower set-back from its podium's edge (m) */
const TOWER_SETBACK = 3;
/** smallest footprint worth building (m²) */
const MIN_AREA = 12;
const MIN_TOWER_AREA = 40;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** parcel quads of one region: rows along v, random frontages (meters) along u */
function splitRegion(Q: Vec2[], r: Region, m: MassingParams, rand: (n: number) => number): Vec2[][] {
  const lo = Math.max(1, Math.min(m.minFrontage, m.maxFrontage));
  const hi = Math.max(lo, Math.max(m.minFrontage, m.maxFrontage));
  const vs = r.rows === 2 ? [r.v0, r.v0 + (r.v1 - r.v0) * (0.5 + 0.16 * (rand(0) - 0.5)), r.v1] : [r.v0, r.v1];
  const out: Vec2[][] = [];
  for (let row = 0; row + 1 < vs.length; row++) {
    const va = vs[row];
    const vb = vs[row + 1];
    const vm = (va + vb) / 2;
    const L = dist(bilinear(Q, r.u0, vm), bilinear(Q, r.u1, vm));
    if (L <= 0) continue;
    const widths: number[] = [];
    let sum = 0;
    while (sum < L && widths.length < 200) {
      const w = lo + rand(10 + row * 400 + widths.length) * (hi - lo);
      widths.push(w);
      sum += w;
    }
    widths[widths.length - 1] -= sum - L; // trim the overshoot…
    if (widths.length > 1 && widths[widths.length - 1] < lo) widths[widths.length - 2] += widths.pop()!; // …or absorb a sliver
    let u = r.u0;
    for (const w of widths) {
      const u2 = u + (w / L) * (r.u1 - r.u0);
      out.push([bilinear(Q, u, va), bilinear(Q, u2, va), bilinear(Q, u2, vb), bilinear(Q, u, vb)]);
      u = u2;
    }
  }
  return out;
}

export function planMassing(g: RoadGraph, d: Derived, p: CityParams, bounds: Bounds): MassingPlan {
  const m = p.massing;
  const plan: MassingPlan = { buildings: [] };
  if (!m.enabled) return plan;
  const floorsLo = Math.max(1, Math.round(Math.min(m.minFloors, m.maxFloors)));
  const floorsHi = Math.max(floorsLo, Math.round(Math.max(m.minFloors, m.maxFloors)));
  const bias = Math.max(-1, Math.min(1, m.centreBias));
  const R = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2;

  for (const isl of d.islands) {
    const b = g.blocks[isl.block];
    // stable per-block randomness: keyed by layout cell, not by the traced block id
    const key = b.cell ? (b.cell[0] + 2) * 1000 + (b.cell[1] + 2) : 500000 + b.id;
    const rand = (n: number) => hash01(key * 7919 + n, p.seed + 901);

    let Q: Vec2[];
    let regions: Region[];
    const hero = d.hero && d.hero.block === b.id ? d.hero : null;
    if (hero) {
      Q = hero.blockQuad; // [SW, SE, NE, NW]: u along the front street
      // keep heroClearance free around the hero lot (converted to u / v fractions)
      const du = m.heroClearance / dist(Q[0], Q[1]);
      const dv = m.heroClearance / dist(Q[0], Q[3]);
      const v0 = Math.min(1, hero.v1 + dv);
      const backDepth = ((1 - v0) * (dist(Q[0], Q[3]) + dist(Q[1], Q[2]))) / 2;
      regions = [
        { u0: 0, u1: hero.u0 - du, v0: 0, v1: hero.v1, rows: 1 },
        { u0: hero.u1 + du, u1: 1, v0: 0, v1: hero.v1, rows: 1 },
        { u0: 0, u1: 1, v0, v1: 1, rows: backDepth > m.maxDepth ? 2 : 1 },
      ].filter(r => r.u1 > r.u0 && r.v1 > r.v0);
      if (m.heroPlaceholder) {
        plan.buildings.push({
          block: b.id, footprint: hero.quad, floors: m.heroFloors, height: m.heroFloors * m.floorHeight, shade: 1, hero: true,
        });
      }
    } else {
      const c = dominantCorners(isl.lotQuad);
      if (c.length !== 4) continue;
      const uLen = dist(c[0], c[1]) + dist(c[3], c[2]);
      const vLen = dist(c[1], c[2]) + dist(c[0], c[3]);
      Q = uLen >= vLen ? c : [c[1], c[2], c[3], c[0]]; // u along the longer sides
      regions = [{ u0: 0, u1: 1, v0: 0, v1: 1, rows: Math.min(uLen, vLen) / 2 > m.maxDepth ? 2 : 1 }];
    }

    let parcelNo = 0;
    regions.forEach((r, ri) => {
      for (const parcel of splitRegion(Q, r, m, n => rand(100000 * (ri + 1) + n))) {
        const n = parcelNo++;
        const inset = insetConvex(parcel, m.gap / 2);
        if (!inset) continue;
        const footprint = clipToPolygon(inset, isl.lot);
        if (footprint.length < 3 || signedArea(footprint) < MIN_AREA) continue;
        // random height, pulled up near the centre (bias > 0) or towards the edge (bias < 0)
        const c = centroid(footprint);
        const centre = 1 - Math.min(1, Math.hypot(c.x, c.y) / R);
        const f = clamp01(rand(1 + n * 8) * (1 - Math.abs(bias)) + Math.abs(bias) * (bias >= 0 ? centre : 1 - centre));
        const floors = floorsLo + Math.round(f * (floorsHi - floorsLo));
        let podium: Building["podium"];
        if (floors >= 6 && rand(2 + n * 8) < m.podiumChance) {
          const t = insetConvex(inset, TOWER_SETBACK);
          const tower = t ? clipToPolygon(t, footprint) : [];
          if (tower.length >= 3 && signedArea(tower) >= MIN_TOWER_AREA) {
            podium = { height: (rand(3 + n * 8) < 0.5 ? 1 : 2) * m.floorHeight, tower };
          }
        }
        plan.buildings.push({
          block: b.id, footprint, floors, height: floors * m.floorHeight, shade: 0.8 + 0.2 * rand(4 + n * 8), podium,
        });
      }
    });
  }
  return plan;
}
