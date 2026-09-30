import type { CityModule } from "./types";

/** lot surfaces (the ground buildings stand on); a highlighted hero lot while it is a placeholder */
export const lots: CityModule = ({ params, derived }, out) => {
  const h = params.curbHeight;
  const lot = out.get("lot");
  const hero = params.massing.heroPlaceholder ? derived.hero : null;
  for (const isl of derived.islands) {
    if (hero && hero.block === isl.block) {
      lot.polygon(hero.remainder, [], h);
      out.get("hero").polygon(hero.quad, [], h);
    } else {
      lot.polygon(isl.lot, [], h);
    }
  }
};
