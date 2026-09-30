/**
 * Road network as a planar graph: nodes = intersections (or map-edge points), edges =
 * road segments (or map-boundary pieces, cls = null), blocks = bounded faces.
 * Layout generators (grid now, irregular later) only produce nodes + edges; faces are
 * traced here, so nothing downstream depends on the layout being a grid.
 */
import { signedArea, type Vec2 } from "./math2d";
import type { NodeOverride, RoadClassId } from "../params";

export interface RoadNode {
  id: number;
  p: Vec2;
  /** incident edge ids, sorted CCW by direction (filled by build()) */
  edges: number[];
  /** generator metadata (grid indices) */
  grid?: [number, number];
  /** user override for this intersection (e.g. force crosswalks on / off) */
  override?: NodeOverride;
}

export interface RoadEdge {
  id: number;
  a: number;
  b: number;
  /** road class, or null for the map boundary (zero width, no curb) */
  cls: RoadClassId | null;
}

export interface Block {
  id: number;
  /** CCW corner nodes; edges[k] runs nodes[k] → nodes[k+1] */
  nodes: number[];
  edges: number[];
  area: number;
  /** generator metadata (grid cell = min grid index of the corners) */
  cell?: [number, number];
}

export interface RoadGraph {
  nodes: RoadNode[];
  edges: RoadEdge[];
  blocks: Block[];
}

export const otherEnd = (e: RoadEdge, node: number): number => (e.a === node ? e.b : e.a);

/** number of real roads (not map-boundary pieces) meeting at a node */
export const roadDegree = (g: RoadGraph, node: number): number =>
  g.nodes[node].edges.reduce((n, e) => n + (g.edges[e].cls ? 1 : 0), 0);

export class GraphBuilder {
  readonly nodes: RoadNode[] = [];
  readonly edges: RoadEdge[] = [];

  addNode(p: Vec2, grid?: [number, number]): number {
    const id = this.nodes.length;
    this.nodes.push({ id, p, edges: [], grid });
    return id;
  }

  addEdge(a: number, b: number, cls: RoadClassId | null): number {
    const id = this.edges.length;
    this.edges.push({ id, a, b, cls });
    this.nodes[a].edges.push(id);
    this.nodes[b].edges.push(id);
    return id;
  }

  /** consecutive edges along a chain of nodes */
  addChain(chain: number[], cls: RoadClassId | null): void {
    for (let i = 0; i + 1 < chain.length; i++) this.addEdge(chain[i], chain[i + 1], cls);
  }

  build(): RoadGraph {
    const { nodes, edges } = this;
    for (const n of nodes) {
      const angle = (e: number) => {
        const o = nodes[otherEnd(edges[e], n.id)].p;
        return Math.atan2(o.y - n.p.y, o.x - n.p.x);
      };
      n.edges.sort((e1, e2) => angle(e1) - angle(e2));
    }
    return { nodes, edges, blocks: traceFaces(nodes, edges) };
  }
}

/**
 * Half-edge face tracing. Walk each directed edge; at every node turn onto the edge
 * immediately clockwise from the one we arrived on. That keeps the face on the left,
 * so bounded faces come out CCW (positive area) and the outer face CW (dropped).
 */
function traceFaces(nodes: RoadNode[], edges: RoadEdge[]): Block[] {
  const blocks: Block[] = [];
  const seen = new Set<number>();
  const key = (e: number, from: number) => e * 2 + (edges[e].a === from ? 0 : 1);
  for (const e0 of edges) {
    for (const start of [e0.a, e0.b]) {
      if (seen.has(key(e0.id, start))) continue;
      const fn: number[] = [];
      const fe: number[] = [];
      let from = start;
      let e = e0.id;
      for (let guard = 0; guard <= edges.length * 2; guard++) {
        seen.add(key(e, from));
        fn.push(from);
        fe.push(e);
        const to = otherEnd(edges[e], from);
        const around = nodes[to].edges;
        e = around[(around.indexOf(e) - 1 + around.length) % around.length];
        from = to;
        if (e === e0.id && from === start) break;
      }
      const area = signedArea(fn.map(n => nodes[n].p));
      if (area > 1e-6) blocks.push({ id: blocks.length, nodes: fn, edges: fe, area });
    }
  }
  return blocks;
}
