// BaanFinder — Thai property portal, owner-direct friendly.
// Detail URLs: /th/property/<slug>--<id> ; search pages paginate via ?page=N.
// Rent trap: JSON-LD Product price is the SALE price; the monthly rent only
// appears as text ("X บาท ต่อเดือน"), so parse rent from text anchored on month.

const { collectImages } = require("../util");
const BASE = "https://www.baanfinder.com";
// houses + condos for rent in Chiang Mai
const SEARCHES = [
  "https://www.baanfinder.com/เช่าบ้าน/เชียงใหม่",
  "https://www.baanfinder.com/เช่าคอนโด/เชียงใหม่",
];
const MAX_PAGES = 4;

// monthly rent: grab the number tied to "ต่อเดือน" / "/เดือน" / "/month"
function monthlyRent(text) {
  if (!text) return null;
  const pats = [
    /([\d,]+)\s*บาท\s*(?:\/\s*|ต่อ\s*)?เดือน/, // 80,000 บาท ต่อเดือน
    /฿\s*([\d,]+)\s*\/\s*(?:month|mo)\b/i,
    /([\d,]+)\s*(?:thb|baht|฿)\s*\/\s*(?:month|mo|เดือน)/i,
  ];
  for (const re of pats) {
    const m = text.match(re);
    if (m) return m[1].replace(/,/g, "");
  }
  return null;
}

async function search(ctx, log) {
  const page = await ctx.newPage();
  const urls = new Set();
  for (const base of SEARCHES) {
    for (let p = 1; p <= MAX_PAGES; p++) {
      const u = base + (p > 1 ? `?page=${p}` : "");
      try {
        await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
        await page.evaluate(async () => { for (let i = 0; i < 5; i++) { window.scrollBy(0, 1400); await new Promise((r) => setTimeout(r, 350)); } });
      } catch (e) { break; }
      const before = urls.size;
      (await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/property/"]')].map((a) => a.href).filter((h) => /\/property\/[^/]+--\d+/.test(h))
      )).forEach((h) => urls.add(h.split("?")[0]));
      if (log) log(`[baanfinder] ${u} -> total ${urls.size}`);
      if (urls.size === before) break; // no new -> end of results
    }
  }
  await page.close();
  return [...urls];
}

async function extract(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);
    await page.evaluate(async () => { for (let i = 0; i < 4; i++) { window.scrollBy(0, 1000); await new Promise((r) => setTimeout(r, 300)); } });
    const d = await page.evaluate(() => {
      const meta = (p) => { const e = document.querySelector(`meta[property="${p}"],meta[name="${p}"]`); return e ? e.content : null; };
      let locality = null, region = null, desc = null;
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        const t = s.textContent;
        const loc = t.match(/"addressLocality":\s*"([^"]+)"/); if (loc && !locality) locality = loc[1];
        const reg = t.match(/"addressRegion":\s*"([^"]+)"/); if (reg && !region) region = reg[1];
      }
      return {
        title: meta("og:title") || (document.querySelector("h1") || {}).innerText || document.title,
        ogDesc: meta("og:description"),
        ogImage: meta("og:image"),
        body: (document.body.innerText || "").slice(0, 4000),
        locality, region,
      };
    });
    const imgs = await collectImages(page, /assets\.baanfinder\.com/);
    const price = monthlyRent(d.body) || monthlyRent(d.title) || monthlyRent(d.ogDesc);
    if (!price) return null; // no monthly rent -> sale-only, skip
    const bm = (d.title + " " + d.body).match(/(\d+)\s*(?:-|\s)?\s*(?:bed|bedroom|ห้องนอน|นอน)/i);
    const beds = bm ? +bm[1] : null;
    const area = [d.locality, d.region].filter(Boolean).join(", ") ||
      (d.ogDesc || "").replace(/^.*?\bใน\s*/, "").split(/รหัส|–|-{2}/)[0].trim() || d.title;
    const finalImgs = imgs.length ? imgs : d.ogImage ? [d.ogImage] : [];
    return {
      title: (d.title || "").trim(),
      price,
      beds,
      beds_baths: beds ? `${beds} beds` : null,
      area: area.slice(0, 80),
      rental_location: [d.locality, d.region].filter(Boolean).join(", ") || null,
      description: (d.ogDesc || d.body || "").slice(0, 1200),
      contact: "Contact owner/agent via BaanFinder listing",
      url,
      imgs: finalImgs,
    };
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { name: "baanfinder", label: "BaanFinder", prefix: "bf", search, extract };
