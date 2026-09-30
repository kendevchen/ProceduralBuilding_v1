/**
 * City blocks around the hero building, from the standalone road system (road-system/,
 * see road-system/PLAN.md). The road core works in meters with the hero lot centred on
 * the origin and its front towards world +z — the building's own frame — so the whole
 * integration is one uniform scale: 1 building unit (bay / floor) = 3 m.
 *
 * Rendering (materials, facade windows, clear-the-view, street furniture) comes from
 * road-system/src/render; this class only maps building units ↔ city meters and keeps
 * the city in step with the building.
 */
import { Group, type Vector3 } from "three";
import { buildCity, type CityResult } from "../road-system/src/core/city";
import { defaultCityParams, type CityParams } from "../road-system/src/params";
import { Materials } from "../road-system/src/render/materials";
import { disposeGroup, toGroup } from "../road-system/src/render/build";
import { PropRenderer, disposeProps } from "../road-system/src/render/props";
import type { BuildingParams } from "./params";

export const METERS_PER_UNIT = 3;

export class CityBlocks {
  readonly group = new Group();
  readonly params: CityParams = defaultCityParams();
  /** clear-the-view settings (meters / floors); uniforms only, no rebuild */
  readonly view = { clear: true, clearRadius: 18, clearFloors: 2 };
  result: CityResult | null = null;

  private materials = new Materials();
  private furniture = new PropRenderer();
  private meshes: Group | null = null;
  private props: Group | null = null;

  constructor() {
    this.group.name = "city blocks";
    this.group.scale.setScalar(1 / METERS_PER_UNIT);
    const p = this.params;
    p.massing.heroPlaceholder = false; // the real building stands on the hero lot
    // pavement top at 0.135 m = 0.045 units, just under the kit's ground strips
    // (0.05 units): storefronts meet the sidewalk flush, without coplanar z-fighting
    p.curbHeight = 0.135;
    // lower towards the centre so the hero is not buried among taller blocks
    p.massing.centreBias = -0.4;
  }

  /** sidewalk width in front of the building, in building units (the front road is always main) */
  frontSidewalk(): number {
    return this.params.classes.main.sidewalk / METERS_PER_UNIT;
  }

  /** rebuild for the building's current footprint (the hero lot = length × width bays) */
  rebuild(b: BuildingParams): void {
    const p = this.params;
    p.heroLotX = b.length * METERS_PER_UNIT;
    p.heroLotY = b.width * METERS_PER_UNIT;
    this.result = buildCity(p);
    if (this.meshes) {
      this.group.remove(this.meshes);
      disposeGroup(this.meshes);
    }
    if (this.props) {
      this.group.remove(this.props);
      disposeProps(this.props);
    }
    this.meshes = toGroup(this.result.meshes, this.materials);
    this.props = this.furniture.build(this.result.props, p.curbHeight);
    this.materials.configureWindows(p.massing.floorHeight, p.curbHeight);
    this.group.add(this.meshes, this.props);
  }

  /** 0 = day … 1 = night: lit windows and glowing street lamps */
  setNight(n: number): void {
    this.materials.setNight(n);
    this.furniture.setNight(n);
  }

  /** per frame: the camera → target corridor for clear-the-view (world units in) */
  update(camera: Vector3, target: Vector3): void {
    const k = METERS_PER_UNIT; // world units → the city's local meters
    this.materials.setClearView(this.view.clear, camera.x * k, camera.z * k, target.x * k, target.z * k,
      this.view.clearRadius, this.params.curbHeight + this.view.clearFloors * this.params.massing.floorHeight);
  }
}
