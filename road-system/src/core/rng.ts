/** Deterministic hash → [0, 1): a pure function of (a, b), no hidden state. */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x165667b1, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** deterministic hash → [−1, 1) */
export const hashSigned = (a: number, b: number): number => hash01(a, b) * 2 - 1;
