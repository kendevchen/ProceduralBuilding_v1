/**
 * Street furniture placement (pure data — the render layer turns each kind into an
 * InstancedMesh, so a kind can later be swapped for a Blender-made model):
 *   - lamps: both sidewalks of every road, evenly spaced, the two sides staggered,
 *     arm towards the road; kept past the stop lines so junction corners stay clear
 *   - trees: middle of the sidewalk on main roads (or all roads), between the lamps
 *   - bollards: flanking every crosswalk landing, just behind the curb stone
 *   - signals: at every junction approach, on the inbound-side curb level with the
 *     stop line, facing the arriving traffic
 * Everything is skipped inside the hero keep-out (the hero lot plus its front
 * sidewalk), where the hero building brings its own street life.
 */
import { carriageway, type CityParams } from "../params";
import { roadDegree, type RoadGraph } from "./graph";
import type { Derived } from "./derive";
import type { MarkingPlan } from "./markings";
import { edgeFrame } from "./frame";
import { insetConvex, left, pointInPolygon, type Vec2 } from "./math2d";
import { hash01 } from "./rng";

export type PropKind = "lamp" | "tree" | "bollard" | "signal";

export interface Prop {
  kind: PropKind;
  /** ground position (2D plane) */
  p: Vec2;
  /** facing direction in the 2D plane (radians, 0 = +x); world yaw = rot */
  rot: number;
  scale: number;
  /** signal aspect: 0 red, 1 amber, 2 green */
  state: number;
  edge: number;
}

export interface PropPlan {
  props: Prop[];
  /** hero lot + front sidewalk, kept free of furniture */
  keepOut: Vec2[] | null;
}

/** distance from the curb line to lamp / signal / bollard centres (m) */
const CURB_SETBACK = 0.45;

export function planProps(g: RoadGraph, d: Derived, plan: MarkingPlan, p: CityParams): PropPlan {
  const fp = p.furniture;
  const E = g.edges.length;
  const byApproach = new Map(plan.approaches.map(a => [a.node * E + a.edge, a]));
  const keepOut = d.hero ? insetConvex(d.hero.quad, -(p.classes.main.sidewalk + 1.5)) : null;
  const props: Prop[] = [];
  const add = (kind: PropKind, pos: Vec2, rot: number, edge: number, scale = 1, state = 0) => {
    if (keepOut && pointInPolygon(pos, keepOut)) return;
    props.push({ kind, p: pos, rot, scale, state, edge });
  };
  const angle = (v: Vec2) => Math.atan2(v.y, v.x);

  for (const e of g.edges) {
    if (!e.cls) continue;
    const c = p.classes[e.cls];
    const W = carriageway(c);
    const f = edgeFrame(g, e.id, e.a);
    const L = f.length;
    const u = f.tangent(0);
    const n = left(u);
    const A = byApproach.get(e.a * E + e.id);
    const B = byApproach.get(e.b * E + e.id);
    if (!A || !B) continue;
    const rand = (k: number) => hash01(e.id * 97 + k, p.seed + 313);

    // the plain sidewalk run along this segment, past both stop lines
    const r0 = A.lines + 2;
    const r1 = L - B.lines - 2;
    const lampS: number[][] = [[], []];
    if (fp.lamps && r1 > r0) {
      const sp = Math.max(8, fp.lampSpacing);
      const count = Math.floor((r1 - r0) / sp) + 1;
      const start = r0 + (r1 - r0 - (count - 1) * sp) / 2;
      [1, -1].forEach((sg, side) => {
        for (let k = 0; k < count; k++) {
          const s = start + k * sp + (side ? sp / 2 : 0); // stagger the far side
          if (s > r1) continue;
          lampS[side].push(s);
          const y = sg * (W / 2 + p.curbWidth + CURB_SETBACK);
          add("lamp", f.point(s, y), angle({ x: -n.x * sg, y: -n.y * sg }), e.id);
        }
      });
    }

    // trees stand mid-sidewalk, but at least 0.8 m behind the curb stone and 0.3 m
    // clear of the lot line — narrower sidewalks get none
    const treeOff = Math.min(Math.max(p.curbWidth + 0.8, c.sidewalk * 0.5), c.sidewalk - 0.3);
    const treeHere = (fp.trees === "all" || (fp.trees === "main" && e.cls === "main")) && treeOff >= p.curbWidth + 0.5;
    if (treeHere && r1 > r0) {
      const sp = Math.max(6, fp.treeSpacing);
      const count = Math.floor((r1 - r0) / sp) + 1;
      const start = r0 + (r1 - r0 - (count - 1) * sp) / 2 + sp / 4;
      [1, -1].forEach((sg, side) => {
        const y = sg * (W / 2 + treeOff);
        for (let k = 0; k < count; k++) {
          const s = start + k * sp;
          if (s > r1 || lampS[side].some(ls => Math.abs(ls - s) < 3)) continue; // leave room for lamps
          add("tree", f.point(s, y), rand(10 + k * 2 + side) * Math.PI * 2, e.id, 0.85 + 0.3 * rand(11 + k * 2 + side));
        }
      });
    }

    for (const end of [A, B]) {
      const fe = edgeFrame(g, e.id, end.node);
      const ue = fe.tangent(0);
      if (fp.bollards && end.cw) {
        for (const sg of [1, -1]) {
          const y = sg * (W / 2 + p.curbWidth + 0.35);
          for (const s of [end.cw[0] - 0.6, end.cw[1] + 0.6]) {
            // the near pair only where the curb is already straight (past the mouth)
            if (s >= end.setback + 0.3) add("bollard", fe.point(s, y), 0, e.id);
          }
        }
      }
      if (fp.signals && end.stop && roadDegree(g, end.node) >= 3) {
        // one fixed phase per junction: the more east–west approaches show green
        const state = Math.abs(ue.x) >= Math.abs(ue.y) ? 2 : 0;
        const inbound = p.trafficSide === "right" ? 1 : -1;
        const y = inbound * (W / 2 + p.curbWidth + CURB_SETBACK);
        add("signal", fe.point(end.stop[0], y), angle(ue), e.id, 1, state);
      }
    }
  }
  return { props, keepOut };
}
