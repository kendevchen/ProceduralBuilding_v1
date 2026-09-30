/**
 * Loads the exported asset kit (public/assets/kit.glb + kit_manifest.json) and
 * renders placement lists as InstancedMeshes (one per unique mesh in each part).
 *
 * Materials are built from scratch from the source texture files — the GLB-embedded
 * materials come through as alpha-blended (depth-sorting breaks at grazing angles),
 * so they are replaced wholesale by name: building / floor / glass.
 */
import {
  Group, InstancedMesh, Matrix4, Mesh, Object3D, DoubleSide, Color,
  BufferAttribute, BufferGeometry,
  MeshStandardMaterial, MeshPhysicalMaterial, Material, Texture, TextureLoader,
  SRGBColorSpace, NoColorSpace, RepeatWrapping,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Placement } from "./generator";

export type TextureQuality = "low" | "high";

/** texture slot -> [file, sRGB] for the two kit materials */
const TEXTURE_FILES = {
  building: {
    map: ["Material_Base_color.png", true],
    normalMap: ["Material_Normal_OpenGL.png", false],
    roughnessMap: ["Material_Roughness.png", false],
    metalnessMap: ["Material_Metallic.png", false],
    emissiveMap: ["Material_Emissive.png", true],
  },
  floor: {
    map: ["floor_Base_color.png", true],
    normalMap: ["floor_Normal_OpenGL.png", false],
    roughnessMap: ["floor_Roughness.png", false],
    metalnessMap: ["floor_Metallic.png", false],
    emissiveMap: ["floor_Base_Emissive.png", true],
    alphaMap: ["floor_alpha.png", false],
  },
} as const;

type Slot = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "emissiveMap" | "alphaMap";
/** one resolution's textures: material name -> slot -> texture */
type TextureSet = Record<keyof typeof TEXTURE_FILES, Partial<Record<Slot, Texture>>>;

function tex(t: Texture, srgb: boolean): Texture {
  t.flipY = false; // glTF UV convention
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Load one resolution (textures/low = 1K, textures/high = 2K). Resolves once every
 *  image has decoded, so a swap never shows half-loaded (black) textures. */
async function loadTextureSet(quality: TextureQuality): Promise<TextureSet> {
  const loader = new TextureLoader();
  const set = { building: {}, floor: {} } as TextureSet;
  const jobs: Promise<void>[] = [];
  for (const [matName, slots] of Object.entries(TEXTURE_FILES)) {
    for (const [slot, [file, srgb]] of Object.entries(slots)) {
      jobs.push(loader.loadAsync(`${import.meta.env.BASE_URL}textures/${quality}/${file}`).then(t => {
        set[matName as keyof TextureSet][slot as Slot] = tex(t, srgb);
      }));
    }
  }
  await Promise.all(jobs);
  return set;
}

function disposeTextureSet(set: TextureSet): void {
  for (const slots of Object.values(set)) for (const t of Object.values(slots)) t?.dispose();
}

function buildMaterials(set: TextureSet): Record<string, Material> {
  const building = new MeshStandardMaterial({
    name: "building",
    ...set.building,
    roughness: 1,
    metalness: 1,
    emissive: new Color(0xffffff),
    emissiveIntensity: 1.4,
    side: DoubleSide,
  });
  const floor = new MeshStandardMaterial({
    name: "floor",
    ...set.floor,
    roughness: 1,
    metalness: 1,
    emissive: new Color(0xffffff),
    emissiveIntensity: 1, // driven by the "emissive" slider in building settings (1–50)
    alphaTest: 0.5, // cutout — no blend-sorting artifacts
    side: DoubleSide,
  });
  const glass = new MeshPhysicalMaterial({
    name: "glass",
    color: 0x9fb8c4,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: DoubleSide,
  });
  return { building, floor, glass };
}

interface ManifestCollection {
  children?: { index: number; kind: string; name: string }[];
  missing?: boolean;
}
interface Manifest {
  collections: Record<string, ManifestCollection>;
  objects: Record<string, unknown>;
}

const MIRROR_X = new Matrix4().makeScale(-1, 1, 1);

export class Kit {
  private parts = new Map<string, Object3D>();
  private manifest!: Manifest;
  private warned = new Set<string>();
  private mirrorCache = new Map<BufferGeometry, BufferGeometry>();
  /** dry (non-wet) clones of building/floor for interior parts — main.ts injects the
   *  rain wet shader into building/floor, and interiors (ROOMS/storeinside) must stay dry */
  private dryMaterials = new Map<Material, Material>();
  /** the from-scratch materials (building / floor / glass), set during load() */
  materials!: Record<string, Material>;
  /** when set, buildGroup adds a snow-shell pass (child group "snowShell") that
   *  shares geometry + instanceMatrix with the opaque meshes — zero extra memory */
  snowShellMaterial: Material | null = null;

  /**
   * Geometry with the X-mirror baked in (negated positions/normals/tangents,
   * reversed winding). Needed because InstancedMesh transforms normals with the
   * plain instance matrix: a reflection (negative determinant) flips winding, and
   * with DoubleSide the shader then negates the normal for "back" faces — so every
   * mirrored instance would be lit with inverted normals. Baking the mirror into
   * the geometry and cancelling it in the matrix keeps every determinant positive.
   */
  private mirroredGeometry(src: BufferGeometry): BufferGeometry {
    let g = this.mirrorCache.get(src);
    if (g) return g;
    g = src.clone();
    for (const name of ["position", "normal", "tangent"]) {
      const attr = g.getAttribute(name) as BufferAttribute | undefined;
      if (!attr) continue;
      for (let i = 0; i < attr.count; i++) attr.setX(i, -attr.getX(i));
      if (name === "tangent" && attr.itemSize === 4) {
        for (let i = 0; i < attr.count; i++) attr.setW(i, -attr.getW(i));
      }
      attr.needsUpdate = true;
    }
    if (!g.index) {
      const n = g.getAttribute("position").count;
      const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
      for (let i = 0; i < n; i++) arr[i] = i;
      g.setIndex(new BufferAttribute(arr, 1));
    }
    const idx = g.index!;
    for (let i = 0; i + 2 < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
    g.computeBoundingSphere();
    this.mirrorCache.set(src, g);
    return g;
  }

  count(collection: string): number {
    const c = this.manifest.collections[collection];
    return c?.children?.length || 1;
  }

  /** Set the floor emissive intensity on BOTH the exterior floor material and its
   *  dry interior clone, so glowing rooms/storeinside track the "emissive" slider
   *  (they render with the dry clone to stay out of the rain wetness). */
  setFloorEmissive(v: number): void {
    const floor = this.materials?.floor as MeshStandardMaterial | undefined;
    if (floor) floor.emissiveIntensity = v;
    const dry = floor && (this.dryMaterials.get(floor) as MeshStandardMaterial | undefined);
    if (dry) dry.emissiveIntensity = v;
  }

  /** building (facade) emissive intensity — lit windows at night — on it and its dry clone */
  setBuildingEmissive(v: number): void {
    const b = this.materials?.building as MeshStandardMaterial | undefined;
    if (b) b.emissiveIntensity = v;
    const dry = b && (this.dryMaterials.get(b) as MeshStandardMaterial | undefined);
    if (dry) dry.emissiveIntensity = v;
  }

  /** resolution currently bound to the materials */
  currentQuality: TextureQuality = "low";
  /** last requested resolution — a slow 2K load is dropped if this moved on meanwhile */
  private wantedQuality: TextureQuality = "low";
  private textureSets = new Map<TextureQuality, TextureSet>();
  private textureLoads = new Map<TextureQuality, Promise<TextureSet>>();

  /**
   * Swap the kit textures between 1K and 2K. Each set is loaded once and cached; the
   * swap happens only after the whole set has decoded. Every slot stays non-null, so
   * swapping texture objects needs no shader recompile (no needsUpdate).
   */
  async setTextureQuality(quality: TextureQuality): Promise<void> {
    this.wantedQuality = quality;
    if (this.currentQuality === quality) return;
    let set = this.textureSets.get(quality);
    if (!set) {
      // already loading: the first caller applies it (auto LOD calls this every frame)
      if (this.textureLoads.has(quality)) return;
      const job = loadTextureSet(quality);
      this.textureLoads.set(quality, job);
      set = await job;
      this.textureLoads.delete(quality);
      this.textureSets.set(quality, set);
    }
    if (this.wantedQuality !== quality) return;
    this.applyTextureSet(set);
    this.currentQuality = quality;
  }

  /** Free the 2K set's GPU memory (only when it isn't bound). */
  releaseHighTextures(): void {
    const set = this.textureSets.get("high");
    if (!set || this.currentQuality === "high" || this.wantedQuality === "high") return;
    disposeTextureSet(set);
    this.textureSets.delete("high");
  }

  private applyTextureSet(set: TextureSet): void {
    for (const matName of ["building", "floor"] as const) {
      const mat = this.materials[matName] as MeshStandardMaterial;
      const dry = this.dryMaterials.get(mat) as MeshStandardMaterial | undefined;
      for (const target of dry ? [mat, dry] : [mat]) Object.assign(target, set[matName]);
    }
  }

  async load(glbUrl: string, manifestUrl: string): Promise<void> {
    // start at 1K; the 2K set is only fetched when the camera zooms in
    const [gltf, manifest, lowSet] = await Promise.all([
      new GLTFLoader().loadAsync(glbUrl),
      fetch(manifestUrl).then(r => r.json() as Promise<Manifest>),
      loadTextureSet("low"),
    ]);
    this.textureSets.set("low", lowSet);
    this.manifest = manifest;
    // GLTFLoader sanitizes Object3D names (strips [ ] . and spaces) — recover the
    // original glTF node names through the parser associations
    const json = gltf.parser.json as { nodes?: { name?: string }[] };
    const assoc = gltf.parser.associations as Map<Object3D, { nodes?: number }>;
    for (const child of [...gltf.scene.children]) {
      const a = assoc.get(child);
      const original = a?.nodes !== undefined ? json.nodes?.[a.nodes]?.name : undefined;
      this.parts.set(original ?? child.name, child);
      child.updateMatrixWorld(true);
    }
    // replace GLB-embedded materials with the from-scratch ones (matched by name;
    // Blender exports "building", "floor", "glass")
    const materials = buildMaterials(lowSet);
    this.materials = materials;

    // dry clones for interior parts — cloned now (before main.ts injects the wet
    // shader into building/floor), so they never pick up the rain wetness
    this.dryMaterials.set(materials.building, materials.building.clone());
    this.dryMaterials.set(materials.floor, materials.floor.clone());
    const fallback = materials.building;
    gltf.scene.traverse(o => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const current = mesh.material as Material;
      const name = (current?.name ?? "").toLowerCase();
      let next = fallback;
      for (const key of Object.keys(materials)) {
        if (name.includes(key)) { next = materials[key]; break; }
      }
      mesh.material = next;
    });
  }

  /** Build a Group of InstancedMeshes from placements (matrices in Blender Z-up space). */
  buildGroup(placements: Placement[]): Group {
    const group = new Group();
    const byPart = new Map<string, Matrix4[]>();
    for (const pl of placements) {
      let list = byPart.get(pl.key);
      if (!list) byPart.set(pl.key, (list = []));
      list.push(pl.matrix);
    }

    // separate layer of duplicated (buffer-shared) meshes that the snow shader
    // extrudes — the base building geometry stays untouched
    const snowLayer = new Group();
    snowLayer.name = "snowShell";
    snowLayer.visible = false;

    const tmp = new Matrix4();
    for (const [key, matrices] of byPart) {
      // interior parts (rooms / store interiors) never see the sky — no snow shell,
      // and they use the dry material clone so the rain wetness skips them too
      const interior = key.includes("ROOMS") || key.includes("storeinside");
      const part = this.parts.get(key);
      if (!part) {
        if (!this.warned.has(key)) {
          this.warned.add(key);
          console.warn(`kit: missing part ${key}`);
        }
        continue;
      }
      part.traverse(o => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        // meshLocal = mesh transform relative to the part root (GLTFLoader splits
        // multi-material primitives into separate meshes, so material is single)
        const rootInv = new Matrix4().copy(part.matrixWorld).invert();
        const meshLocal = rootInv.multiply(mesh.matrixWorld);

        // split instances by determinant sign: mirrored placements get the
        // mirror baked into the geometry instead of the matrix (see mirroredGeometry)
        const plain: Matrix4[] = [];
        const mirrored: Matrix4[] = [];
        for (const m of matrices) {
          tmp.copy(m).multiply(meshLocal);
          if (tmp.determinant() < 0) mirrored.push(tmp.clone().multiply(MIRROR_X));
          else plain.push(tmp.clone());
        }
        for (const [geom, list] of [
          [mesh.geometry, plain],
          [mirrored.length ? this.mirroredGeometry(mesh.geometry) : null, mirrored],
        ] as const) {
          if (!geom || list.length === 0) continue;
          // interior meshes render with the dry clone (falls back to the original for
          // glass / anything not cloned) so the rain wet shader never touches them
          const baseMat = mesh.material as Material;
          const imMat = interior ? (this.dryMaterials.get(baseMat) ?? baseMat) : baseMat;
          const im = new InstancedMesh(geom, imMat, list.length);
          im.name = key; // e.g. COL[roof][2] — used by the hover inspector
          im.castShadow = true;
          im.receiveShadow = true;
          for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
          im.instanceMatrix.needsUpdate = true;
          group.add(im);

          // snow shell pass for opaque kit materials: same geometry, SAME
          // instanceMatrix buffer — only the vertex shader extrudes it
          if (this.snowShellMaterial && !interior &&
              (mesh.material === this.materials.building || mesh.material === this.materials.floor)) {
            const shell = new InstancedMesh(geom, this.snowShellMaterial, list.length);
            shell.instanceMatrix = im.instanceMatrix;
            shell.castShadow = false;
            shell.receiveShadow = true;
            snowLayer.add(shell);
          }
        }
      });
    }
    if (snowLayer.children.length) group.add(snowLayer);
    return group;
  }
}
