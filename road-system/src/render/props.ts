/**
 * Street-furniture models (procedural, meters, each facing local +x) → one
 * InstancedMesh per part. Prototype geometry is built once and shared by every
 * rebuild; only the instance buffers change. No DOM access, so tests can count
 * triangles in Node.
 */
import {
  BoxGeometry, BufferGeometry, CircleGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group,
  IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Prop, PropKind, PropPlan } from "../core/props";
import { hash01 } from "../core/rng";

interface Part {
  name: string;
  geometry: BufferGeometry;
  material: string;
  castShadow: boolean;
}

const merge = (geoms: BufferGeometry[]): BufferGeometry => {
  const flat = geoms.map(g => (g.index ? g.toNonIndexed() : g));
  const m = mergeGeometries(flat)!;
  flat.forEach(g => g.dispose());
  return m;
};

function lampParts(): Part[] {
  // open-ended cylinders: the caps are never seen (a street city has ~1000 props)
  const pole = new CylinderGeometry(0.06, 0.09, 8, 6, 1, true);
  pole.translate(0, 4, 0);
  const arm = new BoxGeometry(1.6, 0.07, 0.07);
  arm.translate(0.75, 7.9, 0);
  const head = new BoxGeometry(0.55, 0.12, 0.26);
  head.translate(1.45, 7.82, 0);
  return [
    { name: "lamp pole", geometry: merge([pole, arm]), material: "pole", castShadow: true },
    { name: "lamp head", geometry: head, material: "lamp", castShadow: false },
  ];
}

/** low-poly canopy: three faceted blobs, per-face greens (vertex colours) */
function treeParts(): Part[] {
  const trunk = new CylinderGeometry(0.08, 0.13, 3.2, 5, 1, true);
  trunk.translate(0, 1.6, 0);
  const blobs: BufferGeometry[] = [];
  for (let b = 0; b < 3; b++) {
    const r = 1.2 + 0.35 * hash01(b, 5);
    const g = new IcosahedronGeometry(r, 0);
    const a = b * 2.4;
    const d = b === 0 ? 0 : 0.85;
    g.translate(Math.cos(a) * d, 3.9 + (b === 0 ? 0.7 : 0.25 * hash01(b, 6)), Math.sin(a) * d);
    blobs.push(g);
  }
  const canopy = mergeGeometries(blobs)!;
  blobs.forEach(g => g.dispose());
  const pos = canopy.getAttribute("position");
  const colors = new Float32Array(pos.count * 3);
  const c = new Color();
  const dark = new Color(0x2f5a24);
  const light = new Color(0x7aa442);
  for (let f = 0; f < pos.count; f += 3) {
    c.copy(dark).lerp(light, 0.25 + 0.6 * hash01(f, 9));
    for (let k = 0; k < 3; k++) c.toArray(colors, (f + k) * 3);
  }
  canopy.setAttribute("color", new Float32BufferAttribute(colors, 3));
  canopy.computeVertexNormals();
  return [
    { name: "tree trunk", geometry: trunk, material: "trunk", castShadow: true },
    { name: "tree canopy", geometry: canopy, material: "canopy", castShadow: true },
  ];
}

function bollardParts(): Part[] {
  const post = new CylinderGeometry(0.09, 0.1, 0.9, 6);
  post.translate(0, 0.45, 0);
  return [{ name: "bollard", geometry: post, material: "bollard", castShadow: false }];
}

/** signal heights of the red / amber / green lamps */
const SIGNAL_LAMP_Y = [3.62, 3.3, 2.98];
const SIGNAL_FACE_X = 0.28;

function signalParts(): Part[] {
  const pole = new CylinderGeometry(0.07, 0.08, 3.1, 6, 1, true);
  pole.translate(0, 1.55, 0);
  const housing = new BoxGeometry(0.3, 1.0, 0.36);
  housing.translate(0.12, 3.3, 0);
  // lamp lenses: flat discs on the housing face (+x)
  const dark = SIGNAL_LAMP_Y.map(y => {
    const d = new CircleGeometry(0.11, 8);
    d.rotateY(Math.PI / 2);
    d.translate(SIGNAL_FACE_X, y, 0);
    return d;
  });
  return [{ name: "signal", geometry: merge([pole, housing, ...dark]), material: "signal", castShadow: true }];
}

/** the lit lamp disc of a signal, just in front of its dark counterpart */
function litDisc(): BufferGeometry {
  const d = new CircleGeometry(0.1, 8);
  d.rotateY(Math.PI / 2);
  d.translate(SIGNAL_FACE_X + 0.012, 0, 0);
  return d;
}

let prototypes: Record<PropKind, Part[]> | null = null;
function parts(): Record<PropKind, Part[]> {
  prototypes ??= { lamp: lampParts(), tree: treeParts(), bollard: bollardParts(), signal: signalParts() };
  return prototypes;
}

const trisOf = (g: BufferGeometry) => (g.index ? g.index.count : g.getAttribute("position").count) / 3;

/** rendered triangles of a prop plan (instances × prototype) */
export function propTriangles(plan: PropPlan): number {
  const per = Object.fromEntries(
    Object.entries(parts()).map(([k, ps]) => [k, ps.reduce((n, p) => n + trisOf(p.geometry), 0)]),
  ) as Record<PropKind, number>;
  const disc = trisOf(litDisc());
  return plan.props.reduce((n, p) => n + per[p.kind] + (p.kind === "signal" ? disc : 0), 0);
}

const LIT_COLORS = [0xff3b2e, 0xffb020, 0x3dff7a];

export class PropRenderer {
  private mats: Record<string, MeshStandardMaterial> = {
    pole: new MeshStandardMaterial({ name: "pole", color: 0x5d6368, metalness: 0.6, roughness: 0.45 }),
    lamp: new MeshStandardMaterial({ name: "lamp", color: 0xf1eee6, emissive: new Color(0xffdca0), emissiveIntensity: 0.1 }),
    trunk: new MeshStandardMaterial({ name: "trunk", color: 0x5a4633, roughness: 0.95 }),
    canopy: new MeshStandardMaterial({ name: "canopy", vertexColors: true, flatShading: true, roughness: 0.85 }),
    bollard: new MeshStandardMaterial({ name: "bollard", color: 0x767c82, metalness: 0.3, roughness: 0.6 }),
    signal: new MeshStandardMaterial({ name: "signal", color: 0x1e2023, roughness: 0.6 }),
  };
  private lit = LIT_COLORS.map(c => new MeshStandardMaterial({ color: 0x000000, emissive: new Color(c), emissiveIntensity: 2.2 }));
  private disc = litDisc();

  /** a fresh group of InstancedMeshes for the plan; props stand on the sidewalk at baseHeight */
  build(plan: PropPlan, baseHeight: number): Group {
    const group = new Group();
    group.name = "street furniture";
    const byKind = new Map<PropKind, Prop[]>();
    for (const pr of plan.props) byKind.set(pr.kind, [...(byKind.get(pr.kind) ?? []), pr]);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const matrixOf = (pr: Prop, lift = 0) =>
      m.compose(new Vector3(pr.p.x, baseHeight + lift, -pr.p.y), q.setFromAxisAngle(up, pr.rot),
        new Vector3(pr.scale, pr.scale, pr.scale)).clone();
    const instanced = (geom: BufferGeometry, mat: MeshStandardMaterial, list: Matrix4[], name: string, cast: boolean) => {
      if (!list.length) return;
      const im = new InstancedMesh(geom, mat, list.length);
      list.forEach((mx, i) => im.setMatrixAt(i, mx));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.name = name;
      im.castShadow = cast;
      im.receiveShadow = true;
      group.add(im);
    };
    for (const [kind, list] of byKind) {
      const mats = list.map(pr => matrixOf(pr));
      for (const part of parts()[kind]) instanced(part.geometry, this.mats[part.material], mats, part.name, part.castShadow);
      if (kind === "signal") {
        LIT_COLORS.forEach((_, state) => {
          const lit = list.filter(pr => pr.state === state).map(pr => matrixOf(pr, SIGNAL_LAMP_Y[state] * pr.scale));
          instanced(this.disc, this.lit[state], lit, `signal lamp ${state}`, false);
        });
      }
    }
    return group;
  }

  /** 0 = day … 1 = night: street lamps glow (bloom picks them up) */
  setNight(n: number): void {
    this.mats.lamp.emissiveIntensity = 0.1 + 5 * n;
  }
}

/** free a built group's instance buffers (prototypes are shared and stay) */
export function disposeProps(group: Group): void {
  group.traverse(o => {
    if (o instanceof InstancedMesh) o.dispose();
  });
}
