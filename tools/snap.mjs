import puppeteer from "puppeteer-core";

const out = process.argv[2] ?? "shot.png";
const url = process.argv[3] ?? "http://localhost:5173/";
const browser = await puppeteer.launch({
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: "shell",
  args: ["--enable-unsafe-swiftshader", "--window-size=1500,950"],
  defaultViewport: { width: 1500, height: 950 },
});
const page = await browser.newPage();
page.on("console", msg => console.log("[console]", msg.type(), msg.text()));
page.on("pageerror", err => console.log("[pageerror]", err.message));
page.on("response", res => { if (res.status() >= 400) console.log("[http]", res.status(), res.url()); });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
await new Promise(r => setTimeout(r, 15000)); // let the kit load + first frames render
await page.screenshot({ path: out });
await browser.close();
console.log("SNAP_OK", out);
