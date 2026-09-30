/**
 * Grid layout → RoadGraph. The only grid-specific code in the system; everything
 * downstream reads the graph, so an irregular generator can replace this later.
 *
 * - Grid lines are roads. Lot sizes are the INPUT; road centre lines are derived
 *   (lot + sidewalks + half carriageways), so changing lanes never resizes a lot.
 * - Roads run out to a map boundary made of zero-width edges, so the outer ring of
 *   blocks is closed too and the city fills the map.
 * - Origin = centre of the hero lot (front-centre of the central block), where the
 *   hero building will stand after integration. Its front faces 2D −y (world +z).
 */
import { GraphBuilder, type RoadGraph } from "../graph";
import type { Bounds } from "../math2d";
import { hash01, hashSigned } from "../rng";
import { carriageway, type CityParams, type RoadClassId } from "../../params";

export interface GridResult {
  graph: RoadGraph;
  bounds: Bounds;
  /** block id of the hero cell (−1 if missing) */
  heroBlock: number;
  /** node id of the hero block's south-west corner (front-left) */
  heroSW: number;
  /** interior road segments removed by block merging */
  merges: number;
}

/**
 * Block merging: an ordinary interior block may absorb its east or north neighbour,
 * which removes the road segment between them and turns its two end nodes into
 * T-junctions. Pairs only (each block merges at most once, never the hero block),
 * so every block stays a convex quad (with collinear T-nodes on its boundary).
 * Returns removed segment keys: "v:i:j" = line x=i between rows j..j+1,
 * "h:j:i" = line y=j between columns i..i+1.
 */
function pickMerges(p: CityParams, nx: number, ny: number, ix: number, iy: number): Set<string> {
  const removed = new Set<string>();
  if (p.blockMerge <= 0) return removed;
  const taken = new Set<string>();
  const free = (i: number, j: number) => i < nx && j < ny && !(i === ix && j === iy) && !taken.has(`${i},${j}`);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const id = i * 131 + j;
      if (!free(i, j) || hash01(id, p.seed + 503) >= p.blockMerge) continue;
      const east = hash01(id, p.seed + 509) < 0.5;
      const [ni, nj] = east ? [i + 1, j] : [i, j + 1];
      if (!free(ni, nj)) continue;
      taken.add(`${i},${j}`);
      taken.add(`${ni},${nj}`);
      removed.add(east ? `v:${i + 1}:${j}` : `h:${j + 1}:${i}`);
    }
  }
  return removed;
}

/** room for neighbour buildings beside / behind the hero lot inside its block (m) */
const HERO_NEIGHBOUR_ROOM = 6;

export function buildGrid(p: CityParams): GridResult {
  const nx = Math.max(1, Math.round(p.blocksX));
  const ny = Math.max(1, Math.round(p.blocksY));
  const ix = Math.floor(nx / 2);
  const iy = Math.floor(ny / 2);
  const k = Math.max(1, Math.round(p.mainEvery));
  const onMain = (d: number) => ((d % k) + k) % k === 0;
  // vertical line i (constant x) / horizontal line j (constant y); the hero block's
  // west and south (front) lines are always main roads
  const clsX = (i: number): RoadClassId => (onMain(i - ix) ? "main" : "minor");
  const clsY = (j: number): RoadClassId => (onMain(j - iy) ? "main" : "minor");
  const half = (c: RoadClassId) => carriageway(p.classes[c]) / 2 + p.classes[c].sidewalk;

  // hero block margins: neighbour room + clearance, plus the widest possible rounded lot
  // corner (curb radius − sidewalk) so the hero lot is never clamped by a corner arc
  const cornerCut = Math.max(0,
    Math.max(p.classes.main.cornerRadius, p.classes.minor.cornerRadius) -
    Math.min(p.classes.main.sidewalk, p.classes.minor.sidewalk));
  const sideMargin = HERO_NEIGHBOUR_ROOM + p.massing.heroClearance + cornerCut;
  const backMargin = HERO_NEIGHBOUR_ROOM + p.massing.heroClearance;
  const vary = (i: number, salt: number) => 1 + p.sizeVariation * hashSigned(i + salt, p.seed);
  const colW = Array.from({ length: nx }, (_, i) =>
    i === ix ? Math.max(p.lotX, p.heroLotX + 2 * sideMargin) : p.lotX * vary(i, 101));
  const rowH = Array.from({ length: ny }, (_, j) =>
    j === iy ? Math.max(p.lotY, p.heroLotY + backMargin) : p.lotY * vary(j, 211));

  let X = [0];
  for (let i = 0; i < nx; i++) X.push(X[i] + half(clsX(i)) + colW[i] + half(clsX(i + 1)));
  let Y = [0];
  for (let j = 0; j < ny; j++) Y.push(Y[j] + half(clsY(j)) + rowH[j] + half(clsY(j + 1)));
  const cx = X[ix] + half(clsX(ix)) + colW[ix] / 2;
  const cy = Y[iy] + half(clsY(iy)) + p.heroLotY / 2;
  X = X.map(x => x - cx);
  Y = Y.map(y => y - cy);

  const bounds: Bounds = {
    minX: X[0] - half(clsX(0)) - p.outerLot,
    maxX: X[nx] + half(clsX(nx)) + p.outerLot,
    minY: Y[0] - half(clsY(0)) - p.outerLot,
    maxY: Y[ny] + half(clsY(ny)) + p.outerLot,
  };

  // dev-only node jitter: proves the geometry never assumes right angles. Bounded well
  // below half a block so blocks stay convex and boundary nodes keep their order.
  const J = p.jitter * 0.22 * Math.min(...colW, ...rowH, p.outerLot);
  const jit = (id: number, axis: number) => J * hashSigned(id * 4 + axis, p.seed + 7);

  const g = new GraphBuilder();
  const I: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    I.push([]);
    for (let j = 0; j <= ny; j++) {
      const id = i * (ny + 1) + j;
      const node = g.addNode({ x: X[i] + jit(id, 0), y: Y[j] + jit(id, 1) }, [i, j]);
      g.nodes[node].override = p.nodeOverrides[`${i},${j}`];
      I[i].push(node);
    }
  }
  // boundary nodes slide only along the boundary; corners stay fixed
  const S = X.map((x, i) => g.addNode({ x: x + jit(10000 + i, 0), y: bounds.minY }, [i, -1]));
  const N = X.map((x, i) => g.addNode({ x: x + jit(20000 + i, 0), y: bounds.maxY }, [i, ny + 1]));
  const W = Y.map((y, j) => g.addNode({ x: bounds.minX, y: y + jit(30000 + j, 1) }, [-1, j]));
  const E = Y.map((y, j) => g.addNode({ x: bounds.maxX, y: y + jit(40000 + j, 1) }, [nx + 1, j]));
  const cSW = g.addNode({ x: bounds.minX, y: bounds.minY }, [-1, -1]);
  const cSE = g.addNode({ x: bounds.maxX, y: bounds.minY }, [nx + 1, -1]);
  const cNE = g.addNode({ x: bounds.maxX, y: bounds.maxY }, [nx + 1, ny + 1]);
  const cNW = g.addNode({ x: bounds.minX, y: bounds.maxY }, [-1, ny + 1]);

  const removed = pickMerges(p, nx, ny, ix, iy);
  for (let i = 0; i <= nx; i++) {
    g.addEdge(S[i], I[i][0], clsX(i));
    for (let j = 0; j < ny; j++) if (!removed.has(`v:${i}:${j}`)) g.addEdge(I[i][j], I[i][j + 1], clsX(i));
    g.addEdge(I[i][ny], N[i], clsX(i));
  }
  for (let j = 0; j <= ny; j++) {
    g.addEdge(W[j], I[0][j], clsY(j));
    for (let i = 0; i < nx; i++) if (!removed.has(`h:${j}:${i}`)) g.addEdge(I[i][j], I[i + 1][j], clsY(j));
    g.addEdge(I[nx][j], E[j], clsY(j));
  }
  g.addChain([cSW, ...S, cSE, ...E, cNE, ...[...N].reverse(), cNW, ...[...W].reverse(), cSW], null);

  const graph = g.build();
  for (const b of graph.blocks) {
    let ci = Infinity;
    let cj = Infinity;
    for (const n of b.nodes) {
      const gc = graph.nodes[n].grid!;
      ci = Math.min(ci, gc[0]);
      cj = Math.min(cj, gc[1]);
    }
    b.cell = [ci, cj];
  }
  const hero = graph.blocks.find(b => b.cell![0] === ix && b.cell![1] === iy);
  return { graph, bounds, heroBlock: hero ? hero.id : -1, heroSW: I[ix][iy], merges: removed.size };
}
