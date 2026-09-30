/**
 * Road-local frames. Markings are laid out in (s, y): s = distance along the road
 * from a chosen end node, y = lateral offset to the LEFT of that direction. A straight
 * edge maps (s, y) with one rotation; a curved edge later only has to replace
 * edgeFrame (and frameQuad's sampling) — the marking rules stay untouched.
 */
import { dist, left, normalize, sub, type Vec2 } from "./math2d";
import { otherEnd, type RoadGraph } from "./graph";

export interface Frame {
  length: number;
  /** world-plane point at distance s along the road, y to its left */
  point(s: number, y: number): Vec2;
  /** unit travel direction at s */
  tangent(s: number): Vec2;
}

/** frame along `edge`, starting at node `from` */
export function edgeFrame(g: RoadGraph, edge: number, from: number): Frame {
  const a = g.nodes[from].p;
  const b = g.nodes[otherEnd(g.edges[edge], from)].p;
  const t = normalize(sub(b, a));
  const n = left(t);
  return {
    length: dist(a, b),
    point: (s, y) => ({ x: a.x + t.x * s + n.x * y, y: a.y + t.y * s + n.y * y }),
    tangent: () => t,
  };
}

/** CCW outline of the local box [s0, s1] × [y0, y1] (a straight frame needs only its 4 corners) */
export function frameQuad(f: Frame, s0: number, s1: number, y0: number, y1: number): Vec2[] {
  return [f.point(s0, y0), f.point(s1, y0), f.point(s1, y1), f.point(s0, y1)];
}
