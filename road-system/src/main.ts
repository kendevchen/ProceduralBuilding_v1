/**
 * Road System Lab — standalone demo page. Scene, cameras, lights and GUI only; all
 * geometry comes from core/buildCity (pure) and is converted in render/.
 */
import {
  ACESFilmicToneMapping, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, OrthographicCamera, PCFSoftShadowMap, PerspectiveCamera, Plane, PlaneGeometry,
  Raycaster, SRGBColorSpace, Scene, Vector2, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import GUI from "lil-gui";
import { defaultCityParams, type CityParams, type RoadClassParams } from "./params";
import { buildCity, type CityResult } from "./core/city";
import { roadDegree } from "./core/graph";
import { Materials } from "./render/materials";
import { debugGroup, disposeGroup, toGroup } from "./render/build";
import { PropRenderer, disposeProps, propTriangles } from "./render/props";

const BG = 0xdde3e8;

// logarithmic depth like the building project, so marking z-separation is tested as it
// will be rendered after integration (polygonOffset would be ignored there)
const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
document.getElementById("app")!.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(BG);
scene.fog = new Fog(BG, 900, 2600);
const hemi = new HemisphereLight(0xf1f5ff, 0x7d8388, 1.4);
scene.add(hemi);
const sun = new DirectionalLight(0xfff2e0, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const SUN_DIR = new Vector3(-0.45, 0.8, 0.4).normalize();

// ground beyond the map edge
const outside = new Mesh(new PlaneGeometry(10000, 10000), new MeshStandardMaterial({ color: 0xb4b9bc, roughness: 1 }));
outside.rotation.x = -Math.PI / 2;
outside.position.y = -0.05;
outside.receiveShadow = true;
scene.add(outside);

// perspective orbit camera + top-down orthographic camera (2D north = world −Z = screen up)
const persp = new PerspectiveCamera(40, innerWidth / innerHeight, 1, 6000);
persp.position.set(230, 210, 300);
const perspControls = new OrbitControls(persp, renderer.domElement);
perspControls.enableDamping = true;
perspControls.maxPolarAngle = Math.PI * 0.48;
perspControls.maxDistance = 3000;

const topCam = new OrthographicCamera(-1, 1, 1, -1, 1, 4000);
topCam.up.set(0, 0, -1);
topCam.position.set(0, 1500, 0);
topCam.lookAt(0, 0, 0);
const topControls = new OrbitControls(topCam, renderer.domElement);
topControls.enableRotate = false;
topControls.screenSpacePanning = true;
topControls.enabled = false;

const params: CityParams = defaultCityParams();
const view = { top: false, debug: true, wireframe: false, night: 0, clear: false, clearRadius: 18 };
const props = new PropRenderer();
let propsGroup: Group | null = null;
const DAY_BG = new Color(BG);
const NIGHT_BG = new Color(0x0b1020);

/** lab-only night preview: dim the lights, darken the sky, light lamps + windows */
function applyNight(): void {
  const n = view.night;
  hemi.intensity = 1.4 - 1.22 * n;
  sun.intensity = 2.2 - 2.05 * n;
  const bg = DAY_BG.clone().lerp(NIGHT_BG, n);
  scene.background = bg;
  (scene.fog as Fog).color.copy(bg);
  materials.setNight(n);
  props.setNight(n);
}
const materials = new Materials();
let city: CityResult | null = null;
let cityGroup: Group | null = null;
let debug: Group | null = null;
const timing = { core: 0, total: 0 };

/** fit the ortho frustum (and optionally re-centre) to the map */
function fitTop(recentre: boolean): void {
  if (!city) return;
  const b = city.bounds;
  const aspect = innerWidth / innerHeight;
  const h = Math.max((b.maxY - b.minY) / 2, (b.maxX - b.minX) / 2 / aspect) * 1.04;
  topCam.left = -h * aspect;
  topCam.right = h * aspect;
  topCam.top = h;
  topCam.bottom = -h;
  topCam.updateProjectionMatrix();
  if (recentre) {
    const cx = (b.minX + b.maxX) / 2;
    const cz = -(b.minY + b.maxY) / 2;
    topCam.position.set(cx, 1500, cz);
    topControls.target.set(cx, 0, cz);
    topCam.zoom = 1;
    topCam.updateProjectionMatrix();
  }
}

function fitSun(): void {
  const b = city!.bounds;
  const r = (Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2) * 1.15; // margin for tall blocks
  sun.position.copy(SUN_DIR).multiplyScalar(r * 2);
  sun.target.position.set(0, 0, 0);
  const cam = sun.shadow.camera;
  cam.left = -r;
  cam.right = r;
  cam.top = r;
  cam.bottom = -r;
  cam.near = 1;
  cam.far = r * 4;
  cam.updateProjectionMatrix();
}

function rebuild(): void {
  const t0 = performance.now();
  city = buildCity(params);
  if (cityGroup) {
    scene.remove(cityGroup);
    disposeGroup(cityGroup);
  }
  if (debug) {
    scene.remove(debug);
    disposeGroup(debug);
  }
  cityGroup = toGroup(city.meshes, materials);
  debug = debugGroup(city.debug);
  debug.visible = view.debug;
  if (propsGroup) {
    scene.remove(propsGroup);
    disposeProps(propsGroup);
  }
  propsGroup = props.build(city.props, params.curbHeight);
  materials.configureWindows(params.massing.floorHeight, params.curbHeight);
  scene.add(cityGroup, debug, propsGroup);
  timing.core = city.stats.ms;
  timing.total = performance.now() - t0;
  fitSun();
  fitTop(false);
  updateStats();
}

const statsEl = document.getElementById("stats")!;
function updateStats(): void {
  if (!city) return;
  const s = city.stats;
  statsEl.textContent =
    `重建 ${timing.total.toFixed(1)} ms（核心 ${timing.core.toFixed(1)} ms）\n` +
    `街廓 ${s.blocks} · 節點 ${s.nodes} · 路段 ${s.edges}\n` +
    `標線 ${s.markings.toLocaleString()} 塊 · 量體 ${s.buildings} 棟 · 合併 ${s.merges} · 過短路段 ${city.markings.shortEdges.length}\n` +
    `街道家具 ${s.props} 件 · 三角形 ${(s.triangles + propTriangles(city.props)).toLocaleString()} · draw calls ${renderer.info.render.calls}`;
}

let wasTop = false;
function applyView(): void {
  perspControls.enabled = !view.top;
  topControls.enabled = view.top;
  if (view.top && !wasTop) fitTop(true); // re-centre only when entering the top view
  wasTop = view.top;
  if (debug) debug.visible = view.debug;
  materials.setWireframe(view.wireframe);
  applyNight();
}

// ---- GUI ----
const gui = new GUI({ title: "道路與街區 · Road Lab" });
const fNet = gui.addFolder("路網");
fNet.add(params, "blocksX", 1, 9, 1).name("街廓數 X");
fNet.add(params, "blocksY", 1, 9, 1).name("街廓數 Z");
fNet.add(params, "lotX", 15, 120, 1).name("地塊寬 X (m)");
fNet.add(params, "lotY", 15, 120, 1).name("地塊深 Z (m)");
fNet.add(params, "sizeVariation", 0, 0.5, 0.01).name("尺寸隨機變化");
fNet.add(params, "mainEvery", 1, 5, 1).name("主幹道間隔");
fNet.add(params, "outerLot", 10, 80, 1).name("外圈地塊深 (m)");
fNet.add(params, "seed", 0, 999, 1).name("種子");
fNet.add(params, "blockMerge", 0, 0.6, 0.01).name("街廓合併機率");
fNet.add(params, "trafficSide", { "靠左行駛（香港）": "left", "靠右行駛（台灣）": "right" }).name("行車方向");

function roadFolder(title: string, c: RoadClassParams): void {
  const f = gui.addFolder(title);
  f.add(c, "lanesPerDir", 1, 4, 1).name("單向車道數");
  f.add(c, "laneWidth", 2.8, 4, 0.05).name("車道寬 (m)");
  f.add(c, "centerLine", { "雙黃線": "double", "單黃虛線": "dashed", "無": "none" }).name("中線");
  f.add(c, "sidewalk", 1, 8, 0.1).name("人行道寬 (m)");
  f.add(c, "cornerRadius", 0, 20, 0.5).name("轉角半徑 (m)");
}
roadFolder("主幹道", params.classes.main);
roadFolder("支道", params.classes.minor);

const mk = params.markings;
const fMark = gui.addFolder("標線");
fMark.add(mk, "crosswalks").name("斑馬線");
fMark.add(mk, "crosswalkMinRoads", { "三岔以上": 3, "僅十字路口": 4, "全部（含直通節點）": 2 }).name("設置路口");
fMark.add(mk, "crosswalkWidth", 2, 8, 0.1).name("斑馬線寬 (m)");
fMark.add(mk, "stripeWidth", 0.3, 0.8, 0.01).name("斑馬紋寬 (m)");
fMark.add(mk, "stripeGap", 0.3, 1.2, 0.01).name("紋間距 (m)");
fMark.add(mk, "crosswalkOffset", 0, 5, 0.1).name("離路口口部 (m)");
fMark.add(mk, "stopLines").name("停止線");
fMark.add(mk, "stopLineWidth", 0.2, 0.6, 0.01).name("停止線寬 (m)");
fMark.add(mk, "stopLineGap", 0.5, 4, 0.1).name("離斑馬線 (m)");
fMark.add(mk, "laneLines").name("車道線與中線");
fMark.add(mk, "lineWidth", 0.1, 0.3, 0.01).name("線寬 (m)");
fMark.add(mk, "dashLength", 1, 8, 0.5).name("虛線長 (m)");
fMark.add(mk, "dashGap", 1, 12, 0.5).name("虛線間隔 (m)");
fMark.add(mk, "arrows").name("車道箭頭");
fMark.add(mk, "manholes").name("人孔蓋");
fMark.add(mk, "drains").name("排水格柵");
fMark.add(mk, "tactile").name("導盲磚（斑馬線兩端）");

const fp = params.furniture;
const fFurn = gui.addFolder("街道家具");
fFurn.add(fp, "lamps").name("路燈");
fFurn.add(fp, "lampSpacing", 10, 60, 1).name("路燈間距 (m)");
fFurn.add(fp, "trees", { "僅主幹道": "main", "全部道路": "all", "無": "none" }).name("行道樹");
fFurn.add(fp, "treeSpacing", 6, 40, 1).name("行道樹間距 (m)");
fFurn.add(fp, "bollards").name("路樁");
fFurn.add(fp, "signals").name("紅綠燈");
fMark.add({ clear: () => { for (const k of Object.keys(params.nodeOverrides)) delete params.nodeOverrides[k]; } }, "clear")
  .name("清除路口覆寫");

const fCurb = gui.addFolder("路緣");
fCurb.add(params, "curbHeight", 0.05, 0.3, 0.01).name("高度 (m)");
fCurb.add(params, "curbWidth", 0.1, 0.4, 0.01).name("路緣石寬 (m)");

const ms = params.massing;
const fMass = gui.addFolder("建築量體");
fMass.add(ms, "enabled").name("顯示量體");
fMass.add(ms, "minFloors", 1, 40, 1).name("最少樓層");
fMass.add(ms, "maxFloors", 1, 60, 1).name("最多樓層");
fMass.add(ms, "floorHeight", 2.8, 4.5, 0.1).name("樓高 (m)");
fMass.add(ms, "minFrontage", 4, 30, 0.5).name("最小面寬 (m)");
fMass.add(ms, "maxFrontage", 4, 40, 0.5).name("最大面寬 (m)");
fMass.add(ms, "maxDepth", 8, 40, 0.5).name("單排最大進深 (m)");
fMass.add(ms, "gap", 0, 6, 0.1).name("棟距 (m)");
fMass.add(ms, "centreBias", -1, 1, 0.05).name("往中心增高（負值＝降低）");
fMass.add(ms, "podiumChance", 0, 1, 0.01).name("裙樓機率");

const fHero = gui.addFolder("主建築地塊");
fHero.add(params, "heroLotX", 6, 60, 0.5).name("面寬 X (m)");
fHero.add(params, "heroLotY", 6, 40, 0.5).name("進深 Z (m)");
fHero.add(ms, "heroFloors", 1, 30, 1).name("佔位量體樓層");

const fView = gui.addFolder("檢視");
fView.add(view, "top").name("俯視");
fView.add(view, "debug").name("除錯疊圖");
fView.add(view, "wireframe").name("線框");
fView.add(view, "night", 0, 1, 0.01).name("夜間（預覽）");
fView.add(view, "clear").name("清出視線");
fView.add(view, "clearRadius", 5, 60, 1).name("清出半徑 (m)");

const fDev = gui.addFolder("開發測試");
fDev.add(params, "jitter", 0, 1, 0.01).name("節點擾動");

// view toggles only change the view; everything else rebuilds the city
gui.onChange(ev => (ev.object === view ? applyView() : rebuild()));

// ---- click an intersection: flip its crosswalks; click again: back to the automatic rule ----
const raycaster = new Raycaster();
const ground = new Plane(new Vector3(0, 1, 0), 0);
let downAt: { x: number; y: number } | null = null;
renderer.domElement.addEventListener("pointerdown", e => (downAt = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener("pointerup", e => {
  const click = downAt && e.button === 0 && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 4;
  downAt = null;
  if (!click || !city) return;
  raycaster.setFromCamera(new Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1),
    view.top ? topCam : persp);
  const hit = raycaster.ray.intersectPlane(ground, new Vector3());
  if (hit) toggleCrosswalks(hit.x, -hit.z);
});

/** nearest intersection within 15 m of a ground point (2D) */
function toggleCrosswalks(x: number, y: number): void {
  const g = city!.graph;
  let best = -1;
  let bestD = 15;
  for (const n of g.nodes) {
    if (!n.grid || roadDegree(g, n.id) < 2) continue;
    const dd = Math.hypot(n.p.x - x, n.p.y - y);
    if (dd < bestD) {
      bestD = dd;
      best = n.id;
    }
  }
  if (best < 0) return;
  const [i, j] = g.nodes[best].grid!;
  const key = `${i},${j}`;
  if (key in params.nodeOverrides) delete params.nodeOverrides[key];
  else params.nodeOverrides[key] = { crosswalks: !city!.markings.crosswalkNodes.has(best) };
  rebuild();
}

// ---- dev hooks for headless verification ----
(window as unknown as { __road: object }).__road = {
  params,
  set(patch: Partial<CityParams>): void {
    Object.assign(params, patch);
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    rebuild();
  },
  view(patch: Partial<typeof view>): void {
    Object.assign(view, patch);
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    applyView();
  },
  camera(px: number, py: number, pz: number, tx: number, ty: number, tz: number): void {
    persp.position.set(px, py, pz);
    perspControls.target.set(tx, ty, tz);
    perspControls.update();
  },
  /** zoom the top view onto a world point */
  focusTop(x: number, z: number, zoom: number): void {
    topCam.position.set(x, 1500, z);
    topControls.target.set(x, 0, z);
    topCam.zoom = zoom;
    topCam.updateProjectionMatrix();
  },
  stats: () => ({ ...city?.stats, totalMs: timing.total, calls: renderer.info.render.calls }),
  city: () => city,
  toggleCrosswalks,
  rebuild,
};

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  persp.aspect = innerWidth / innerHeight;
  persp.updateProjectionMatrix();
  fitTop(false);
});

rebuild();
let lastStats = 0;
renderer.setAnimationLoop(t => {
  (view.top ? topControls : perspControls).update();
  // clear the view along the camera → target corridor (perspective only)
  materials.setClearView(view.clear && !view.top, persp.position.x, persp.position.z,
    perspControls.target.x, perspControls.target.z, view.clearRadius,
    params.curbHeight + 2 * params.massing.floorHeight);
  renderer.render(scene, view.top ? topCam : persp);
  if (t - lastStats > 500) {
    lastStats = t;
    updateStats();
  }
});
