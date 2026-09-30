import { MARKING_HEIGHT, type MarkingQuad } from "../markings";
import type { CityModule } from "./types";

/**
 * Road paint + surface decals from the marking plan, one mesh per colour. Manholes /
 * drains sit a hair under the paint (they never overlap it anyway); tactile pads lie on
 * the sidewalk surface, just above the curb height.
 */
export const markings: CityModule = ({ params, markings: plan }, out) => {
  const meshes = {
    white: out.get("marking-white"),
    yellow: out.get("marking-yellow"),
    metal: out.get("road-metal"),
    tactile: out.get("tactile"),
  };
  const height = (q: MarkingQuad) =>
    q.kind === "tactile" ? params.curbHeight + 0.004
      : q.kind === "manhole" || q.kind === "drain" ? MARKING_HEIGHT - 0.004
        : MARKING_HEIGHT;
  for (const q of plan.quads) meshes[q.color].convex(q.pts, height(q));
};
