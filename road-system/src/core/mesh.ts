/**
 * Plain mesh data (no three.js objects) and builders.
 * A 2D ground point (x, y) maps to world (x, h, −y). UVs are meters: (x, y) on
 * horizontal faces, (run length, height) on walls — materials set texture.repeat.
 */
import { ShapeUtils, Vector2 } from "three";
import { cross, dist, signedArea, sub, type Vec2 } from "./math2d";

export interface MeshData {
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  /** per-vertex RGB, only on meshes that called setColor() */
  colors?: Float32Array;
  /** per-vertex (x, z) of the owning object's centre, only on meshes that called
   *  setAnchor() — lets a shader treat a whole building at once (clear-the-view) */
  anchors?: Float32Array;
}

/** drop consecutive duplicate points (incl. last = first) that break triangulation */
export function cleanRing(ring: Vec2[], eps = 1e-6): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p);
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  return out;
}

export class MeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  private col: number[] | null = null;
  private cur: [number, number, number] = [1, 1, 1];
  private anc: number[] | null = null;
  private curAnchor: [number, number] = [0, 0];

  constructor(readonly material: string) {}

  /** colour for the vertices that follow (turns on a colour attribute for this mesh) */
  setColor(r: number, g: number, b: number): void {
    if (!this.col) this.col = new Array<number>(this.pos.length).fill(1); // earlier vertices: white
    this.cur = [r, g, b];
  }

  /** object centre (world-local x, z) for the vertices that follow */
  setAnchor(x: number, z: number): void {
    if (!this.anc) this.anc = new Array<number>((this.pos.length / 3) * 2).fill(0);
    this.curAnchor = [x, z];
  }

  private vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    if (this.col) this.col.push(...this.cur);
    if (this.anc) this.anc.push(...this.curAnchor);
    return this.pos.length / 3 - 1;
  }

  /** upward-facing horizontal polygon (optional holes) at height h */
  polygon(contour: Vec2[], holes: Vec2[][], h: number): void {
    const outer = cleanRing(contour);
    if (outer.length < 3) return;
    const inner = holes.map(r => cleanRing(r)).filter(r => r.length >= 3);
    const flat = [outer, ...inner].flat();
    const base = this.pos.length / 3;
    for (const p of flat) this.vertex(p.x, h, -p.y, 0, 1, 0, p.x, p.y);
    const v2 = (r: Vec2[]) => r.map(p => new Vector2(p.x, p.y));
    for (const [a, b, c] of ShapeUtils.triangulateShape(v2(outer), inner.map(v2))) {
      const area = cross(sub(flat[b], flat[a]), sub(flat[c], flat[a]));
      // drop slivers from collinear points (< 5 mm²): invisible, and float32 can flip them
      if (Math.abs(area) < 1e-5) continue;
      // CCW in 2D faces +Y under (x, y) → (x, h, −y)
      if (area > 0) this.idx.push(base + a, base + b, base + c);
      else this.idx.push(base + a, base + c, base + b);
    }
  }

  /** upward-facing CONVEX polygon at height h — triangle fan, the cheap path for marking quads */
  convex(pts: Vec2[], h: number): void {
    if (pts.length < 3) return;
    const ring = signedArea(pts) > 0 ? pts : [...pts].reverse();
    const base = this.pos.length / 3;
    for (const p of ring) this.vertex(p.x, h, -p.y, 0, 1, 0, p.x, p.y);
    for (let i = 1; i + 1 < ring.length; i++) this.idx.push(base, base + i, base + i + 1);
  }

  /** outward-facing vertical wall along a CCW loop, from h0 up to h1 */
  wall(loop: Vec2[], h0: number, h1: number): void {
    const ring = cleanRing(loop);
    let run = 0;
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k];
      const b = ring[(k + 1) % ring.length];
      const L = dist(a, b);
      if (L < 1e-9) continue;
      // outward = 2D right normal (dy, −dx) → world (dy, 0, dx)
      const nx = (b.y - a.y) / L;
      const nz = (b.x - a.x) / L;
      const i0 = this.vertex(a.x, h0, -a.y, nx, 0, nz, run, h0);
      const i1 = this.vertex(b.x, h0, -b.y, nx, 0, nz, run + L, h0);
      const i2 = this.vertex(b.x, h1, -b.y, nx, 0, nz, run + L, h1);
      const i3 = this.vertex(a.x, h1, -a.y, nx, 0, nz, run, h1);
      this.idx.push(i0, i1, i2, i0, i2, i3);
      run += L;
    }
  }

  build(): MeshData | null {
    if (!this.idx.length) return null;
    return {
      material: this.material,
      positions: new Float32Array(this.pos),
      normals: new Float32Array(this.nor),
      uvs: new Float32Array(this.uv),
      indices: new Uint32Array(this.idx),
      colors: this.col ? new Float32Array(this.col) : undefined,
      anchors: this.anc ? new Float32Array(this.anc) : undefined,
    };
  }
}

/** one builder per material → one draw call per material */
export class MeshSink {
  private builders = new Map<string, MeshBuilder>();

  get(material: string): MeshBuilder {
    let b = this.builders.get(material);
    if (!b) this.builders.set(material, (b = new MeshBuilder(material)));
    return b;
  }

  build(): MeshData[] {
    return [...this.builders.values()].map(b => b.build()).filter((m): m is MeshData => m !== null);
  }
}
