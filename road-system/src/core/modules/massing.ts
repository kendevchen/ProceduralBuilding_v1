import type { MeshBuilder } from "../mesh";
import { centroid, type Vec2 } from "../math2d";
import type { CityModule } from "./types";

/** warm off-white facade, like the reference site's massing */
const FACADE: [number, number, number] = [0.93, 0.925, 0.91];

function extrude(mb: MeshBuilder, poly: Vec2[], h0: number, h1: number): void {
  mb.wall(poly, h0, h1);
  mb.convex(poly, h1);
}

/** building blocks (one mesh, per-building shade as vertex colour) + the hero placeholder */
export const massing: CityModule = ({ params, massing: plan }, out) => {
  const base = params.curbHeight;
  const blocks = out.get("massing");
  const hero = out.get("hero");
  for (const b of plan.buildings) {
    const mb = b.hero ? hero : blocks;
    if (!b.hero) mb.setColor(FACADE[0] * b.shade, FACADE[1] * b.shade, FACADE[2] * b.shade);
    const c = centroid(b.footprint);
    mb.setAnchor(c.x, -c.y);
    if (b.podium) {
      extrude(mb, b.footprint, base, base + b.podium.height);
      extrude(mb, b.podium.tower, base + b.podium.height, base + b.height);
    } else {
      extrude(mb, b.footprint, base, base + b.height);
    }
  }
};
