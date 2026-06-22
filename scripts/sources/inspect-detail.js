// Dump a detail page's key signals. Usage: node sources/inspect-detail.js <url>
const { chromium } = require("playwright");
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch({ headless: true, executablePath: "/home/noah/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome", args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"] });
  const ctx = await b.newContext({ userAgent: UA, viewport: { width: 1366, height: 1200 }, locale: "th-TH" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);
  const d = await page.evaluate(() => {
    const meta = (p) => { const e = document.querySelector(`meta[property="${p}"],meta[name="${p}"]`); return e ? e.content : null; };
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent.slice(0, 600));
    const imgs = [...new Set([...document.querySelectorAll("img")].filter((i) => i.naturalWidth > 300 || i.getBoundingClientRect().width > 300).map((i) => i.currentSrc || i.src))].slice(0, 15);
    const bg = [...document.querySelectorAll("*")].map((e) => getComputedStyle(e).backgroundImage).filter((s) => s && s.includes("url(") && /\.(jpg|jpeg|png|webp)/i.test(s)).slice(0, 8);
    return {
      title: document.title,
      ogTitle: meta("og:title"), ogImage: meta("og:image"), ogDesc: meta("og:description"),
      h1: (document.querySelector("h1") || {}).innerText,
      bodySample: (document.body.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 1200),
      ld, imgs, bg,
    };
  });
  console.log("TITLE:", d.title);
  console.log("OG:title:", d.ogTitle, "\nOG:desc:", d.ogDesc, "\nOG:image:", d.ogImage);
  console.log("H1:", d.h1);
  console.log("\n--- LD+JSON ---"); d.ld.forEach((x) => console.log(x, "\n"));
  console.log("--- BODY ---\n", d.bodySample);
  console.log("\n--- IMG srcs ---"); d.imgs.forEach((s) => console.log(" ", s));
  console.log("--- BG imgs ---"); d.bg.forEach((s) => console.log(" ", s.slice(0, 120)));
  await b.close();
})();
