/** MeshData / DebugLines (plain core output) → three.js objects. */
import { BufferAttribute, BufferGeometry, Group, LineBasicMaterial, LineSegments, Mesh, type Material } from "three";
import type { MeshData } from "../core/mesh";
import type { DebugLines } from "../core/debug";

/** only volumes cast shadows — flat ground layers would just waste shadow-map fill */
const SHADOW_CASTERS = new Set(["massing", "hero"]);

/** what toGroup needs from a material library */
export interface MaterialSource {
  get(name: string): Material;
  /** optional shadow-pass override (customDepthMaterial) */
  depth?(name: string): Material | undefined;
}

export function toGroup(meshes: MeshData[], materials: MaterialSource): Group {
  const group = new Group();
  group.name = "city";
  for (const m of meshes) {
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(m.positions, 3));
    geom.setAttribute("normal", new BufferAttribute(m.normals, 3));
    geom.setAttribute("uv", new BufferAttribute(m.uvs, 2));
    if (m.colors) geom.setAttribute("color", new BufferAttribute(m.colors, 3));
    if (m.anchors) geom.setAttribute("anchor", new BufferAttribute(m.anchors, 2));
    geom.setIndex(new BufferAttribute(m.indices, 1));
    geom.computeBoundingSphere();
    const mesh = new Mesh(geom, materials.get(m.material));
    const depth = materials.depth?.(m.material);
    if (depth) mesh.customDepthMaterial = depth;
    mesh.name = m.material;
    mesh.receiveShadow = true;
    mesh.castShadow = SHADOW_CASTERS.has(m.material);
    group.add(mesh);
  }
  return group;
}

/** overlay lines drawn on top of everything (depth test off) */
export function debugGroup(lines: DebugLines[]): Group {
  const group = new Group();
  group.name = "debug";
  for (const l of lines) {
    const geom = new BufferGeometry();
    geom.setAttribute("position", new BufferAttribute(l.positions, 3));
    const seg = new LineSegments(geom, new LineBasicMaterial({ color: l.color, depthTest: false, transparent: true }));
    seg.name = l.name;
    seg.renderOrder = 10;
    seg.frustumCulled = false;
    group.add(seg);
  }
  return group;
}

/** free geometries (and the per-build debug line materials); shared materials stay */
export function disposeGroup(group: Group): void {
  group.traverse(o => {
    if (o instanceof Mesh || o instanceof LineSegments) o.geometry.dispose();
    if (o instanceof LineSegments) (o.material as Material).dispose();
  });
}
