/**
 * Materials for the core's material names. Mesh UVs are ground meters, so each
 * texture's repeat = 1 / (meters its canvas covers).
 *
 * The massing material carries two shader features (onBeforeCompile):
 *   - facade windows: a window grid on every wall (floor height × window pitch),
 *     glass-dark by day; at night a random share of them glows (uNight, uLit)
 *   - clear the view: whole buildings (via their `anchor` = centre) standing between
 *     camera and target are squashed to uClearH — also in the shadow (depth) pass
 */
import {
  CanvasTexture, Color, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, RepeatWrapping,
  SRGBColorSpace, Vector2, type Material, type WebGLProgramParametersWithUniforms,
} from "three";

/** small deterministic PRNG so textures look the same on every load */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(px: number, meters: number, draw: (g: CanvasRenderingContext2D, px: number) => void): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = px;
  draw(c.getContext("2d")!, px);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  t.repeat.set(1 / meters, 1 / meters);
  return t;
}

/** draw a feature at all 9 wrap offsets so the texture tiles seamlessly */
function wrapped(px: number, draw: (dx: number, dy: number) => void): void {
  for (const dx of [-px, 0, px]) for (const dy of [-px, 0, px]) draw(dx, dy);
}

/** 0.5 m square pavers, 4 × 4 per 2 m tile, each with its own shade */
function pavingTexture(): CanvasTexture {
  const rand = prng(7);
  return canvasTexture(512, 2, (g, px) => {
    g.fillStyle = "#8e8a82";
    g.fillRect(0, 0, px, px);
    const n = 4;
    const cell = px / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = rand();
        g.fillStyle = `rgb(${190 + v * 20}, ${184 + v * 20}, ${172 + v * 18})`;
        g.fillRect(x * cell + 3, y * cell + 3, cell - 6, cell - 6);
      }
    }
  });
}

/** worn asphalt over 12 m: repair patches, oil stains, cracks, fine aggregate */
function asphaltTexture(): CanvasTexture {
  const rand = prng(11);
  return canvasTexture(1024, 12, (g, px) => {
    g.fillStyle = "#56595d";
    g.fillRect(0, 0, px, px);
    for (let i = 0; i < 8; i++) {
      // repair patches: squarish, slightly darker or lighter
      const [x, y, w, h] = [rand() * px, rand() * px, 60 + rand() * 240, 40 + rand() * 170];
      const v = rand() < 0.5 ? 66 : 104;
      g.fillStyle = `rgba(${v}, ${v}, ${v + 4}, 0.38)`;
      wrapped(px, (dx, dy) => g.fillRect(x + dx, y + dy, w, h));
    }
    for (let i = 0; i < 14; i++) {
      // oil stains: soft dark blots
      const [x, y, r] = [rand() * px, rand() * px, 10 + rand() * 38];
      wrapped(px, (dx, dy) => {
        const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        grd.addColorStop(0, "rgba(22, 23, 26, 0.35)");
        grd.addColorStop(1, "rgba(22, 23, 26, 0)");
        g.fillStyle = grd;
        g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
      });
    }
    for (let i = 0; i < 26000; i++) {
      // fine aggregate
      const v = 64 + rand() * 60;
      g.fillStyle = `rgba(${v}, ${v}, ${v + 3}, ${0.22 + rand() * 0.35})`;
      g.fillRect(rand() * px, rand() * px, 1 + rand() * 2, 1 + rand() * 2);
    }
    g.strokeStyle = "rgba(28, 29, 32, 0.55)";
    g.lineWidth = 1.3;
    for (let i = 0; i < 10; i++) {
      // cracks: short jittered polylines
      let [x, y] = [rand() * px, rand() * px];
      let a = rand() * Math.PI * 2;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 6 + rand() * 8; k++) {
        a += (rand() - 0.5) * 1.1;
        x += Math.cos(a) * (8 + rand() * 18);
        y += Math.sin(a) * (8 + rand() * 18);
        pts.push([x, y]);
      }
      wrapped(px, (dx, dy) => {
        g.beginPath();
        pts.forEach(([px2, py2], k) => (k ? g.lineTo(px2 + dx, py2 + dy) : g.moveTo(px2 + dx, py2 + dy)));
        g.stroke();
      });
    }
  });
}

/** yellow tactile tiles (0.3 m) with a raised-dot grid */
function tactileTexture(): CanvasTexture {
  return canvasTexture(256, 0.6, (g, px) => {
    g.fillStyle = "#d9a91f";
    g.fillRect(0, 0, px, px);
    g.strokeStyle = "rgba(120, 90, 10, 0.55)";
    g.lineWidth = 3;
    g.strokeRect(0, 0, px / 2, px / 2);
    g.strokeRect(px / 2, 0, px / 2, px / 2);
    g.strokeRect(0, px / 2, px / 2, px / 2);
    g.strokeRect(px / 2, px / 2, px / 2, px / 2);
    g.fillStyle = "#f1c542";
    const n = 8;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.beginPath();
        g.arc(((x + 0.5) * px) / n, ((y + 0.5) * px) / n, px / n / 4, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** the anchor attribute + clear-the-view clamp, shared by the colour and depth shaders */
const CLEAR_VIEW_PARS = /* glsl */ `
attribute vec2 anchor;
uniform float uClearOn;
uniform vec2 uClearA;
uniform vec2 uClearB;
uniform float uClearR;
uniform float uClearH;`;
const CLEAR_VIEW_MAIN = /* glsl */ `
if (uClearOn > 0.5) {
  vec2 ab = uClearB - uClearA;
  float t = dot(anchor - uClearA, ab) / max(dot(ab, ab), 1e-6);
  float d = length(anchor - (uClearA + ab * clamp(t, 0.0, 1.0)));
  if (t > 0.0 && t < 1.0 && d < uClearR) transformed.y = min(transformed.y, uClearH);
}`;

export class Materials {
  private byName = new Map<string, MeshStandardMaterial>();
  private fallback = new MeshStandardMaterial({ name: "missing", color: 0xff00ff });

  /** shader uniforms of the massing material (windows + clear the view) */
  readonly massingUniforms = {
    uNight: { value: 0 },
    uLit: { value: 0.4 },
    uFloorH: { value: 3 },
    uBase: { value: 0.15 },
    uWinW: { value: 2.4 },
    uClearOn: { value: 0 },
    uClearA: { value: new Vector2() },
    uClearB: { value: new Vector2() },
    uClearR: { value: 18 },
    uClearH: { value: 6 },
  };
  /** shadow-pass twin of the massing material, so squashed buildings cast squashed shadows */
  readonly massingDepth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });

  constructor() {
    const add = (m: MeshStandardMaterial) => this.byName.set(m.name, m);
    add(new MeshStandardMaterial({ name: "asphalt", map: asphaltTexture(), roughness: 0.95 }));
    add(new MeshStandardMaterial({ name: "curb", color: 0xd4d1c9, roughness: 0.85 }));
    add(new MeshStandardMaterial({ name: "sidewalk", map: pavingTexture(), roughness: 0.9 }));
    add(new MeshStandardMaterial({ name: "lot", color: 0xa9a499, roughness: 0.95 }));
    add(new MeshStandardMaterial({ name: "hero", color: 0xff8a3d, roughness: 0.7, emissive: new Color(0x401600) }));
    add(new MeshStandardMaterial({ name: "marking-white", color: 0xf1f0ea, roughness: 0.6 }));
    add(new MeshStandardMaterial({ name: "marking-yellow", color: 0xf0b92a, roughness: 0.6 }));
    add(new MeshStandardMaterial({ name: "road-metal", color: 0x3b3e42, metalness: 0.6, roughness: 0.55 }));
    add(new MeshStandardMaterial({ name: "tactile", map: tactileTexture(), roughness: 0.8 }));
    // per-building shade comes in as vertex colour; windows + clear-view in the shader
    const massing = new MeshStandardMaterial({ name: "massing", color: 0xffffff, vertexColors: true, roughness: 0.85 });
    massing.onBeforeCompile = shader => this.injectMassing(shader);
    add(massing);
    this.massingDepth.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.massingUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>${CLEAR_VIEW_PARS}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>${CLEAR_VIEW_MAIN}`);
    };
  }

  /** material for a core material name (magenta = not defined yet) */
  get = (name: string): MeshStandardMaterial => this.byName.get(name) ?? this.fallback;

  /** shadow-pass material override for a mesh, if it needs one */
  depth = (name: string): Material | undefined => (name === "massing" ? this.massingDepth : undefined);

  setWireframe(on: boolean): void {
    for (const m of this.byName.values()) m.wireframe = on;
  }

  /** 0 = day … 1 = night: lit windows glow */
  setNight(n: number): void {
    this.massingUniforms.uNight.value = n;
  }

  /** window rows follow the massing floor height, starting at the lot surface */
  configureWindows(floorHeight: number, base: number): void {
    this.massingUniforms.uFloorH.value = floorHeight;
    this.massingUniforms.uBase.value = base;
  }

  /** camera / target in the city's local meters (x, z); height = squashed roof height */
  setClearView(on: boolean, camX: number, camZ: number, targetX: number, targetZ: number,
               radius: number, height: number): void {
    const u = this.massingUniforms;
    u.uClearOn.value = on ? 1 : 0;
    u.uClearA.value.set(camX, camZ);
    u.uClearB.value.set(targetX, targetZ);
    u.uClearR.value = radius;
    u.uClearH.value = height;
  }

  private injectMassing(shader: WebGLProgramParametersWithUniforms): void {
    Object.assign(shader.uniforms, this.massingUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", /* glsl */ `#include <common>${CLEAR_VIEW_PARS}
varying vec2 vAnchor;
varying vec2 vFacade;
varying float vWall;`)
      .replace("#include <begin_vertex>", /* glsl */ `#include <begin_vertex>${CLEAR_VIEW_MAIN}
vAnchor = anchor;
vWall = 1.0 - step(0.5, abs(normal.y));
// facade coordinates: along the wall (projected on its tangent) and up
vFacade = vec2(dot(transformed.xz, vec2(-normal.z, normal.x)), transformed.y);`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", /* glsl */ `#include <common>
varying vec2 vAnchor;
varying vec2 vFacade;
varying float vWall;
uniform float uNight;
uniform float uLit;
uniform float uFloorH;
uniform float uBase;
uniform float uWinW;`)
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
float winMask = 0.0;
if (vWall > 0.5) {
  vec2 cell = vec2(vFacade.x / uWinW, (vFacade.y - uBase) / uFloorH);
  vec2 fc = fract(cell);
  // one window per cell, none on the lowest 0.7 floor (shopfront zone)
  winMask = step(0.18, fc.x) * step(fc.x, 0.82) * step(0.3, fc.y) * step(fc.y, 0.85) * step(0.7, cell.y);
  vec2 wid = floor(cell) + vAnchor * 0.0731;
  float h = fract(sin(dot(wid, vec2(12.9898, 78.233))) * 43758.5453);
  float lit = winMask * step(1.0 - uLit, h);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.34, 0.40), winMask * 0.85);
  // ~1.1: bright, but under a night bloom threshold (1.2) — a thousand blooming windows
  // would veil the whole frame; signs, neon and lamps (≥ 4) still bloom
  totalEmissiveRadiance += lit * uNight * mix(vec3(1.0, 0.78, 0.5), vec3(0.82, 0.9, 1.0), step(0.8, h)) * 1.1;
}`)
      .replace("#include <roughnessmap_fragment>", /* glsl */ `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.2, winMask); // glass reflects the sky`);
  }
}
