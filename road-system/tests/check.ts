/**
 * Numeric checks for the road core — no browser needed:
 *   npm run test:road      (= npx tsx road-system/tests/check.ts)
 * Phase 1 is only "done" when these pass, including the jitter (non-orthogonal) cases.
 */
import { buildCity, type CityResult } from "../src/core/city";
import { carriageway, defaultCityParams, type CityParams } from "../src/params";
import { otherEnd, roadDegree } from "../src/core/graph";
import { edgeFrame } from "../src/core/frame";
import { SIDE_MARGIN, exitsAt } from "../src/core/markings";
import { propTriangles } from "../src/render/props";
import { centroid, cross, dist, dot, insetConvex, normalize, pointInPolygon, segmentsCross, signedArea, sub, type Vec2 } from "../src/core/math2d";
import type { CityParams as P } from "../src/params";

const failures: string[] = [];
const notes: string[] = [];
const check = (ok: boolean, msg: string) => {
  if (!ok) failures.push(msg);
};

interface Variant {
  name: string;
  p: CityParams;
  /** hero lot must come out at exactly heroLotX × heroLotY, centred on the origin */
  exactHero: boolean;
}
const variant = (name: string, exactHero: boolean, edit: (p: CityParams) => void): Variant => {
  const p = defaultCityParams();
  edit(p);
  return { name, p, exactHero };
};
const extreme = (p: CityParams) => {
  p.lotX = 15;
  p.lotY = 15;
  p.classes.main.lanesPerDir = 4;
  p.classes.main.laneWidth = 4;
  p.classes.main.cornerRadius = 20;
  p.classes.minor.cornerRadius = 20;
  p.classes.minor.sidewalk = 1;
};

const variants: Variant[] = [
  variant("default", true, () => {}),
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(seed => variant(`jitter=1 seed=${seed}`, false, p => {
    p.jitter = 1;
    p.seed = seed;
  })),
  variant("1×1", true, p => { p.blocksX = 1; p.blocksY = 1; }),
  variant("9×9 varied", true, p => { p.blocksX = 9; p.blocksY = 9; p.sizeVariation = 0.5; }),
  variant("all main, square corners", true, p => { p.mainEvery = 1; p.classes.main.cornerRadius = 0; }),
  variant("wide roads, big radius, small lots", false, extreme),
  variant("extreme + jitter", false, p => { extreme(p); p.jitter = 1; p.seed = 3; }),
  // phase 2: markings
  variant("right-hand traffic", true, p => { p.trafficSide = "right"; }),
  variant("block merge 0.5 (T-junctions)", true, p => { p.blockMerge = 0.5; }),
  variant("block merge + jitter", false, p => { p.blockMerge = 0.5; p.jitter = 1; p.seed = 5; }),
  variant("crosswalks at crossroads only", true, p => { p.blockMerge = 0.5; p.markings.crosswalkMinRoads = 4; }),
  variant("crosswalks everywhere (pass-throughs)", true, p => { p.blockMerge = 0.6; p.seed = 9; p.markings.crosswalkMinRoads = 2; }),
  variant("node overrides", true, p => {
    p.nodeOverrides = { "1,1": { crosswalks: false }, "3,3": { crosswalks: false }, "2,1": { crosswalks: true } };
  }),
  variant("3 lanes, no / dashed centre lines", true, p => {
    p.classes.main.lanesPerDir = 3;
    p.classes.main.centerLine = "none";
    p.classes.minor.lanesPerDir = 2;
    p.classes.minor.centerLine = "dashed";
    p.trafficSide = "right";
  }),
  variant("painted median", true, p => { p.classes.main.median = 2; }),
  variant("wide crosswalks, big offset", false, p => {
    p.markings.crosswalkWidth = 8;
    p.markings.crosswalkOffset = 5;
    p.markings.stopLineGap = 4;
    p.lotX = 20;
    p.lotY = 18;
  }),
  // phase 3: massing
  variant("massing: every parcel a podium tower", true, p => { p.massing.podiumChance = 1; p.massing.maxFloors = 30; }),
  variant("massing: tiny frontages, wide gaps", true, p => {
    p.massing.minFrontage = 4;
    p.massing.maxFrontage = 6;
    p.massing.gap = 3;
  }),
  variant("massing: huge frontages, deep rows", true, p => {
    p.massing.minFrontage = 30;
    p.massing.maxFrontage = 40;
    p.massing.maxDepth = 40;
  }),
  variant("massing: lower towards centre, min > max", true, p => {
    p.massing.centreBias = -1;
    p.massing.minFloors = 12;
    p.massing.maxFloors = 4;
  }),
  // phase 5: integration settings (real building instead of the placeholder)
  variant("integration: no placeholder, low curb", true, p => {
    p.massing.heroPlaceholder = false;
    p.curbHeight = 0.135;
    p.massing.centreBias = -0.3;
  }),
  variant("integration: big building, big radii", true, p => {
    p.heroLotX = 20 * 3; // a 20 × 12-bay building
    p.heroLotY = 12 * 3;
    p.classes.main.cornerRadius = 16;
    p.classes.minor.cornerRadius = 12;
    p.classes.main.sidewalk = 2;
    p.massing.heroClearance = 5;
  }),
  // phase 4: street furniture + surface details
  variant("furniture everywhere, dense", true, p => {
    p.furniture.trees = "all";
    p.furniture.lampSpacing = 10;
    p.furniture.treeSpacing = 6;
  }),
  variant("crosswalk right at the mouth", true, p => { p.markings.crosswalkOffset = 0; }),
  variant("narrow sidewalks, wide curbs", false, p => {
    p.classes.minor.sidewalk = 1;
    p.classes.main.sidewalk = 1.2;
    p.curbWidth = 0.4;
  }),
  variant("arrows: 2-lane minor roads, right-hand, merges", true, p => {
    p.classes.minor.lanesPerDir = 2;
    p.classes.main.lanesPerDir = 3;
    p.trafficSide = "right";
    p.blockMerge = 0.5;
  }),
  variant("massing: merge + jitter + podiums", false, p => {
    p.blockMerge = 0.5;
    p.jitter = 1;
    p.seed = 11;
    p.massing.podiumChance = 0.8;
  }),
];

function isSimple(poly: Vec2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

function bbox(poly: Vec2[]) {
  return {
    minX: Math.min(...poly.map(q => q.x)), maxX: Math.max(...poly.map(q => q.x)),
    minY: Math.min(...poly.map(q => q.y)), maxY: Math.max(...poly.map(q => q.y)),
  };
}

function overlaps(a: Vec2[], b: Vec2[]): boolean {
  if (a.some(q => pointInPolygon(q, b)) || b.some(q => pointInPolygon(q, a))) return true;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

function checkMeshes(name: string, c: CityResult): void {
  for (const m of c.meshes) {
    check(m.indices.length > 0, `${name}: empty mesh ${m.material}`);
    for (const arr of [m.positions, m.normals, m.uvs]) {
      check(arr.every(Number.isFinite), `${name}: non-finite values in ${m.material}`);
    }
    // every triangle's winding must agree with its stored normal (no inside-out faces)
    let bad = 0;
    const P = (i: number) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
    for (let t = 0; t < m.indices.length; t += 3) {
      const [ia, ib, ic] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]];
      const A = P(ia);
      const B = P(ib);
      const C = P(ic);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-5) continue; // sliver: orientation is float noise
      if (n[0] * m.normals[ia * 3] + n[1] * m.normals[ia * 3 + 1] + n[2] * m.normals[ia * 3 + 2] <= 0) bad++;
    }
    check(bad === 0, `${name}: ${bad} triangles in "${m.material}" face against their normals`);
  }
}

function checkCity({ name, p, exactHero }: Variant, c: CityResult): void {
  const { graph: g, derived: d } = c;
  check(g.blocks.length === (Math.round(p.blocksX) + 2) * (Math.round(p.blocksY) + 2) - c.stats.merges,
    `${name}: ${g.blocks.length} blocks traced (${c.stats.merges} merges)`);
  checkMeshes(name, c);

  // islands: CCW, simple, and nested lot ⊂ curb inner edge ⊂ curb line
  for (const isl of d.islands) {
    const tag = `${name}: block ${isl.block}`;
    check(signedArea(isl.curb) > 0, `${tag} curb outline is not CCW`);
    check(isSimple(isl.curb) && isSimple(isl.curbInner) && isSimple(isl.lot), `${tag} outline self-intersects`);
    check(isl.curbInner.every(q => pointInPolygon(q, isl.curb)), `${tag} curb inner edge leaves the curb line`);
    check(isl.lot.every(q => pointInPolygon(q, isl.curbInner)), `${tag} lot pokes out of the sidewalk`);
  }

  // no two islands overlap
  const boxes = d.islands.map(i => bbox(i.curb));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i];
      const B = boxes[j];
      if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) continue;
      check(!overlaps(d.islands[i].curb, d.islands[j].curb), `${name}: islands ${i} and ${j} overlap`);
    }
  }

  // corner points lie on their road's curb line; a rounded corner's tangent point is
  // never behind its node. (A sharp corner against a slanted map edge legitimately
  // lands behind the boundary node, so only rounded corners get the "along" test.)
  for (const cn of d.corners) {
    for (const [edge, T] of [[cn.eIn, cn.t1], [cn.eOut, cn.t2]] as const) {
      const e = g.edges[edge];
      if (!e.cls) continue;
      const n = g.nodes[cn.node].p;
      const o = g.nodes[otherEnd(e, cn.node)].p;
      const u = normalize(sub(o, n));
      const along = dot(sub(T, n), u);
      const lateral = Math.abs(cross(u, sub(T, n)));
      if (cn.radius > 0) {
        check(along > -1e-6 && along < dist(n, o), `${name}: tangent point off edge ${edge} (along ${along.toFixed(3)})`);
      }
      check(Math.abs(lateral - carriageway(p.classes[e.cls]) / 2) < 1e-6,
        `${name}: corner point not on the curb line of edge ${edge}`);
    }
  }

  // along each curb line (edge × side), the fillets from the two ends never overlap
  const reach = new Map<string, number>();
  for (const cn of d.corners) {
    if (cn.radius <= 0) continue;
    for (const [edge, T] of [[cn.eIn, cn.t1], [cn.eOut, cn.t2]] as const) {
      const e = g.edges[edge];
      const a = g.nodes[e.a].p;
      const side = cross(normalize(sub(g.nodes[e.b].p, a)), sub(T, a)) > 0 ? "L" : "R";
      const n = g.nodes[cn.node].p;
      const along = dot(sub(T, n), normalize(sub(g.nodes[otherEnd(e, cn.node)].p, n)));
      const key = `${edge}${side}`;
      reach.set(key, (reach.get(key) ?? 0) + along);
    }
  }
  for (const [key, sum] of reach) {
    const e = g.edges[parseInt(key)];
    const L = dist(g.nodes[e.a].p, g.nodes[e.b].p);
    check(sum < L, `${name}: curb fillets overlap along edge ${key} (${sum.toFixed(2)} ≥ ${L.toFixed(2)})`);
  }

  // intersection mouths: non-negative. Mouths from the two ends MAY cross on very
  // short, skewed segments (the whole segment is intersection) — phase 2's
  // short-segment rule skips markings there, so this is reported, not failed.
  const mouths = new Map<number, number>();
  for (const a of d.approaches) {
    check(a.setback >= 0, `${name}: negative setback on edge ${a.edge}`);
    mouths.set(a.edge, (mouths.get(a.edge) ?? 0) + a.setback);
  }
  let crossed = 0;
  for (const [edge, sum] of mouths) {
    const e = g.edges[edge];
    if (sum >= dist(g.nodes[e.a].p, g.nodes[e.b].p)) crossed++;
  }
  if (crossed) notes.push(`${name}: ${crossed} segment(s) are all intersection (mouths meet) — no room for markings`);

  check(d.hero !== null, `${name}: no hero lot`);
  if (d.hero && exactHero) {
    const [sw, se, , nw] = d.hero.quad;
    check(Math.abs(dist(sw, se) - p.heroLotX) < 1e-6 && Math.abs(dist(sw, nw) - p.heroLotY) < 1e-6,
      `${name}: hero lot is ${dist(sw, se).toFixed(3)} × ${dist(sw, nw).toFixed(3)}`);
    check(Math.hypot((sw.x + se.x) / 2, (sw.y + nw.y) / 2) < 1e-6, `${name}: hero lot not centred on the origin`);
  }
}

/** a point on some island's sidewalk: inside its curb inner edge, outside its lot */
function onSidewalk(v: Vec2, d: CityResult["derived"]): boolean {
  return d.islands.some(i => pointInPolygon(v, i.curbInner) && !pointInPolygon(v, i.lot));
}

/** distance from a point to a closed outline */
function distToOutline(pt: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ab = sub(b, a);
    const t = Math.max(0, Math.min(1, dot(sub(pt, a), ab) / (dot(ab, ab) || 1)));
    best = Math.min(best, dist(pt, { x: a.x + ab.x * t, y: a.y + ab.y * t }));
  }
  return best;
}

/** SAT test for convex polygons; touching edges do not count as overlap */
function convexOverlap(a: Vec2[], b: Vec2[], eps = 1e-6): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i];
      const p1 = poly[(i + 1) % poly.length];
      const len = dist(p0, p1);
      if (len < 1e-12) continue;
      const n = { x: (p1.y - p0.y) / len, y: (p0.x - p1.x) / len };
      const pa = a.map(v => dot(v, n));
      const pb = b.map(v => dot(v, n));
      if (Math.max(...pa) <= Math.min(...pb) + eps || Math.max(...pb) <= Math.min(...pa) + eps) return false;
    }
  }
  return true;
}

function checkMarkings({ name, p }: Variant, c: CityResult): void {
  const { graph: g, derived: d, markings: plan } = c;
  const m = p.markings;
  const E = g.edges.length;
  check(plan.quads.length > 0, `${name}: no markings`);

  // paint never lands on a raised island (corners and centre outside every curb line)
  const islandBoxes = d.islands.map(i => bbox(i.curb));
  const quadBoxes = plan.quads.map(q => bbox(q.pts));
  plan.quads.forEach((q, qi) => {
    const qb = quadBoxes[qi];
    if (q.kind === "tactile") {
      check(q.pts.every(v => onSidewalk(v, d)), `${name}: tactile pad at node ${q.node} is not on the sidewalk`);
      return;
    }
    const centre = centroid(q.pts); // triangles (arrow heads) and 12-gons (manholes) too
    d.islands.forEach((isl, i) => {
      const ib = islandBoxes[i];
      if (qb.maxX < ib.minX || ib.maxX < qb.minX || qb.maxY < ib.minY || ib.maxY < qb.minY) return;
      if ([...q.pts, centre].some(v => pointInPolygon(v, isl.curb))) {
        failures.push(`${name}: ${q.kind} of edge ${q.edge} is painted on block ${isl.block}`);
      }
    });
  });

  // no two markings overlap (stripes, stop lines, lane / centre lines all disjoint)
  let overlapCount = 0;
  for (let i = 0; i < plan.quads.length; i++) {
    const A = quadBoxes[i];
    for (let j = i + 1; j < plan.quads.length; j++) {
      const B = quadBoxes[j];
      if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) continue;
      const gi = plan.quads[i].group;
      if (gi !== undefined && gi === plan.quads[j].group) continue; // pieces of one arrow
      if (convexOverlap(plan.quads[i].pts, plan.quads[j].pts)) {
        if (overlapCount++ < 3) failures.push(`${name}: ${plan.quads[i].kind} (edge ${plan.quads[i].edge}) overlaps ${plan.quads[j].kind} (edge ${plan.quads[j].edge})`);
      }
    }
  }

  // crosswalks: stripe count from the width, centred, inside curb-to-curb, along the road
  const stripesOf = new Map<number, typeof plan.quads>();
  for (const q of plan.quads) {
    if (q.kind !== "crosswalk") continue;
    const k = q.node * E + q.edge;
    stripesOf.set(k, [...(stripesOf.get(k) ?? []), q]);
  }
  const short = new Set(plan.shortEdges);
  const degree = g.nodes.map(n => roadDegree(g, n.id));
  for (const a of plan.approaches) {
    const e = g.edges[a.edge];
    const W = carriageway(p.classes[e.cls!]);
    const tag = `${name}: node ${a.node} edge ${a.edge}`;
    const expected = m.crosswalks && !short.has(a.edge) &&
      (g.nodes[a.node].override?.crosswalks ?? degree[a.node] >= m.crosswalkMinRoads);
    check(a.crosswalk === expected, `${tag}: crosswalk ${a.crosswalk}, rule says ${expected} (degree ${degree[a.node]})`);
    if (!a.crosswalk) continue;
    const quads = stripesOf.get(a.node * E + a.edge) ?? [];
    const n = Math.floor((W - 2 * SIDE_MARGIN + m.stripeGap) / (m.stripeWidth + m.stripeGap));
    check(quads.length === n && a.stripes === n, `${tag}: ${quads.length} stripes, expected ${n}`);
    const lo = Math.min(...quads.map(q => q.y0));
    const hi = Math.max(...quads.map(q => q.y1));
    check(Math.abs(lo + hi) < 1e-9, `${tag}: crosswalk not centred (${lo.toFixed(3)} … ${hi.toFixed(3)})`);
    check(hi <= W / 2 - SIDE_MARGIN + 1e-9, `${tag}: crosswalk wider than curb-to-curb`);
    const along = normalize(sub(quads[0].pts[1], quads[0].pts[0]));
    const f = edgeFrame(g, a.edge, a.node);
    check(Math.abs(dot(along, f.tangent(0)) - 1) < 1e-9, `${tag}: stripes not along the road`);
    // independent position check: where the crosswalk band meets the curbs (y = ±W/2)
    // the curb must be STRAIGHT, i.e. those points lie exactly on an island outline.
    // Inside the intersection mouth the curb has curved away and they would float.
    for (const s of [quads[0].s0, quads[0].s1]) {
      for (const y of [-W / 2, W / 2]) {
        const pt = f.point(s, y);
        const gap = Math.min(...d.islands.map(i => distToOutline(pt, i.curb)));
        check(gap < 1e-6, `${tag}: crosswalk edge (s ${s.toFixed(2)}, y ${y.toFixed(2)}) is ${gap.toFixed(3)} m off the curb`);
      }
    }
  }

  // stop lines sit on the inbound half: +y for right-hand traffic, −y for left-hand
  for (const q of plan.quads) {
    if (q.kind !== "stopLine") continue;
    const ok = p.trafficSide === "right" ? q.y0 >= -1e-9 : q.y1 <= 1e-9;
    check(ok, `${name}: stop line at node ${q.node} edge ${q.edge} on the outbound half`);
  }

  // block merging must actually produce T-junctions, each with 3 crosswalks
  if (c.stats.merges > 0) {
    const tNodes = g.nodes.filter(n => n.grid && n.grid[0] >= 0 && n.grid[1] >= 0 && degree[n.id] === 3 &&
      n.grid[0] <= Math.round(p.blocksX) && n.grid[1] <= Math.round(p.blocksY));
    check(tNodes.length > 0, `${name}: merges produced no T-junctions`);
    if (m.crosswalkMinRoads <= 3) {
      for (const t of tNodes) {
        if (t.override) continue;
        const cws = plan.approaches.filter(a => a.node === t.id && a.crosswalk).length;
        const shortHere = plan.approaches.filter(a => a.node === t.id && short.has(a.edge)).length;
        check(cws === 3 - shortHere, `${name}: T-junction ${t.id} has ${cws} crosswalks`);
      }
    }
  }
}

function checkFurniture({ name, p }: { name: string; p: P }, c: CityResult): void {
  const { graph: g, derived: d, markings: plan, props } = c;
  const E = g.edges.length;

  // lane arrows: only legal moves, every legal move served, near-side turn from the curb lane
  const near = p.trafficSide === "right" ? "right" : "left";
  const far = p.trafficSide === "right" ? "left" : "right";
  let arrowApproaches = 0;
  for (const a of plan.approaches) {
    if (!a.turns) continue;
    arrowApproaches++;
    const exits = exitsAt(g, a.node, a.edge);
    const used = new Set(a.turns.flat());
    const tag = `${name}: arrows at node ${a.node} edge ${a.edge}`;
    check([...used].every(t => exits.has(t)), `${tag} point to a missing exit`);
    check([...exits].every(t => used.has(t)), `${tag} leave an exit unserved`);
    if (a.turns.length >= 2) {
      if (exits.has(near)) check(a.turns[0].includes(near), `${tag}: curb lane lacks the near-side turn`);
      if (exits.has(far)) check(a.turns[a.turns.length - 1].includes(far), `${tag}: centre lane lacks the far-side turn`);
    }
  }
  if (p.markings.arrows && p.markings.stopLines) check(arrowApproaches > 0, `${name}: no lane arrows at all`);
  for (const q of plan.quads) {
    if (q.kind !== "arrow") continue;
    const cls = p.classes[g.edges[q.edge].cls!];
    const W = carriageway(cls);
    const inbound = p.trafficSide === "right" ? q.y0 >= cls.median / 2 - 1e-9 : q.y1 <= -cls.median / 2 + 1e-9;
    check(inbound && Math.max(Math.abs(q.y0), Math.abs(q.y1)) <= W / 2 - SIDE_MARGIN, `${name}: arrow outside the inbound lanes (edge ${q.edge})`);
  }

  // furniture stands on sidewalks, outside the hero keep-out, never on a crosswalk landing
  const counts: Record<string, number> = {};
  for (const pr of props.props) {
    counts[pr.kind] = (counts[pr.kind] ?? 0) + 1;
    const tag = `${name}: ${pr.kind} of edge ${pr.edge}`;
    check(onSidewalk(pr.p, d), `${tag} is not on a sidewalk`);
    if (props.keepOut) check(!pointInPolygon(pr.p, props.keepOut), `${tag} inside the hero keep-out`);
    if (pr.kind === "bollard") continue; // bollards flank the landings on purpose
    for (const a of plan.approaches) {
      if (!a.cw) continue;
      const e = g.edges[a.edge];
      const W = carriageway(p.classes[e.cls!]);
      const n = g.nodes[a.node].p;
      const u = edgeFrame(g, a.edge, a.node).tangent(0);
      const s = dot(sub(pr.p, n), u);
      const y = cross(u, sub(pr.p, n));
      if (s > a.cw[0] && s < a.cw[1] && Math.abs(y) < W / 2 + p.classes[e.cls!].sidewalk) {
        failures.push(`${tag} blocks the crosswalk landing at node ${a.node}`);
      }
    }
  }
  const fp = p.furniture;
  if (fp.lamps) check((counts.lamp ?? 0) > 0, `${name}: no lamps`);
  if (fp.signals && p.markings.stopLines) check((counts.signal ?? 0) > 0, `${name}: no signals`);
  // trees need room: a sidewalk at least curb stone + 1.3 m wide (narrower ones get none by design)
  if (fp.trees !== "none" && p.classes.main.sidewalk >= p.curbWidth + 1.3) check((counts.tree ?? 0) > 0, `${name}: no trees`);
  void E;
}

function isConvexCCW(poly: Vec2[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const c = poly[(i + 2) % n];
    if (cross(sub(b, a), sub(c, b)) < -1e-7) return false;
  }
  return signedArea(poly) > 0;
}

/** inside, or on the outline within tolerance */
const insideOrOn = (pt: Vec2, poly: Vec2[]) => pointInPolygon(pt, poly) || distToOutline(pt, poly) < 1e-6;

function checkMassing({ name, p, exactHero }: Variant, c: CityResult): void {
  const m = p.massing;
  const { derived: d, massing: plan } = c;
  const lo = Math.round(Math.min(m.minFloors, m.maxFloors));
  const hi = Math.round(Math.max(m.minFloors, m.maxFloors));
  const heroes = plan.buildings.filter(b => b.hero);
  check(heroes.length === (m.heroPlaceholder ? 1 : 0), `${name}: ${heroes.length} hero placeholders`);
  check(!c.meshes.some(x => x.material === "hero") || m.heroPlaceholder, `${name}: hero mesh drawn without placeholder`);
  // the clearance ring around the hero lot stays free (exact layouts only)
  if (d.hero && exactHero) {
    const ring = insetConvex(d.hero.quad, -(m.heroClearance - 1e-6));
    check(ring !== null, `${name}: cannot expand hero lot`);
    for (const b of plan.buildings) {
      if (!b.hero && ring && convexOverlap(ring, b.footprint)) {
        failures.push(`${name}: a building intrudes into the hero clearance (block ${b.block})`);
        break;
      }
    }
  }
  check(plan.buildings.length > 20, `${name}: only ${plan.buildings.length} buildings`);

  const lotOf = new Map(d.islands.map(i => [i.block, i.lot]));
  for (const [bi, b] of plan.buildings.entries()) {
    const tag = `${name}: building ${bi} (block ${b.block})`;
    check(b.footprint.every(v => Number.isFinite(v.x) && Number.isFinite(v.y)), `${tag} non-finite footprint`);
    check(isConvexCCW(b.footprint), `${tag} footprint not convex CCW`);
    // never outside its lot ⇒ never on the sidewalk
    check(b.footprint.every(v => insideOrOn(v, lotOf.get(b.block)!)), `${tag} leaves its lot`);
    if (!b.hero) {
      check(b.floors >= lo && b.floors <= hi, `${tag} has ${b.floors} floors (range ${lo}–${hi})`);
      check(Math.abs(b.height - b.floors * m.floorHeight) < 1e-9, `${tag} height ≠ floors × floor height`);
    }
    if (b.podium) {
      check(isConvexCCW(b.podium.tower), `${tag} tower not convex CCW`);
      check(b.podium.tower.every(v => insideOrOn(v, b.footprint)), `${tag} tower overhangs its podium`);
      check(b.podium.height < b.height, `${tag} podium taller than the building`);
    }
  }

  // buildings never overlap each other (or the hero placeholder)
  const boxes = plan.buildings.map(b => bbox(b.footprint));
  let overlapsFound = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const A = boxes[i];
      const B = boxes[j];
      if (A.maxX < B.minX || B.maxX < A.minX || A.maxY < B.minY || B.maxY < A.minY) continue;
      if (convexOverlap(plan.buildings[i].footprint, plan.buildings[j].footprint) && overlapsFound++ < 3) {
        failures.push(`${name}: buildings ${i} and ${j} overlap`);
      }
    }
  }
}

for (const v of variants) {
  const c = buildCity(v.p);
  checkCity(v, c);
  checkMarkings(v, c);
  checkMassing(v, c);
  checkFurniture(v, c);
  const s = c.stats;
  const propTris = propTriangles(c.props);
  console.log(`${v.name.padEnd(46)} bldg ${String(s.buildings).padStart(4)}  paint ${String(s.markings).padStart(5)}  props ${String(s.props).padStart(4)}  tris ${String(s.triangles + propTris).padStart(6)}  ${s.ms.toFixed(1)} ms`);
  check(s.triangles + propTris < 150000, `${v.name}: ${s.triangles + propTris} triangles incl. furniture (budget 150k)`);
}

// the hero lot must not move when road cross-sections change
{
  const base = buildCity(defaultCityParams()).derived.hero!.quad;
  const p = defaultCityParams();
  p.classes.main.lanesPerDir = 3;
  p.classes.minor.lanesPerDir = 2;
  p.classes.main.sidewalk = 6;
  p.classes.minor.laneWidth = 3.8;
  const moved = buildCity(p).derived.hero!.quad;
  check(base.every((q, i) => dist(q, moved[i]) < 1e-6), "hero lot moved when lanes / sidewalks changed");
}

// performance: default 5 × 5 city
{
  buildCity(defaultCityParams()); // warm-up
  const runs = 30;
  let total = 0;
  for (let i = 0; i < runs; i++) total += buildCity(defaultCityParams()).stats.ms;
  const avg = total / runs;
  console.log(`default build average ${avg.toFixed(2)} ms over ${runs} runs`);
  check(avg < 30, `default build takes ${avg.toFixed(1)} ms (budget 30 ms)`);
}

if (notes.length) console.log(`\nnotes:\n  ${notes.join("\n  ")}`);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n  ` + failures.slice(0, 40).join("\n  "));
  throw new Error("road-system checks failed");
}
console.log("\nALL CHECKS PASSED");
