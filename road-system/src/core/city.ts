/**
 * buildCity(params) — the single entry point, for the lab page now and the building
 * project later. Pure computation: returns the graph, derived geometry, the marking
 * plan and per-material MeshData; turning MeshData into three.js objects is render/'s job.
 */
import type { CityParams } from "../params";
import type { RoadGraph } from "./graph";
import type { Bounds } from "./math2d";
import { buildGrid } from "./layout/grid";
import { derive, type Derived } from "./derive";
import { planMarkings, type MarkingPlan } from "./markings";
import { planMassing, type MassingPlan } from "./massing";
import { planProps, type PropPlan } from "./props";
import { MeshSink, type MeshData } from "./mesh";
import { buildDebugLines, type DebugLines } from "./debug";
import type { CityContext, CityModule } from "./modules/types";
import { asphalt } from "./modules/asphalt";
import { islands } from "./modules/islands";
import { lots } from "./modules/lots";
import { markings } from "./modules/markings";
import { massing } from "./modules/massing";

/** module registry, in build order */
export const MODULES: Record<string, CityModule> = { asphalt, islands, lots, markings, massing };

export interface CityResult {
  graph: RoadGraph;
  derived: Derived;
  markings: MarkingPlan;
  massing: MassingPlan;
  /** street furniture placements (instanced by the render layer) */
  props: PropPlan;
  bounds: Bounds;
  meshes: MeshData[];
  debug: DebugLines[];
  stats: {
    ms: number;
    blocks: number;
    nodes: number;
    edges: number;
    merges: number;
    markings: number;
    buildings: number;
    props: number;
    triangles: number;
  };
}

export function buildCity(p: CityParams): CityResult {
  const t0 = performance.now();
  const grid = buildGrid(p);
  const derived = derive(grid.graph, p, grid.heroBlock, grid.heroSW);
  const plan = planMarkings(grid.graph, derived, p);
  const mass = planMassing(grid.graph, derived, p, grid.bounds);
  const props = planProps(grid.graph, derived, plan, p);
  const ctx: CityContext = { params: p, graph: grid.graph, derived, markings: plan, massing: mass, bounds: grid.bounds };
  const sink = new MeshSink();
  for (const m of Object.values(MODULES)) m(ctx, sink);
  const meshes = sink.build();
  const debug = buildDebugLines(ctx);
  return {
    graph: grid.graph,
    derived,
    markings: plan,
    massing: mass,
    props,
    bounds: grid.bounds,
    meshes,
    debug,
    stats: {
      ms: performance.now() - t0,
      blocks: grid.graph.blocks.length,
      nodes: grid.graph.nodes.length,
      edges: grid.graph.edges.length,
      merges: grid.merges,
      markings: plan.quads.length,
      buildings: mass.buildings.length,
      props: props.props.length,
      triangles: meshes.reduce((n, m) => n + m.indices.length / 3, 0),
    },
  };
}
