/**
 * 2D geometry on the ground plane.
 *
 * Convention: 2D (x, y) ↔ world (x, height, −y). +y is "north" (world −Z), so a
 * polygon that is CCW in 2D is CCW seen from above, and left(d) is a driver's left
 * when heading along d. Blocks are CCW with their interior on the left.
 */
export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
/** a + b·s */
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({ x: a.x + b.x * s, y: a.y + b.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** left-hand normal of direction d (90° CCW) */
export const left = (d: Vec2): Vec2 => ({ x: -d.y, y: d.x });

export function normalize(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y);
  return l > 0 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** intersection of the lines p1 + t·d1 and p2 + s·d2 (null when parallel) */
export function lineIntersect(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-9) return null;
  return addScaled(p1, d1, cross(sub(p2, p1), d2) / den);
}

export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** true when segments ab and cd cross at a point interior to both */
export function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2, eps = 1e-9): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps));
}

/** bilinear point in quad q = [p(0,0), p(1,0), p(1,1), p(0,1)] — works for any convex quad */
export function bilinear(q: readonly Vec2[], u: number, v: number): Vec2 {
  return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
}

/** drop consecutive near-duplicate points (incl. last = first) */
function dedupe(ring: Vec2[], eps = 1e-7): Vec2[] {
  const out: Vec2[] = [];
  for (const p of ring) if (!out.length || dist(out[out.length - 1], p) > eps) out.push(p);
  while (out.length > 1 && dist(out[0], out[out.length - 1]) <= eps) out.pop();
  return out;
}

/**
 * Sutherland–Hodgman: keep the part of `subject` that lies left of every edge of the
 * CCW polygon `clip`. For a convex clip polygon that is the plain intersection; for a
 * slightly non-convex one it is the intersection with its kernel — a conservative
 * subset, never outside the polygon.
 */
export function clipToPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const e = sub(clip[(i + 1) % clip.length], a);
    if (e.x === 0 && e.y === 0) continue;
    const side = (p: Vec2) => cross(e, sub(p, a)); // ≥ 0 = inside
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const P = input[k];
      const Q = input[(k + 1) % input.length];
      const sp = side(P);
      const sq = side(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) out.push(lerp(P, Q, sp / (sp - sq)));
    }
  }
  return dedupe(out);
}

/** move every edge of a CCW convex polygon inward by d; null if it collapses or inverts */
export function insetConvex(poly: Vec2[], d: number): Vec2[] | null {
  const n = poly.length;
  const dirs = poly.map((p, k) => normalize(sub(poly[(k + 1) % n], p)));
  const bases = poly.map((p, k) => addScaled(p, left(dirs[k]), d));
  const out: Vec2[] = [];
  for (let k = 0; k < n; k++) {
    const kp = (k + n - 1) % n;
    out.push(lineIntersect(bases[kp], dirs[kp], bases[k], dirs[k]) ?? bases[k]);
  }
  for (let k = 0; k < n; k++) if (dot(sub(out[(k + 1) % n], out[k]), dirs[k]) <= 1e-6) return null;
  return signedArea(out) > 1e-6 ? out : null;
}

/**
 * The k vertices with the sharpest turns, in order. Recovers the 4 true corners of a
 * lot whose outline also carries near-straight vertices (T-junctions of merged blocks).
 */
export function dominantCorners(poly: Vec2[], k = 4): Vec2[] {
  const n = poly.length;
  if (n <= k) return poly;
  const turn = poly.map((p, i) => {
    const a = normalize(sub(p, poly[(i + n - 1) % n]));
    const b = normalize(sub(poly[(i + 1) % n], p));
    return Math.abs(Math.atan2(cross(a, b), dot(a, b)));
  });
  const keep = new Set([...turn.keys()].sort((i, j) => turn[j] - turn[i]).slice(0, k));
  return poly.filter((_, i) => keep.has(i));
}

export function centroid(poly: Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

export interface Fillet {
  t1: Vec2;
  t2: Vec2;
  center: Vec2;
  radius: number;
  /** t1 … t2 inclusive, sampled along the arc */
  arc: Vec2[];
}

/**
 * Round the corner P of a path that arrives along unit dIn and leaves along unit
 * dOut. Only left turns (convex corners of a CCW loop) are rounded. The tangent
 * length is capped at maxTangent — the radius shrinks to fit. Null = no fillet.
 * Works for any turning angle, not just 90°.
 */
export function fillet(P: Vec2, dIn: Vec2, dOut: Vec2, radius: number, maxTangent: number,
                       step = Math.PI / 18): Fillet | null {
  const turn = Math.atan2(cross(dIn, dOut), dot(dIn, dOut)); // signed turning angle
  if (radius <= 0 || turn <= 1e-4) return null;
  // tangent length = r / tan(interior/2) = r · tan(turn/2)
  const k = Math.tan(turn / 2);
  let r = radius;
  let a = r * k;
  if (a > maxTangent) {
    a = Math.max(0, maxTangent);
    r = a / k;
  }
  if (r <= 1e-6) return null;
  const t1 = addScaled(P, dIn, -a);
  const t2 = addScaled(P, dOut, a);
  const center = addScaled(t1, left(dIn), r); // a left turn's centre lies to the left
  const a0 = Math.atan2(t1.y - center.y, t1.x - center.x);
  const n = Math.max(1, Math.ceil(turn / step));
  const arc: Vec2[] = [t1];
  for (let i = 1; i < n; i++) {
    const ang = a0 + (turn * i) / n;
    arc.push({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) });
  }
  arc.push(t2);
  return { t1, t2, center, radius: r, arc };
}
