// Dump anchor href patterns + card structure for a search page.
// Usage: node sources/inspect-links.js <url>
const { chromium } = require("playwright");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch({ headless: true, executablePath: "/home/noah/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome", args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] });
  const ctx = await b.newContext({ userAgent: UA, viewport: { width: 1366, height: 1400 }, locale: "th-TH" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(4000);
  // scroll to trigger lazy load
  await page.evaluate(async () => { for (let i = 0; i < 6; i++) { window.scrollBy(0, 1200); await new Promise(r => setTimeout(r, 400)); } });
  const out = await page.evaluate(() => {
    const norm = (h) => { try { return new URL(h).pathname; } catch { return h; } };
    const counts = {};
    [...document.querySelectorAll("a[href]")].forEach((a) => {
      const p = norm(a.href).replace(/\d+/g, "#").replace(/[^\/]*\.html/, "*.html");
      counts[p] = (counts[p] || 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 25);
    // sample real hrefs that look like detail links (contain digits)
    const samples = [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => /\d{4,}/.test(h)))].slice(0, 12);
    return { top, samples };
  });
  console.log("=== href path patterns (count) ===");
  out.top.forEach(([p, c]) => console.log(String(c).padStart(4), p));
  console.log("\n=== sample detail-ish hrefs ===");
  out.samples.forEach((s) => console.log(" ", s));
  await b.close();
})();
