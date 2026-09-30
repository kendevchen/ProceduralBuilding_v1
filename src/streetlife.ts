/**
 * Street life & rooftop extras layered on top of the ported Blender graph (none of
 * these are produced by the original "build system" node group):
 *   - water tanks: the kit's COL[watertank][*] parts (their branch in the .blend has a
 *     disconnected input and never fires), placed on the roof in Blender Z-up space
 *     like every other kit part
 *   - rooftop neon sign: steel frame + canvas-lettered emissive panel
 *   - sidewalk (curb + tactile paving) and procedural street trees
 *
 * Sign / sidewalk / trees are built in WORLD space (Y-up). The building's world
 * footprint is x ∈ [-length/2, length/2], z ∈ [-width/2, width/2], stores at +z.
 * 1 unit = 1 bay = 1 floor.
 */
import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, CylinderGeometry, Euler, ExtrudeGeometry,
  Float32BufferAttribute,
  Group, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Path,
  PlaneGeometry, Quaternion, RepeatWrapping, Shape, SRGBColorSpace, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingParams } from "./params";
import type { KitCounts, Placement } from "./generator";
import { hash01, randBool } from "./rng";

export interface StreetLifeParams {
  waterTanks: number;
  waterTankScale: number;
  sign: boolean;
  signText: string;
  neonColor: string;
  neonIntensity: number;
  sidewalk: boolean;
  sidewalkWidth: number;
  tactilePaving: boolean;
  trees: boolean;
  treeSpacing: number;
}

export function defaultStreetLife(): StreetLifeParams {
  return {
    waterTanks: 2,
    waterTankScale: 1.6,
    sign: true,
    signText: "台北公寓",
    neonColor: "#ff2a1f",
    neonIntensity: 2.5,
    sidewalk: true,
    sidewalkWidth: 1.4,
    tactilePaving: true,
    trees: true,
    treeSpacing: 2.4,
  };
}

/** sidewalk surface — just under the kit's ground strips (their top sits at y≈0.05) */
const SIDEWALK_TOP = 0.045;
/** roof surface = floor + 0.15 (FINAL lift + roofZ in the generator) */
const ROOF_OFFSET = 0.15;
/** tallest guardrail variant tops out at floor + 0.9 */
const PARAPET_TOP = 0.9;

// ---------------------------------------------------------------------------
// water tanks (Blender space, rendered through the kit like any other part)
// ---------------------------------------------------------------------------

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();

export function waterTankPlacements(p: BuildingParams, s: StreetLifeParams, counts: KitCounts): Placement[] {
  const variants = counts.count("watertank");
  const seed = p.randomise;
  // roof faces in the generator's order (j outer, i inner); "busy" = has a roof_prop,
  // decided with the same fixed-seed test the generator uses
  const faces: { i: number; j: number; busy: boolean; order: number }[] = [];
  for (let j = 0; j < p.width; j++) {
    for (let i = 0; i < p.length; i++) {
      const idx = j * p.length + i;
      faces.push({ i, j, busy: randBool(p.objectOnRoof, idx, 0), order: hash01(idx, seed + 7919) });
    }
  }
  // keep the front row (Blender +y = stores) clear for the sign; prefer empty faces
  const pool = faces
    .filter(f => !(s.sign && p.width > 1 && f.j === p.width - 1))
    .sort((a, b) => Number(a.busy) - Number(b.busy) || a.order - b.order);

  const out: Placement[] = [];
  const n = Math.min(Math.round(s.waterTanks), pool.length);
  for (let k = 0; k < n; k++) {
    const f = pool[k];
    // roof props fill the -x half of a face, so shared faces push the tank to +x
    const dx = f.busy ? 0.3 : 0;
    _p.set(-p.length / 2 + 0.5 + f.i + dx, -p.width / 2 + 0.5 + f.j, p.floor + ROOF_OFFSET);
    _q.setFromEuler(_e.set(0, 0, hash01(k, seed + 31) * Math.PI * 2));
    _s.setScalar(s.waterTankScale);
    out.push({ key: `COL[watertank][${k % variants}]`, matrix: new Matrix4().compose(_p, _q, _s) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// canvas textures
// ---------------------------------------------------------------------------

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function repeatTexture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** warm beige square paving, 3×3 tiles per unit, per-tile shade variation */
function pavingTexture(): CanvasTexture {
  const size = 384;
  const [c, g] = canvas(size, size);
  g.fillStyle = "#8f8676"; // grout
  g.fillRect(0, 0, size, size);
  const n = 3;
  const cell = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = hash01(y * n + x, 5);
      g.fillStyle = `rgb(${196 + v * 22}, ${180 + v * 20}, ${150 + v * 18})`;
      g.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
    }
  }
  return repeatTexture(c);
}

/** yellow tactile paving with a dot grid (8 dots per unit) */
function tactileTexture(): CanvasTexture {
  const size = 128;
  const [c, g] = canvas(size, size);
  g.fillStyle = "#e2b52a";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#b98f17";
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.beginPath();
      g.arc((x + 0.5) * 64, (y + 0.5) * 64, 17, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = repeatTexture(c);
  t.repeat.set(4, 4);
  return t;
}

const SIGN_FONT = '"PingFang TC", "PingFang SC", "Heiti TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';

/** white glyphs on transparent — tinted by the neon material's color/emissive */
function signTexture(text: string): { tex: CanvasTexture; aspect: number } {
  const px = 256;
  const pad = 28;
  const font = `900 ${px}px ${SIGN_FONT}`;
  const [, probe] = canvas(1, 1);
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + pad * 2;
  const h = px + pad * 2;
  const [c, g] = canvas(w, h);
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffffff";
  g.fillText(text, w / 2, h / 2 + px * 0.04);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, aspect: w / h };
}

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------

function roundedRect(path: Shape | Path, hw: number, hh: number, r: number): void {
  r = Math.max(0.001, Math.min(r, hw, hh));
  path.moveTo(-hw + r, -hh);
  path.lineTo(hw - r, -hh);
  path.quadraticCurveTo(hw, -hh, hw, -hh + r);
  path.lineTo(hw, hh - r);
  path.quadraticCurveTo(hw, hh, hw - r, hh);
  path.lineTo(-hw + r, hh);
  path.quadraticCurveTo(-hw, hh, -hw, hh - r);
  path.lineTo(-hw, -hh + r);
  path.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
}

/** flat slab (or ring, when inset is given) lying on y ∈ [y0, y0 + depth] */
function slab(hw: number, hh: number, r: number, y0: number, depth: number,
              hole?: { hw: number; hh: number; r: number }): BufferGeometry {
  const shape = new Shape();
  roundedRect(shape, hw, hh, r);
  if (hole) {
    const h = new Path();
    roundedRect(h, hole.hw, hole.hh, hole.r);
    shape.holes.push(h);
  }
  // cap UVs are the shape's x/y, i.e. world units — textures tile per unit
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); // shape XY -> world XZ, extrusion -> +Y
  g.translate(0, y0, 0);
  return g;
}

/** thin box between two points (frame members) */
function strut(a: Vector3, b: Vector3, t: number): BufferGeometry {
  const d = new Vector3().subVectors(b, a);
  const g = new BoxGeometry(t, d.length(), t);
  _q.setFromUnitVectors(new Vector3(0, 1, 0), d.normalize());
  _m.compose(new Vector3().addVectors(a, b).multiplyScalar(0.5), _q, _s.setScalar(1));
  return g.applyMatrix4(_m);
}

/** one stylised tree: faceted canopy blobs with per-face green variation */
function makeTree(v: number): { canopy: BufferGeometry; trunk: BufferGeometry } {
  // many small clumps on a flattened, irregular dome (golden-angle spread) instead of
  // a few big spheres — reads as foliage rather than a lollipop
  const blobs: BufferGeometry[] = [];
  const count = 13 + (v % 3) * 2;
  for (let b = 0; b < count; b++) {
    const u = (b + 0.5) / count;
    const a = b * 2.39996 + hash01(b, 60 + v) * 0.8;
    const d = Math.sqrt(u) * (0.42 + 0.1 * hash01(b, 70 + v));
    const y = 1.35 + 0.5 * (1 - u) * (0.7 + 0.6 * hash01(b, 80 + v));
    const g = new IcosahedronGeometry(0.15 + 0.1 * hash01(b, 50 + v), 1);
    g.scale(1, 0.8, 1);
    g.translate(Math.cos(a) * d, y, Math.sin(a) * d);
    blobs.push(g);
  }
  const canopy = mergeGeometries(blobs)!;
  blobs.forEach(g => g.dispose());

  // jitter vertices (keyed by position, so shared corners stay welded) and colour
  // each triangle — a leafy, faceted read that survives the distance LOD
  const pos = canopy.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const key = Math.round(pos.getX(i) * 997) * 73856093 ^ Math.round(pos.getY(i) * 997) * 19349663 ^
      Math.round(pos.getZ(i) * 997) * 83492791;
    pos.setXYZ(i,
      pos.getX(i) + (hash01(key, 1) - 0.5) * 0.07,
      pos.getY(i) + (hash01(key, 2) - 0.5) * 0.07,
      pos.getZ(i) + (hash01(key, 3) - 0.5) * 0.07);
  }
  canopy.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  const dark = new Color(0x2c5220);
  const light = new Color(0x77a33c);
  const c = new Color();
  for (let f = 0; f < pos.count; f += 3) {
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const t = Math.min(1, Math.max(0, (y - 1.2) / 0.7 + (hash01(f, 90 + v) - 0.5) * 0.8));
    c.copy(dark).lerp(light, t);
    for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
  }
  canopy.setAttribute("color", new Float32BufferAttribute(colors, 3));

  // trunk + three limbs forking into the canopy
  const limbs: BufferGeometry[] = [];
  const stem = new CylinderGeometry(0.032, 0.055, 1.25, 7);
  stem.translate(0, 0.625, 0);
  limbs.push(stem);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + hash01(k, 100 + v) * 1.2;
    const tip = new Vector3(Math.cos(a) * 0.3, 1.6 + 0.15 * hash01(k, 110 + v), Math.sin(a) * 0.3);
    limbs.push(strut(new Vector3(0, 1.05, 0), tip, 0.03));
  }
  const trunk = mergeGeometries(limbs)!;
  limbs.forEach(g => g.dispose());
  return { canopy, trunk };
}

// ---------------------------------------------------------------------------

export class StreetLife {
  readonly group = new Group();
  readonly params = defaultStreetLife();
  /**
   * City mode: the road system (road-system/, see city.ts) supplies the sidewalks and
   * neighbouring buildings — our own sidewalk is hidden and trees are planted only
   * along the store front, on the city's sidewalk (frontSidewalk, in units).
   */
  cityMode = { on: false, frontSidewalk: 0 };

  private mats = {
    paving: new MeshStandardMaterial({ name: "paving", map: pavingTexture(), roughness: 0.92 }),
    curb: new MeshStandardMaterial({ name: "curb", color: 0xb9b6ae, roughness: 0.85 }),
    tactile: new MeshStandardMaterial({
      name: "tactile", map: tactileTexture(), roughness: 0.8,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }),
    grate: new MeshStandardMaterial({ name: "tree grate", color: 0x2a2826, roughness: 0.7, metalness: 0.5 }),
    trunk: new MeshStandardMaterial({ name: "trunk", color: 0x5b4632, roughness: 0.95 }),
    leaves: new MeshStandardMaterial({ name: "leaves", vertexColors: true, roughness: 0.85, flatShading: true }),
    steel: new MeshStandardMaterial({ name: "sign frame", color: 0x3b3f44, roughness: 0.55, metalness: 0.6 }),
    neon: new MeshStandardMaterial({ name: "neon", alphaTest: 0.5, roughness: 0.35 }),
    neonBack: new MeshStandardMaterial({ name: "neon back", color: 0x2b2d30, alphaTest: 0.5, roughness: 0.6, metalness: 0.4 }),
  };
  private trees = [0, 1, 2].map(makeTree);
  private grateGeom = new BoxGeometry(0.42, 0.01, 0.42);
  private sign: { text: string; tex: CanvasTexture; aspect: number } | null = null;

  constructor() {
    for (const t of this.trees) t.canopy.userData.shared = t.trunk.userData.shared = true;
    this.grateGeom.userData.shared = true;
  }

  /** rebuild sidewalk / trees / sign for the current building footprint */
  rebuild(p: BuildingParams): void {
    this.clear();
    const s = this.params;
    if (s.sidewalk && !this.cityMode.on) this.buildSidewalk(p);
    if (s.trees) this.buildTrees(p);
    if (s.sign && s.signText.trim()) this.buildSign(p);
    this.applyNeon();
  }

  /** live neon tweak (no rebuild) */
  applyNeon(): void {
    const c = new Color(this.params.neonColor);
    this.mats.neon.color.copy(c);
    this.mats.neon.emissive.copy(c);
    this.mats.neon.emissiveIntensity = this.params.neonIntensity;
  }

  /** world-space half extents + top, for camera framing and shadow fitting */
  extent(p: BuildingParams): { halfX: number; halfZ: number; top: number } {
    const s = this.params;
    const out = s.sidewalk || s.trees ? s.sidewalkWidth : 0.5;
    const top = s.sign && s.signText.trim() ? p.floor + PARAPET_TOP + 0.1 + this.signHeight(p) : p.floor + 0.4;
    return { halfX: p.length / 2 + out, halfZ: p.width / 2 + out, top };
  }

  private clear(): void {
    for (const o of [...this.group.children]) {
      const mesh = o as Mesh;
      if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
      if ((mesh as InstancedMesh).isInstancedMesh) (mesh as InstancedMesh).dispose();
      this.group.remove(o);
    }
  }

  private add(geom: BufferGeometry, mat: MeshStandardMaterial, name: string, shadows = true): Mesh {
    const m = new Mesh(geom, mat);
    m.name = name;
    m.castShadow = shadows;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  private buildSidewalk(p: BuildingParams): void {
    const s = this.params;
    const hw = p.length / 2 + s.sidewalkWidth;
    const hh = p.width / 2 + s.sidewalkWidth;
    const r = Math.min(0.9, s.sidewalkWidth * 0.8); // rounded street corners
    const curb = 0.09;
    this.add(slab(hw - curb, hh - curb, r - curb, 0, SIDEWALK_TOP), this.mats.paving, "sidewalk", false);
    this.add(slab(hw, hh, r, 0, SIDEWALK_TOP + 0.008,
      { hw: hw - curb, hh: hh - curb, r: r - curb }), this.mats.curb, "curb", false);
    if (s.tactilePaving && s.sidewalkWidth > 0.6) {
      // guide strip running around the block, ~40% of the way out from the facade
      const inset = s.sidewalkWidth * 0.4;
      const band = 0.11;
      const o = { hw: p.length / 2 + inset + band / 2, hh: p.width / 2 + inset + band / 2 };
      const i = { hw: o.hw - band, hh: o.hh - band };
      const rr = Math.max(0.05, r - (s.sidewalkWidth - inset));
      this.add(slab(o.hw, o.hh, rr + band / 2, SIDEWALK_TOP, 0.003,
        { ...i, r: Math.max(0.01, rr - band / 2) }), this.mats.tactile, "tactile paving", false);
    }
  }

  private buildTrees(p: BuildingParams): void {
    const s = this.params;
    const walk = this.cityMode.on ? this.cityMode.frontSidewalk : s.sidewalkWidth;
    const off = Math.max(0.9, walk * 0.7); // distance out from the facade
    const spots: { x: number; z: number }[] = [];
    const along = (half: number, fn: (t: number) => void) => {
      const usable = 2 * half - 1.4; // stay clear of the corners
      const n = usable <= 0 ? 0 : Math.floor(usable / s.treeSpacing) + 1;
      for (let k = 0; k < n; k++) fn(n === 1 ? 0 : -usable / 2 + (usable * k) / (n - 1));
    };
    along(p.length / 2, x => spots.push({ x, z: p.width / 2 + off }));   // store front
    if (!this.cityMode.on) { // in the city the sides face neighbouring buildings, not streets
      along(p.width / 2, z => spots.push({ x: p.length / 2 + off, z }));   // sides
      along(p.width / 2, z => spots.push({ x: -p.length / 2 - off, z }));  // (back = service alley)
    }
    if (!spots.length) return;

    const seed = p.randomise;
    const byVariant = this.trees.map(() => [] as Matrix4[]);
    const grates: Matrix4[] = [];
    spots.forEach((sp, k) => {
      const v = Math.floor(hash01(k, seed + 211) * this.trees.length);
      _q.setFromEuler(_e.set(0, hash01(k, seed + 223) * Math.PI * 2, 0));
      _s.setScalar(0.85 + 0.3 * hash01(k, seed + 227));
      byVariant[v].push(new Matrix4().compose(_p.set(sp.x, SIDEWALK_TOP, sp.z), _q, _s));
      grates.push(new Matrix4().makeTranslation(sp.x, SIDEWALK_TOP + 0.004, sp.z));
    });

    const inst = (geom: BufferGeometry, mat: MeshStandardMaterial, list: Matrix4[], name: string, cast: boolean) => {
      if (!list.length) return;
      const im = new InstancedMesh(geom, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = name;
      im.castShadow = cast;
      im.receiveShadow = true;
      this.group.add(im);
    };
    this.trees.forEach((t, v) => {
      inst(t.canopy, this.mats.leaves, byVariant[v], "tree canopy", true);
      inst(t.trunk, this.mats.trunk, byVariant[v], "tree trunk", true);
    });
    if (s.sidewalk || this.cityMode.on) inst(this.grateGeom, this.mats.grate, grates, "tree grate", false);
  }

  private signHeight(p: BuildingParams): number {
    const aspect = this.signTexture(this.params.signText).aspect;
    const h = 0.9;
    return Math.min(h, (p.length * 0.9) / aspect);
  }

  private signTexture(text: string): { tex: CanvasTexture; aspect: number } {
    if (this.sign?.text !== text) {
      this.sign?.tex.dispose();
      this.sign = { text, ...signTexture(text) };
      this.mats.neon.map = this.mats.neon.emissiveMap = this.sign.tex;
      this.mats.neonBack.map = this.sign.tex;
      this.mats.neon.needsUpdate = this.mats.neonBack.needsUpdate = true;
    }
    return this.sign!;
  }

  private buildSign(p: BuildingParams): void {
    const { aspect } = this.signTexture(this.params.signText);
    const h = this.signHeight(p);
    const w = h * aspect;
    const roofY = p.floor + ROOF_OFFSET;
    const y0 = p.floor + PARAPET_TOP + 0.1;        // letters clear the parapet
    const zf = p.width / 2 - 0.3;                  // set back behind the front parapet
    const panel = new PlaneGeometry(w, h);
    this.add(panel, this.mats.neon, "neon sign").position.set(0, y0 + h / 2, zf);
    // the back shows the letters' reverse side: the same silhouettes, mirrored — a plane
    // turned 180° alone would read correctly from behind, so its u is flipped too
    const backPanel = new PlaneGeometry(w, h);
    const uv = backPanel.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const back = this.add(backPanel, this.mats.neonBack, "neon sign back");
    back.position.set(0, y0 + h / 2, zf - 0.012);
    back.rotation.y = Math.PI;

    // steel lattice: posts at the glyph gaps, top/bottom rails, raked braces to the roof
    const t = 0.045;
    const zr = zf - 0.07;
    const depth = Math.min(0.9, Math.max(0.3, p.width * 0.3));
    const posts = Math.max(2, Math.round(w / 0.8) + 1);
    const parts: BufferGeometry[] = [];
    const top = y0 + h + 0.04;
    for (let k = 0; k < posts; k++) {
      const x = -w / 2 + (w * k) / (posts - 1);
      parts.push(strut(new Vector3(x, roofY, zr), new Vector3(x, top, zr), t));
      parts.push(strut(new Vector3(x, y0 + h * 0.75, zr), new Vector3(x, roofY, zr - depth), t * 0.8));
    }
    for (const y of [y0 - 0.02, top]) parts.push(strut(new Vector3(-w / 2 - 0.05, y, zr), new Vector3(w / 2 + 0.05, y, zr), t));
    parts.push(strut(new Vector3(-w / 2, roofY + 0.02, zr - depth), new Vector3(w / 2, roofY + 0.02, zr - depth), t));
    const frame = mergeGeometries(parts)!;
    parts.forEach(g => g.dispose());
    this.add(frame, this.mats.steel, "neon sign frame");
  }
}
