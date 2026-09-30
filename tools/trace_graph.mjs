// Convert blend_dump.json's "build system" graph into readable pseudocode, grouped by frame.
import { readFileSync, writeFileSync } from "node:fs";

const scratch = "C:/Users/chiro/AppData/Local/Temp/claude/c--Users-chiro-Documents-GitHub-BuildingGeneratorThreeJS/1aaa37f3-3c1d-45e8-9306-278220f8b567/scratchpad";
const dump = JSON.parse(readFileSync(`${scratch}/blend_dump.json`, "utf8"));
const frames = JSON.parse(readFileSync(`${scratch}/frames.json`, "utf8"));
const idxLinks = JSON.parse(readFileSync(`${scratch}/links.json`, "utf8"));
const tree = dump.node_groups["build system"];
tree.links = idxLinks; // indexed links replace ambiguous name-based ones

const nodes = new Map(tree.nodes.map(n => [n.name, n]));
// incoming links: toNode -> input index -> [links]
const inLinks = new Map();
const outLinks = new Map();
for (const l of tree.links) {
  if (!inLinks.has(l.to_node)) inLinks.set(l.to_node, new Map());
  const m = inLinks.get(l.to_node);
  if (!m.has(l.to_idx)) m.set(l.to_idx, []);
  m.get(l.to_idx).push(l);
  if (!outLinks.has(l.from_node)) outLinks.set(l.from_node, []);
  outLinks.get(l.from_node).push(l);
}

const shortId = new Map();
let counter = 0;
function idOf(name) {
  if (!shortId.has(name)) shortId.set(name, `n${++counter}`);
  return shortId.get(name);
}

function fmtVal(v) {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "number") return Math.abs(v) < 1e-6 && v !== 0 ? v.toExponential(2) : +v.toFixed(4) + "";
  if (Array.isArray(v)) return "(" + v.map(x => typeof x === "number" ? +x.toFixed(3) : x).join(",") + ")";
  if (typeof v === "object") return `${v.datablock}<${v.name}>`;
  return String(v);
}

function srcRef(nodeName, inputIdx) {
  const links = inLinks.get(nodeName)?.get(inputIdx);
  if (!links || !links.length) return null;
  return links.map(l => {
    const src = nodes.get(l.from_node);
    const sockName = src?.outputs?.[l.from_idx] ?? `out${l.from_idx}`;
    return `${idOf(l.from_node)}.${sockName}`;
  }).join(" + ");
}

// which input indices actually matter per node type (RandomValue/Compare expose
// one socket set per data_type; skip the irrelevant ones)
function relevantInputs(n) {
  const idxs = [...n.inputs.keys()];
  if (n.type === "FunctionNodeRandomValue") {
    const dt = n.props?.data_type;
    const keep = { FLOAT_VECTOR: [0, 1], FLOAT: [2, 3], INT: [4, 5], BOOLEAN: [6] };
    const base = keep[dt] ?? idxs;
    return [...base, 7, 8]; // + ID, Seed
  }
  if (n.type === "FunctionNodeCompare") {
    const dt = n.props?.data_type;
    if (dt === "FLOAT") return [0, 1];
    if (dt === "INT") return [2, 3];
    if (dt === "VECTOR") return [4, 5];
  }
  return idxs;
}

const interestingProps = ["operation", "data_type", "domain", "mode", "input_type", "transform_space",
  "rounding_mode", "use_all_curves", "legacy_behavior"];

function describe(n) {
  const id = idOf(n.name);
  let head = n.type
    .replace("GeometryNode", "").replace("ShaderNode", "").replace("FunctionNode", "").replace("Node", "");
  const props = [];
  for (const p of interestingProps) if (n.props?.[p] !== undefined) props.push(`${n.props[p]}`);
  if (props.length) head += `[${props.join(",")}]`;
  const args = [];
  for (const i of relevantInputs(n)) {
    const inp = n.inputs[i];
    if (!inp) continue;
    const src = srcRef(n.name, i);
    if (src) args.push(`${inp.name}=${src}`);
    else if (inp.value !== null && inp.value !== undefined) {
      args.push(`${inp.name}:${fmtVal(inp.value)}`);
    }
  }
  let line = `${id} = ${head}(${args.join(", ")})`;
  if (n.label) line += `   // "${n.label}"`;
  return line;
}

// order nodes topologically (Kahn), then group output lines by frame
const indeg = new Map();
for (const n of tree.nodes) indeg.set(n.name, 0);
for (const l of tree.links) indeg.set(l.to_node, (indeg.get(l.to_node) ?? 0) + 1);
const queue = tree.nodes.filter(n => (indeg.get(n.name) ?? 0) === 0).map(n => n.name);
const order = [];
const seen = new Set();
while (queue.length) {
  const name = queue.shift();
  if (seen.has(name)) continue;
  seen.add(name);
  order.push(name);
  for (const l of outLinks.get(name) ?? []) {
    indeg.set(l.to_node, indeg.get(l.to_node) - 1);
    if (indeg.get(l.to_node) <= 0) queue.push(l.to_node);
  }
}
for (const n of tree.nodes) if (!seen.has(n.name)) order.push(n.name); // cycles fallback

const byFrame = new Map();
for (const name of order) {
  const n = nodes.get(name);
  if (!n || n.type === "NodeFrame") continue;
  const f = frames[name]?.parent ?? "(no frame)";
  if (!byFrame.has(f)) byFrame.set(f, []);
  byFrame.get(f).push(describe(n));
}

let out = "";
// stable frame order: by average x location
const frameOrder = [...byFrame.keys()].sort((a, b) => a.localeCompare(b));
for (const f of frameOrder) {
  out += `\n########## FRAME: ${f} (${byFrame.get(f).length} nodes) ##########\n`;
  out += byFrame.get(f).join("\n") + "\n";
}

// reverse index: id -> node name
out += "\n########## ID MAP ##########\n";
for (const [name, id] of shortId) out += `${id} = ${name}\n`;

writeFileSync(`${scratch}/trace.txt`, out);
console.log("TRACE_OK", order.length, "nodes,", byFrame.size, "frames ->", `${scratch}/trace.txt`);
