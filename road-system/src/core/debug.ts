/**
 * Debug overlay as plain line lists (world coordinates): road centre lines by class,
 * nodes, curb fillet tangent points, each approach's setback (the intersection mouth
 * crosswalks are placed from), user-overridden nodes (green squares) and segments too
 * short for end markings (red).
 */
import { addScaled, left, normalize, sub, type Vec2 } from "./math2d";
import { otherEnd } from "./graph";
import { carriageway } from "../params";
import type { CityContext } from "./modules/types";

export interface DebugLines {
  name: string;
  color: number;
  /** line-segment pairs, xyz */
  positions: Float32Array;
}

export function buildDebugLines({ graph: g, derived: d, markings: plan, params: p }: CityContext): DebugLines[] {
  const h = p.curbHeight + 0.3;
  const sets = new Map<string, { color: number; pts: number[] }>();
  const seg = (name: string, color: number, a: Vec2, b: Vec2) => {
    let s = sets.get(name);
    if (!s) sets.set(name, (s = { color, pts: [] }));
    s.pts.push(a.x, h, -a.y, b.x, h, -b.y);
  };
  const mark = (name: string, color: number, c: Vec2, r: number) => {
    seg(name, color, { x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
    seg(name, color, { x: c.x - r, y: c.y + r }, { x: c.x + r, y: c.y - r });
  };

  for (const e of g.edges) {
    const a = g.nodes[e.a].p;
    const b = g.nodes[e.b].p;
    if (e.cls === "main") seg("centre lines · main", 0xffb020, a, b);
    else if (e.cls === "minor") seg("centre lines · minor", 0x2aa8ff, a, b);
    else seg("map boundary", 0x7d8791, a, b);
  }
  for (const n of g.nodes) mark("nodes", 0xffffff, n.p, 1);
  for (const c of d.corners) {
    if (c.radius <= 0) continue;
    mark("curb tangents", 0xff3fd2, c.t1, 0.45);
    mark("curb tangents", 0xff3fd2, c.t2, 0.45);
  }
  for (const a of d.approaches) {
    const e = g.edges[a.edge];
    if (!e.cls) continue;
    const n = g.nodes[a.node].p;
    const u = normalize(sub(g.nodes[otherEnd(e, a.node)].p, n));
    const c = addScaled(n, u, a.setback);
    const w = carriageway(p.classes[e.cls]) / 2;
    seg("setbacks", 0xff6a00, addScaled(c, left(u), w), addScaled(c, left(u), -w));
  }
  for (const n of g.nodes) {
    if (!n.override) continue;
    const r = 2.5;
    const q = [{ x: -r, y: -r }, { x: r, y: -r }, { x: r, y: r }, { x: -r, y: r }].map(o => ({ x: n.p.x + o.x, y: n.p.y + o.y }));
    for (let k = 0; k < 4; k++) seg("overridden nodes", 0x19e36b, q[k], q[(k + 1) % 4]);
  }
  for (const id of plan.shortEdges) {
    const e = g.edges[id];
    seg("short segments", 0xff2222, g.nodes[e.a].p, g.nodes[e.b].p);
  }
  return [...sets].map(([name, s]) => ({ name, color: s.color, positions: new Float32Array(s.pts) }));
}
