import type { CityParams } from "../../params";
import type { RoadGraph } from "../graph";
import type { Derived } from "../derive";
import type { MarkingPlan } from "../markings";
import type { MassingPlan } from "../massing";
import type { Bounds } from "../math2d";
import type { MeshSink } from "../mesh";

export interface CityContext {
  params: CityParams;
  graph: RoadGraph;
  derived: Derived;
  markings: MarkingPlan;
  massing: MassingPlan;
  bounds: Bounds;
}

/**
 * A city module turns the derived geometry into mesh data for one kind of element
 * (asphalt, islands, lots — markings, massing, furniture later). Modules write into
 * a shared per-material sink, so the whole city stays a handful of draw calls; a
 * module can later be swapped for a kit-based (GLB) implementation.
 */
export type CityModule = (ctx: CityContext, out: MeshSink) => void;
