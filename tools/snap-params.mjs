// Screenshot the generator with parameter overrides and optional camera:
//   node tools/snap-params.mjs out.png '{"floor":9}' '[px,py,pz,tx,ty,tz]'
import puppeteer from "puppeteer-core";

const out = process.argv[2] ?? "shot.png";
const overrides = JSON.parse(process.argv[3] ?? "{}");
const cam = process.argv[4] ? JSON.parse(process.argv[4]) : null;
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "shell",
  args: ["--enable-unsafe-swiftshader", "--window-size=1500,950"],
  defaultViewport: { width: 1500, height: 950 },
});
const page = await browser.newPage();
page.on("console", msg => { if (msg.type() !== "debug") console.log("[console]", msg.type(), msg.text()); });
page.on("pageerror", err => console.log("[pageerror]", err.message));
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction("!document.getElementById('loading')", { timeout: 60000 });
await page.evaluate(p => window.__setParams(p), overrides);
if (cam) await page.evaluate(c => window.__setCamera(...c), cam);
await new Promise(r => setTimeout(r, 4000));
await page.screenshot({ path: out });
await browser.close();
console.log("SNAP_OK", out);
