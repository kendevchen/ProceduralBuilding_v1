import type { CityModule } from "./types";

/** one road surface under the whole map; blocks are raised islands on top of it */
export const asphalt: CityModule = ({ bounds: b }, out) => {
  out.get("asphalt").polygon([
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ], [], 0);
};
