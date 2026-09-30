/**
 * Road markings as rules over the derived geometry. Nothing is placed by hand, so
 * everything re-fits when lanes, widths, radii, road classes, traffic side or the
 * layout change:
 *   - crosswalk: starts `crosswalkOffset` past the intersection mouth (setback) and
 *     spans curb to curb minus a margin; the stripe count follows the width, centred
 *   - stop line: behind the crosswalk, across the INBOUND half only (side = traffic side)
 *   - lane dividers (white dashed) + centre line (double / dashed / none), from stop
 *     line to stop line; dashes are centred so both ends look alike
 *   - lane arrows: before each junction's stop line, one per inbound lane; the turns
 *     come from the junction's actual exits (turning angle), assigned curb lane →
 *     near-side turn, centre lane → far-side turn (flips with the traffic side)
 *   - manholes in the lanes, drains along the curbs, tactile pads on the sidewalk
 *     at every crosswalk landing
 *   - short-segment rule: if both ends' crosswalks + stop lines would leave less than
 *     MIN_LANE_RUN of plain road, the segment keeps only its centre line
 * All layout happens in road-local (s, y) frames (frame.ts), so a curved road later
 * reuses these rules unchanged.
 */
import { carriageway, type CityParams } from "../params";
import { otherEnd, roadDegree, type RoadGraph } from "./graph";
import type { Derived } from "./derive";
import { edgeFrame, frameQuad, type Frame } from "./frame";
import { cross, dot, normalize, sub, type Vec2 } from "./math2d";
import { hash01 } from "./rng";

/** clearance between the ends of crosswalks / stop lines and the curb (m) */
export const SIDE_MARGIN = 0.3;
/** plain road a segment must keep between its end markings, or it drops them (m) */
export const MIN_LANE_RUN = 6;
/**
 * Paint sits physically above the asphalt instead of relying on polygonOffset: the
 * building project renders with a logarithmic depth buffer, where polygonOffset has
 * no effect. 1.5 cm is invisible yet far above log-depth precision.
 */
export const MARKING_HEIGHT = 0.015;
/** arrows start this far past the stop line (m) */
const ARROW_GAP = 2;
/** manholes / drains keep this far from the stop lines, clear of the arrows (m) */
const DECAL_CLEAR = 7;

export type MarkingKind =
  | "crosswalk" | "stopLine" | "laneLine" | "centreLine" | "arrow" | "manhole" | "drain" | "tactile";
export type MarkingColor = "white" | "yellow" | "metal" | "tactile";
export type Turn = "left" | "straight" | "right";

export interface MarkingQuad {
  kind: MarkingKind;
  color: MarkingColor;
  edge: number;
  /** frame origin: the approach node (end markings) or edge.a (lines, decals) */
  node: number;
  /** bounding box in that frame: s along the edge from `node`, y to its left */
  s0: number;
  s1: number;
  y0: number;
  y1: number;
  /** world-plane corners of a convex polygon */
  pts: Vec2[];
  /** pieces of one composite shape (an arrow) share a group and may overlap each other */
  group?: number;
}

export interface ApproachMarking {
  node: number;
  edge: number;
  crosswalk: boolean;
  stopLine: boolean;
  stripes: number;
  /** distance from the node to the intersection mouth */
  setback: number;
  /** [start, end] distances from the node, when present */
  cw: [number, number] | null;
  stop: [number, number] | null;
  /** lane / centre lines start this far from the node */
  lines: number;
  /** arrows per inbound lane (curb lane first), when painted */
  turns: Turn[][] | null;
}

export interface MarkingPlan {
  quads: MarkingQuad[];
  approaches: ApproachMarking[];
  /** segments too short for crosswalks / stop lines */
  shortEdges: number[];
  /** nodes that ended up with at least one crosswalk */
  crosswalkNodes: Set<number>;
}

/** where each marking sits at one end of a segment (distances from that end's node) */
interface EndLayout {
  node: number;
  setback: number;
  crosswalk: boolean;
  stopLine: boolean;
  cw0: number;
  cw1: number;
  stop0: number;
  stop1: number;
  /** lane / centre lines start here */
  lines: number;
}

/** dashes of length `dash` separated by `gap`, centred in [s0, s1] */
function dashes(s0: number, s1: number, dash: number, gap: number): [number, number][] {
  const n = Math.floor((s1 - s0 + gap) / (dash + gap));
  if (n <= 0) return [];
  const start = s0 + (s1 - s0 - (n * dash + (n - 1) * gap)) / 2;
  return Array.from({ length: n }, (_, k): [number, number] => {
    const a = start + k * (dash + gap);
    return [a, a + dash];
  });
}

/** turns available to a vehicle arriving along `edge` at `node`, from the exits' angles */
export function exitsAt(g: RoadGraph, node: number, edge: number): Set<Turn> {
  const n = g.nodes[node].p;
  const dIn = normalize(sub(n, g.nodes[otherEnd(g.edges[edge], node)].p)); // travel into the node
  const turns = new Set<Turn>();
  for (const e2 of g.nodes[node].edges) {
    if (e2 === edge || !g.edges[e2].cls) continue;
    const x = normalize(sub(g.nodes[otherEnd(g.edges[e2], node)].p, n));
    const deg = (Math.atan2(cross(dIn, x), dot(dIn, x)) * 180) / Math.PI; // > 0 = left
    if (Math.abs(deg) < 35) turns.add("straight");
    else if (deg >= 35 && deg <= 150) turns.add("left");
    else if (deg <= -35 && deg >= -150) turns.add("right");
  }
  return turns;
}

/** arrows per inbound lane, curb lane first: near-side turn from the curb lane */
export function laneTurns(exits: Set<Turn>, lanes: number, traffic: "left" | "right"): Turn[][] {
  const near: Turn = traffic === "right" ? "right" : "left";
  const far: Turn = traffic === "right" ? "left" : "right";
  const out: Turn[][] = [];
  for (let k = 0; k < lanes; k++) {
    const t: Turn[] = [];
    if (lanes === 1) {
      for (const x of ["left", "straight", "right"] as Turn[]) if (exits.has(x)) t.push(x);
    } else {
      if (exits.has("straight")) t.push("straight");
      if (k === 0 && exits.has(near)) t.push(near);
      if (k === lanes - 1 && exits.has(far)) t.push(far);
      if (!t.length) {
        const pick = k < lanes / 2 ? near : far; // middle lanes of a T stem
        if (exits.has(pick)) t.push(pick);
      }
    }
    out.push(t);
  }
  return out;
}

/**
 * Arrow outline as convex pieces in arrow space: a = along travel (tail 0 → head),
 * b = towards the driver's left. Straight: shaft + head; a turn adds an elbow bar
 * and a sideways head (at the knee: mid-shaft when combined with straight).
 */
export function arrowPieces(turns: Turn[]): [number, number][][] {
  const W = 0.075; // half shaft width
  const straight = turns.includes("straight");
  const L = straight ? 3.2 : 2.6;
  const pieces: [number, number][][] = [[[0, -W], [L, -W], [L, W], [0, W]]];
  if (straight) pieces.push([[L, -0.35], [L + 1.3, 0], [L, 0.35]]);
  for (const t of turns) {
    if (t === "straight") continue;
    const sg = t === "left" ? 1 : -1;
    const knee = straight ? 1.7 : L;
    pieces.push([[knee - 0.15, 0], [knee, 0], [knee, sg * 0.6], [knee - 0.15, sg * 0.6]]);
    pieces.push([[knee - 0.45, sg * 0.6], [knee + 0.3, sg * 0.6], [knee - 0.075, sg * 1.05]]);
  }
  return pieces;
}

export function planMarkings(g: RoadGraph, d: Derived, p: CityParams): MarkingPlan {
  const m = p.markings;
  const E = g.edges.length;
  const setbacks = new Map<number, number>();
  for (const a of d.approaches) setbacks.set(a.node * E + a.edge, a.setback);
  const degree = g.nodes.map(n => roadDegree(g, n.id));
  const wantsCrosswalk = (node: number) =>
    m.crosswalks && (g.nodes[node].override?.crosswalks ?? degree[node] >= m.crosswalkMinRoads);
  // stop lines at every junction, and in front of any crosswalk (e.g. a forced mid-block one)
  const wantsStop = (node: number) => m.stopLines && (degree[node] >= 3 || wantsCrosswalk(node));

  const layoutEnd = (node: number, edge: number, allowed: boolean): EndLayout => {
    const setback = setbacks.get(node * E + edge) ?? 0;
    const crosswalk = allowed && wantsCrosswalk(node);
    const stopLine = allowed && wantsStop(node);
    const cw0 = setback + m.crosswalkOffset;
    const cw1 = cw0 + m.crosswalkWidth;
    const stop0 = crosswalk ? cw1 + m.stopLineGap : setback + m.crosswalkOffset;
    const stop1 = stop0 + m.stopLineWidth;
    const lines = stopLine ? stop1 : crosswalk ? cw1 + m.stopLineGap : setback;
    return { node, setback, crosswalk, stopLine, cw0, cw1, stop0, stop1, lines };
  };

  const plan: MarkingPlan = { quads: [], approaches: [], shortEdges: [], crosswalkNodes: new Set() };
  const push = (kind: MarkingKind, color: MarkingColor, edge: number, node: number,
                f: Frame, s0: number, s1: number, y0: number, y1: number) =>
    plan.quads.push({ kind, color, edge, node, s0, s1, y0, y1, pts: frameQuad(f, s0, s1, y0, y1) });
  const pushPoly = (kind: MarkingKind, color: MarkingColor, edge: number, node: number,
                    f: Frame, sy: [number, number][], group?: number) => {
    const ss = sy.map(v => v[0]);
    const ys = sy.map(v => v[1]);
    plan.quads.push({
      kind, color, edge, node, group,
      s0: Math.min(...ss), s1: Math.max(...ss), y0: Math.min(...ys), y1: Math.max(...ys),
      pts: sy.map(([s, y]) => f.point(s, y)),
    });
  };
  const w = m.lineWidth;
  const inbound = p.trafficSide === "right" ? 1 : -1; // side of the inbound half, in the approach frame
  let arrowGroup = 0;

  for (const e of g.edges) {
    if (!e.cls) continue;
    const c = p.classes[e.cls];
    const W = carriageway(c);
    const L = edgeFrame(g, e.id, e.a).length;
    let A = layoutEnd(e.a, e.id, true);
    let B = layoutEnd(e.b, e.id, true);
    const decorated = A.crosswalk || A.stopLine || B.crosswalk || B.stopLine;
    const isShort = decorated && L - A.lines - B.lines < MIN_LANE_RUN;
    if (isShort) {
      A = layoutEnd(e.a, e.id, false);
      B = layoutEnd(e.b, e.id, false);
      plan.shortEdges.push(e.id);
    }

    // end markings, each in its approach frame (origin = node, +s away from it)
    for (const end of [A, B]) {
      const other = end === A ? B : A;
      const f = edgeFrame(g, e.id, end.node);
      let stripes = 0;
      if (end.crosswalk) {
        const span = W - 2 * SIDE_MARGIN;
        stripes = Math.max(0, Math.floor((span + m.stripeGap) / (m.stripeWidth + m.stripeGap)));
        const total = stripes * m.stripeWidth + (stripes - 1) * m.stripeGap;
        for (let k = 0; k < stripes; k++) {
          const y0 = -total / 2 + k * (m.stripeWidth + m.stripeGap);
          push("crosswalk", "white", e.id, end.node, f, end.cw0, end.cw1, y0, y0 + m.stripeWidth);
        }
        if (stripes > 0) plan.crosswalkNodes.add(end.node);
        if (stripes > 0 && m.tactile) {
          // tactile landing pads on both sidewalks, just behind the curb stone and
          // never past the lot line on a narrow sidewalk
          const inner = W / 2 + p.curbWidth + 0.1;
          const outer = Math.min(inner + 0.6, W / 2 + c.sidewalk - 0.1);
          if (outer - inner >= 0.2) {
            for (const sg of [1, -1]) {
              const [y0, y1] = sg > 0 ? [inner, outer] : [-outer, -inner];
              push("tactile", "tactile", e.id, end.node, f, end.cw0, end.cw1, y0, y1);
            }
          }
        }
      }
      if (end.stopLine) {
        // vehicles approach travelling −s and keep to their right (+y) in right-hand
        // traffic, to their left (−y) in left-hand traffic (Hong Kong)
        const inner = c.median / 2;
        const outer = W / 2 - SIDE_MARGIN;
        const [y0, y1] = inbound > 0 ? [inner, outer] : [-outer, -inner];
        push("stopLine", "white", e.id, end.node, f, end.stop0, end.stop1, y0, y1);
      }

      // lane arrows before a junction's stop line, if the plain run has room
      let turns: Turn[][] | null = null;
      if (m.arrows && end.stopLine && degree[end.node] >= 3) {
        const exits = exitsAt(g, end.node, e.id);
        const lanes = laneTurns(exits, c.lanesPerDir, p.trafficSide);
        const head = end.lines + ARROW_GAP;
        const longest = Math.max(...lanes.map(t => (t.includes("straight") ? 4.5 : 3.65)));
        if (lanes.some(t => t.length) && head + longest + 2 <= L - other.lines) {
          turns = lanes;
          lanes.forEach((t, k) => {
            if (!t.length) return;
            // lane k counted from the curb; driver's left is −y when heading −s
            const yc = inbound * (c.median / 2 + (c.lanesPerDir - k - 0.5) * c.laneWidth);
            const pieces = arrowPieces(t);
            const tail = head + Math.max(...pieces.flat().map(v => v[0]));
            const group = arrowGroup++;
            for (const piece of pieces) {
              pushPoly("arrow", "white", e.id, end.node, f, piece.map(([a, b]): [number, number] => [tail - a, yc - b]), group);
            }
          });
        }
      }

      plan.approaches.push({
        node: end.node, edge: e.id, crosswalk: stripes > 0, stopLine: end.stopLine, stripes, setback: end.setback,
        cw: stripes > 0 ? [end.cw0, end.cw1] : null,
        stop: end.stopLine ? [end.stop0, end.stop1] : null,
        lines: end.lines,
        turns,
      });
    }

    const s0 = A.lines;
    const s1 = L - B.lines;
    const f = edgeFrame(g, e.id, e.a);

    // decals in the plain run, clear of the arrows at both ends
    const r0 = s0 + DECAL_CLEAR;
    const r1 = s1 - DECAL_CLEAR;
    if (!isShort && r1 - r0 > 2) {
      const rand = (k: number) => hash01(e.id * 31 + k, p.seed + 71);
      if (m.manholes) {
        const s = r0 + (r1 - r0) * (0.2 + 0.6 * rand(1));
        const lane = Math.floor(rand(2) * c.lanesPerDir);
        const yc = (rand(3) < 0.5 ? 1 : -1) * (c.median / 2 + (lane + 0.5) * c.laneWidth);
        const disc: [number, number][] = Array.from({ length: 12 }, (_, i) => {
          const t = (i / 12) * Math.PI * 2;
          return [s + 0.32 * Math.cos(t), yc + 0.32 * Math.sin(t)];
        });
        pushPoly("manhole", "metal", e.id, e.a, f, disc);
      }
      if (m.drains) {
        // one gutter grate per side, near opposite ends of the run
        for (const [sg, sd] of [[1, r0], [-1, r1 - 0.9]] as const) {
          const [y0, y1] = sg > 0 ? [W / 2 - 0.55, W / 2 - 0.15] : [-(W / 2 - 0.15), -(W / 2 - 0.55)];
          push("drain", "metal", e.id, e.a, f, sd, sd + 0.9, y0, y1);
        }
      }
    }

    // lane dividers + centre line, laid out from end a (short segments: centre only)
    if (!m.laneLines || s1 - s0 <= 0) continue;
    const line = (runs: [number, number][], kind: MarkingKind, color: MarkingColor, y: number) => {
      for (const [a0, a1] of runs) push(kind, color, e.id, e.a, f, a0, a1, y - w / 2, y + w / 2);
    };
    const solid: [number, number][] = [[s0, s1]];
    const dashed = dashes(s0, s1, m.dashLength, m.dashGap);
    if (c.median > w) {
      const y = c.median / 2 - w / 2; // painted median: a solid edge line on each side
      line(solid, "centreLine", "yellow", y);
      line(solid, "centreLine", "yellow", -y);
    } else if (c.centerLine === "double") {
      const y = m.doubleGap / 2 + w / 2;
      line(solid, "centreLine", "yellow", y);
      line(solid, "centreLine", "yellow", -y);
    } else if (c.centerLine === "dashed") {
      line(dashed, "centreLine", "yellow", 0);
    }
    if (!isShort) {
      for (let k = 1; k < c.lanesPerDir; k++) {
        const y = c.median / 2 + k * c.laneWidth;
        line(dashed, "laneLine", "white", y);
        line(dashed, "laneLine", "white", -y);
      }
    }
  }
  return plan;
}
