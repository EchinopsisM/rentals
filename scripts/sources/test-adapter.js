const { chromium } = require("playwright");
const ad = require("./adapters/" + process.argv[2]);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: "/home/noah/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome", args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] });
  const ctx = await b.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, locale: "th-TH" });
  const urls = await ad.search(ctx, console.log);
  console.log("\nSEARCH FOUND:", urls.length, "urls. Testing extract on first 5:\n");
  for (const u of urls.slice(0, 5)) {
    const r = await ad.extract(ctx, u);
    if (!r) { console.log("  [skip/null]", u.slice(0, 70)); continue; }
    console.log(`  ฿${r.price} | beds=${r.beds} | ${r.area} | imgs=${(r.imgs||[]).length}`);
    console.log("    ", u.slice(0, 90));
  }
  await b.close();
})();
