/**
 * Everything derived from graph + road classes, independent of the layout:
 *   - per block: curb line (rounded corners), curb-stone inner edge, lot outline
 *   - curb corners (fillet tangent points) and each road's setback at each node —
 *     the "intersection mouth" that crosswalks / stop lines are placed from
 *   - the hero lot (front-centre of the hero block)
 * All outlines come from ONE routine: offset each block edge inward by a per-edge
 * distance, intersect neighbouring offset lines, fillet — so any angle works.
 */
import { addScaled, bilinear, dist, dot, fillet, left, lineIntersect, normalize, sub, type Vec2 } from "./math2d";
import { otherEnd, type Block, type RoadGraph } from "./graph";
import { carriageway, type CityParams } from "../params";

/** a fillet's tangent length is capped at this fraction of the shorter adjoining edge */
const TANGENT_CLAMP = 0.45;
/** lots stop this much farther inside the map edge than the curb stone (keeps lot ⊂ sidewalk) */
const BOUNDARY_MARGIN = 1;

export interface Corner {
  block: number;
  node: number;
  /** block edges arriving at / leaving the node */
  eIn: number;
  eOut: number;
  /** sharp corner where the two curb lines meet */
  P: Vec2;
  /** fillet tangent points on eIn / eOut (= P when the corner is not rounded) */
  t1: Vec2;
  t2: Vec2;
  radius: number;
}

export interface Island {
  block: number;
  /** curb line = edge of the carriageway (CCW, rounded corners) */
  curb: Vec2[];
  /** inner edge of the curb stone */
  curbInner: Vec2[];
  /** property line; corners are rounded only where the curb radius exceeds the sidewalk */
  lot: Vec2[];
  /** sharp lot corners, one per block node — for (u, v) parametrisation */
  lotQuad: Vec2[];
}

export interface Approach {
  node: number;
  edge: number;
  /** distance from the node along the edge to the intersection mouth */
  setback: number;
}

export interface HeroLot {
  block: number;
  /** [SW, SE, NE, NW]; the front (SW → SE) faces the main road */
  quad: Vec2[];
  /** the block's lot outline with the hero lot notched out of its front edge */
  remainder: Vec2[];
  /** the hero block's sharp lot quad [SW, SE, NE, NW] and the hero lot's (u, v) range in it */
  blockQuad: Vec2[];
  u0: number;
  u1: number;
  v1: number;
}

export interface Derived {
  /** index = block id */
  islands: Island[];
  corners: Corner[];
  approaches: Approach[];
  hero: HeroLot | null;
}

interface Outline {
  points: Vec2[];
  /** points each block vertex contributes (arc samples, or the sharp corner) */
  vertexPoints: Vec2[][];
  /** sharp corner per vertex */
  sharp: Vec2[];
  corners: Omit<Corner, "block">[];
}

/**
 * Offset every edge of a CCW block inward by offsetOf(edge), intersect consecutive
 * offset lines, round each convex corner with radiusOf(eIn, eOut).
 */
function offsetOutline(g: RoadGraph, b: Block, offsetOf: (e: number) => number,
                       radiusOf: (eIn: number, eOut: number) => number): Outline {
  const m = b.nodes.length;
  const pts = b.nodes.map(n => g.nodes[n].p);
  const dirs = pts.map((p, k) => normalize(sub(pts[(k + 1) % m], p)));
  const offs = b.edges.map(offsetOf);
  const bases = pts.map((p, k) => addScaled(p, left(dirs[k]), offs[k]));

  // sharp corner at vertex k = offset line of edge k−1 ∩ offset line of edge k
  const sharp: Vec2[][] = [];
  for (let k = 0; k < m; k++) {
    const kp = (k + m - 1) % m;
    const P = lineIntersect(bases[kp], dirs[kp], bases[k], dirs[k]);
    if (P) {
      sharp.push([P]);
      continue;
    }
    // collinear edges: equal offsets share one point, different offsets jog (width change)
    const a = addScaled(pts[k], left(dirs[kp]), offs[kp]);
    const c = addScaled(pts[k], left(dirs[k]), offs[k]);
    sharp.push(dist(a, c) < 1e-6 ? [a] : [a, c]);
  }
  // usable length of each offset edge between its two sharp corners (fillet clamp)
  const lens = dirs.map((d, k) =>
    Math.max(0, dot(sub(sharp[(k + 1) % m][0], sharp[k][sharp[k].length - 1]), d)));

  const out: Outline = { points: [], vertexPoints: [], sharp: [], corners: [] };
  for (let k = 0; k < m; k++) {
    const kp = (k + m - 1) % m;
    const eIn = b.edges[kp];
    const eOut = b.edges[k];
    const sp = sharp[k];
    let vp = sp;
    let corner = { node: b.nodes[k], eIn, eOut, P: sp[0], t1: sp[0], t2: sp[sp.length - 1], radius: 0 };
    if (sp.length === 1) {
      const f = fillet(sp[0], dirs[kp], dirs[k], radiusOf(eIn, eOut), TANGENT_CLAMP * Math.min(lens[kp], lens[k]));
      if (f) {
        vp = f.arc;
        corner = { ...corner, t1: f.t1, t2: f.t2, radius: f.radius };
      }
    }
    out.vertexPoints.push(vp);
    out.points.push(...vp);
    out.sharp.push(sp[0]);
    out.corners.push(corner);
  }
  return out;
}

export function derive(g: RoadGraph, p: CityParams, heroBlock: number, heroSW: number): Derived {
  const cls = (e: number) => g.edges[e].cls;
  const halfCw = (e: number) => {
    const c = cls(e);
    return c ? carriageway(p.classes[c]) / 2 : 0;
  };
  const sidewalk = (e: number) => {
    const c = cls(e);
    return c ? p.classes[c].sidewalk : 0;
  };
  // where two roads meet, the larger radius wins; no rounding against the map edge
  const curbR = (a: number, b: number) => {
    const ca = cls(a);
    const cb = cls(b);
    return ca && cb ? Math.max(p.classes[ca].cornerRadius, p.classes[cb].cornerRadius) : 0;
  };
  const cw = p.curbWidth;

  const islands: Island[] = [];
  const corners: Corner[] = [];
  const approaches = new Map<number, Approach>();
  const addSetback = (node: number, edge: number, T: Vec2) => {
    if (!cls(edge)) return;
    const n = g.nodes[node].p;
    const u = normalize(sub(g.nodes[otherEnd(g.edges[edge], node)].p, n));
    const s = Math.max(0, dot(sub(T, n), u));
    const key = node * g.edges.length + edge;
    const a = approaches.get(key);
    if (a) a.setback = Math.max(a.setback, s);
    else approaches.set(key, { node, edge, setback: s });
  };

  let heroOutline: Outline | null = null;
  for (const b of g.blocks) {
    const curb = offsetOutline(g, b, halfCw, curbR);
    const inner = offsetOutline(g, b, e => (cls(e) ? halfCw(e) + cw : cw),
      (a, c) => Math.max(0, curbR(a, c) - cw));
    // lot corners are concentric with the curb arc once the radius exceeds the wider
    // sidewalk, so the lot can never poke out through the rounded curb
    const lot = offsetOutline(g, b, e => (cls(e) ? halfCw(e) + sidewalk(e) : cw + BOUNDARY_MARGIN),
      (a, c) => Math.max(0, curbR(a, c) - Math.max(sidewalk(a), sidewalk(c))));
    islands.push({ block: b.id, curb: curb.points, curbInner: inner.points, lot: lot.points, lotQuad: lot.sharp });
    for (const c of curb.corners) {
      corners.push({ block: b.id, ...c });
      addSetback(c.node, c.eIn, c.t1);
      addSetback(c.node, c.eOut, c.t2);
    }
    if (b.id === heroBlock) heroOutline = lot;
  }

  return { islands, corners, approaches: [...approaches.values()], hero: heroLot(g, p, heroBlock, heroSW, heroOutline) };
}

/** hero lot: centred on the hero block's front edge, clear of its rounded lot corners */
function heroLot(g: RoadGraph, p: CityParams, heroBlock: number, heroSW: number, lot: Outline | null): HeroLot | null {
  const b = g.blocks[heroBlock];
  if (!b || !lot || b.nodes.length !== 4) return null;
  const s = b.nodes.indexOf(heroSW);
  if (s < 0) return null;
  const idx = [0, 1, 2, 3].map(k => (s + k) % 4); // SW, SE, NE, NW
  const q = idx.map(k => lot.sharp[k]);
  const front = dist(q[0], q[1]);
  const depth = dist(q[0], q[3]);
  const uOf = (pt: Vec2) => dot(sub(pt, q[0]), sub(q[1], q[0])) / (front * front);
  const vpSW = lot.vertexPoints[idx[0]];
  const vpSE = lot.vertexPoints[idx[1]];
  const uStart = uOf(vpSW[vpSW.length - 1]); // where the SW corner arc meets the front edge
  const uEnd = uOf(vpSE[0]);
  const hu = Math.max(0.01, Math.min(p.heroLotX / (2 * front), 0.5 - uStart - 0.005, uEnd - 0.5 - 0.005));
  const v1 = Math.min(p.heroLotY / depth, 0.9);
  const quad = [bilinear(q, 0.5 - hu, 0), bilinear(q, 0.5 + hu, 0), bilinear(q, 0.5 + hu, v1), bilinear(q, 0.5 - hu, v1)];
  const remainder = [
    ...vpSW, quad[0], quad[3], quad[2], quad[1], ...vpSE,
    ...lot.vertexPoints[idx[2]], ...lot.vertexPoints[idx[3]],
  ];
  return { block: b.id, quad, remainder, blockQuad: q, u0: 0.5 - hu, u1: 0.5 + hu, v1 };
}
