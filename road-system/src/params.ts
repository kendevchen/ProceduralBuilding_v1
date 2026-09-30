/** Every road-system parameter. Lengths are meters. */

export type CenterLine = "none" | "dashed" | "double";

/** a road class = one cross-section, shared by every segment of that class */
export interface RoadClassParams {
  lanesPerDir: number;
  laneWidth: number;
  /** painted/raised median width (0 = none) */
  median: number;
  centerLine: CenterLine;
  sidewalk: number;
  /** curb corner radius where roads of this class meet */
  cornerRadius: number;
}

export type RoadClassId = "main" | "minor";

export interface MarkingParams {
  crosswalks: boolean;
  /** crosswalks at nodes where at least this many roads meet (2 = also pass-through nodes) */
  crosswalkMinRoads: number;
  /** crosswalk depth along the road */
  crosswalkWidth: number;
  stripeWidth: number;
  stripeGap: number;
  /** distance from the intersection mouth (setback) to the crosswalk */
  crosswalkOffset: number;
  stopLines: boolean;
  stopLineWidth: number;
  /** distance from the crosswalk to the stop line */
  stopLineGap: number;
  /** lane dividers + centre lines */
  laneLines: boolean;
  lineWidth: number;
  dashLength: number;
  dashGap: number;
  /** gap between the two lines of a double centre line */
  doubleGap: number;
  /** lane arrows before the stop line, derived from the junction's exits */
  arrows: boolean;
  /** manhole covers in the lanes and drain grates along the curbs */
  manholes: boolean;
  drains: boolean;
  /** yellow tactile pads on the sidewalk at every crosswalk landing */
  tactile: boolean;
}

export type TreeMode = "none" | "main" | "all";

/** street furniture (instanced props on the sidewalks) */
export interface FurnitureParams {
  lamps: boolean;
  lampSpacing: number;
  trees: TreeMode;
  treeSpacing: number;
  bollards: boolean;
  signals: boolean;
}

export interface MassingParams {
  enabled: boolean;
  minFloors: number;
  maxFloors: number;
  floorHeight: number;
  /** parcel frontage range along the street */
  minFrontage: number;
  maxFrontage: number;
  /** a lot deeper than this is split into two back-to-back rows */
  maxDepth: number;
  /** gap between neighbouring buildings (also kept from the lot line) */
  gap: number;
  /** −1..1: > 0 taller towards the centre, < 0 lower (lets the hero stand out) */
  centreBias: number;
  /** chance of a 1–2 floor podium with a set-back tower on it */
  podiumChance: number;
  /** placeholder block on the hero lot */
  heroFloors: number;
  /** draw the hero placeholder + highlighted hero lot (off when the real building stands there) */
  heroPlaceholder: boolean;
  /** free space kept between the hero lot and its neighbours (m) — room for facade clutter */
  heroClearance: number;
}

/** per-intersection override, keyed by layout coordinates (grid: "i,j") */
export interface NodeOverride {
  crosswalks?: boolean;
}

export interface CityParams {
  /** blocks per axis (2D x / 2D y = world −z) */
  blocksX: number;
  blocksY: number;
  /** lot (property-line) size of an ordinary block */
  lotX: number;
  lotY: number;
  /** ± fraction applied to each column / row lot size */
  sizeVariation: number;
  /** every n-th grid line is a main road (the hero block's front + west lines always are) */
  mainEvery: number;
  /** depth of the outer ring of lots between the last road and the map edge */
  outerLot: number;
  seed: number;
  /** chance that an ordinary block merges with a neighbour (drops a road → T-junctions) */
  blockMerge: number;
  /** dev only: displace nodes to test non-orthogonal geometry (0..1) */
  jitter: number;
  /** hero lot (front-centre of the central block) — the building's footprint later */
  heroLotX: number;
  heroLotY: number;
  curbHeight: number;
  curbWidth: number;
  trafficSide: "left" | "right";
  classes: Record<RoadClassId, RoadClassParams>;
  markings: MarkingParams;
  furniture: FurnitureParams;
  massing: MassingParams;
  nodeOverrides: Record<string, NodeOverride>;
}

export function defaultCityParams(): CityParams {
  return {
    blocksX: 5,
    blocksY: 5,
    lotX: 50,
    lotY: 36,
    sizeVariation: 0.2,
    mainEvery: 2,
    outerLot: 30,
    seed: 1,
    blockMerge: 0,
    jitter: 0,
    heroLotX: 21, // 7 bays × 3 m
    heroLotY: 9,  // 3 bays × 3 m
    curbHeight: 0.15,
    curbWidth: 0.2,
    trafficSide: "left",
    classes: {
      main: { lanesPerDir: 2, laneWidth: 3.5, median: 0, centerLine: "double", sidewalk: 4, cornerRadius: 8 },
      minor: { lanesPerDir: 1, laneWidth: 3.2, median: 0, centerLine: "dashed", sidewalk: 2.5, cornerRadius: 5 },
    },
    markings: {
      crosswalks: true,
      crosswalkMinRoads: 3,
      crosswalkWidth: 4,
      stripeWidth: 0.45,
      stripeGap: 0.55,
      crosswalkOffset: 1,
      stopLines: true,
      stopLineWidth: 0.4,
      stopLineGap: 1.5,
      laneLines: true,
      lineWidth: 0.15,
      dashLength: 4,
      dashGap: 6,
      doubleGap: 0.12,
      arrows: true,
      manholes: true,
      drains: true,
      tactile: true,
    },
    furniture: {
      lamps: true,
      lampSpacing: 28,
      trees: "main",
      treeSpacing: 14,
      bollards: true,
      signals: true,
    },
    massing: {
      enabled: true,
      minFloors: 3,
      maxFloors: 18,
      floorHeight: 3,
      minFrontage: 8,
      maxFrontage: 20,
      maxDepth: 20,
      gap: 1,
      centreBias: 0.3,
      podiumChance: 0.3,
      heroFloors: 6,
      heroPlaceholder: true,
      heroClearance: 3,
    },
    nodeOverrides: {},
  };
}

/** curb-to-curb width */
export function carriageway(c: RoadClassParams): number {
  return 2 * c.lanesPerDir * c.laneWidth + c.median;
}
