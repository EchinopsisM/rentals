// Facebook Marketplace scraper using the saved profile (no CDP).
// Runs each query against Chiang Mai marketplace sorted newest-first, ≤20k,
// scrolls, and collects item cards (id, title/price text, thumb). Writes mp.json.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const PROFILE = path.join(__dirname, "profile");

const QUERIES = process.argv.slice(2);
if (!QUERIES.length) QUERIES.push("2 bedroom", "บ้านเช่า", "คอนโด เช่า", "house for rent", "2 ห้องนอน", "บ้านเช่า สุเทพ");

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1280, height: 1000 },
    args: ["--password-store=basic", "--use-mock-keychain", "--no-first-run",
           "--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const cookies = await ctx.cookies("https://www.facebook.com");
  if (!cookies.some((c) => c.name === "c_user")) { console.error("NOT LOGGED IN"); await ctx.close(); process.exit(2); }

  const all = {};
  for (const q of QUERIES) {
    const url = "https://www.facebook.com/marketplace/chiangmai/search?query=" +
      encodeURIComponent(q) + "&maxPrice=20000&sortBy=creation_time_descend&exact=false";
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(3000);
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 2800); await page.waitForTimeout(1300); }
      const items = await page.evaluate(() => {
        const seen = {};
        document.querySelectorAll('a[href*="/marketplace/item/"]').forEach((a) => {
          const id = (a.href.match(/item\/(\d+)/) || [])[1];
          if (!id) return;
          const txt = (a.innerText || "").replace(/\n+/g, " | ").trim();
          const img = a.querySelector("img");
          if (!seen[id] || txt.length > (seen[id].text || "").length)
            seen[id] = { id, url: "https://www.facebook.com/marketplace/item/" + id, text: txt, thumb: img ? img.src : null };
        });
        return Object.values(seen);
      });
      let n = 0;
      for (const it of items) { if (!all[it.id]) { all[it.id] = { ...it, q }; n++; } }
      process.stderr.write(`Q["${q}"] cards:${items.length} new:${n}\n`);
    } catch (e) { process.stderr.write(`Q["${q}"] ERROR ${e}\n`); }
    fs.writeFileSync(path.join(__dirname, "mp.json"), JSON.stringify(Object.values(all), null, 2));
  }
  console.error("TOTAL UNIQUE:", Object.keys(all).length, "-> mp.json");
  await ctx.close();
})();
