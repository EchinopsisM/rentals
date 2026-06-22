// Hipflat — condos/houses for rent, owner + agent. English UI, per-unit ads.
// Detail URLs: /en/ads/<hash>. Prices shown in USD -> convert to THB.
// Images: img.hipcdn.com with base64-encoded keys; a listing's own photos
// share a "properties/<uuid>/" key, so group by that to drop project/similar.

const USD_THB = 35; // approximate; rent cap (฿20k) has tolerance

const SEARCHES = [
  "https://www.hipflat.co.th/en/condo-for-rent/chiang-mai",
  "https://www.hipflat.co.th/en/house-for-rent/chiang-mai",
];
const MAX_PAGES = 3;

function hipFolder(u) {
  try {
    const b64 = u.split("/").pop().split("?")[0];
    const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const m = (j.key || "").match(/properties\/[0-9a-f-]+\//i);
    return m ? m[0] : "";
  } catch (e) { return ""; }
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
        await page.evaluate(async () => { for (let i = 0; i < 4; i++) { window.scrollBy(0, 1400); await new Promise((r) => setTimeout(r, 300)); } });
      } catch (e) { break; }
      const before = urls.size;
      (await page.evaluate(() => [...document.querySelectorAll('a[href*="/ads/"]')].map((a) => a.href).filter((h) => /\/ads\/[a-z0-9]+$/i.test(h.split("?")[0])))).forEach((h) => urls.add(h.split("?")[0]));
      if (log) log(`[hipflat] ${u} -> total ${urls.size}`);
      if (urls.size === before) break;
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
    await page.evaluate(async () => { for (let i = 0; i < 3; i++) { window.scrollBy(0, 1000); await new Promise((r) => setTimeout(r, 300)); } });
    const d = await page.evaluate(() => {
      const meta = (p) => { const e = document.querySelector(`meta[property="${p}"],meta[name="${p}"]`); return e ? e.content : null; };
      return {
        h1: (document.querySelector("h1") || {}).innerText || document.title,
        ogImage: meta("og:image"),
        ogDesc: meta("og:description"),
        body: (document.body.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 4000),
        imgs: [...new Set([...document.querySelectorAll("img")].map((i) => (i.currentSrc || i.src || "").split("?")[0]).filter((s) => /img\.hipcdn\.com/.test(s)))],
      };
    });
    const um = d.body.match(/USD\s*([\d,]+)\s*\/?\s*month/i) || d.h1.match(/USD\s*([\d,]+)/i);
    if (!um) return null;
    const usd = +um[1].replace(/,/g, "");
    const price = String(Math.round((usd * USD_THB) / 500) * 500); // THB, rounded to ฿500
    const bm = d.body.match(/(\d+)\s*\n?\s*Bedrooms/i) || d.h1.match(/(\d+)\s*bedroom/i);
    const beds = bm ? +bm[1] : null;
    const area = ((d.h1.match(/in\s+(.+)$/) || [])[1] || d.h1).replace(/^For rent.*?in\s+/i, "").trim();
    // group images by property folder (the dominant one is this listing's gallery)
    const byFolder = {};
    d.imgs.forEach((u) => { const f = hipFolder(u); if (f) (byFolder[f] = byFolder[f] || []).push(u); });
    let imgs = Object.values(byFolder).sort((a, b) => b.length - a.length)[0] || [];
    if (!imgs.length && d.ogImage) imgs = [d.ogImage];
    return {
      title: (d.h1 || "").trim(),
      price,
      beds,
      beds_baths: beds ? `${beds} beds` : null,
      area: (area || d.h1).slice(0, 80),
      rental_location: area || null,
      listed: null,
      description: `${d.ogDesc || ""}\n\n(Rent listed as USD${usd}/mo on Hipflat; ≈฿${price} at ฿${USD_THB}/USD.)`.trim().slice(0, 1200),
      contact: "Contact agent via Hipflat listing",
      url,
      imgs,
    };
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { name: "hipflat", label: "Hipflat", prefix: "hf", search, extract };
