// Thailand-Property (FazWaz network) — per-unit rentals, English, prices in THB.
// Detail URLs: /ads/<N>-bedroom-<type>-for-rent-in-<location>_<hash>.
// Location breadcrumb is precise (down to subdistrict, e.g. Suthep).
// Images: img.thailand-property.com base64 keys ("ingester/<uuid>/...") -> group.

const SEARCHES = ["https://www.thailand-property.com/properties-for-rent/chiang-mai"];
const MAX_PAGES = 5;

// beds encoded in the slug; skip <2 or >5 before extracting
function prefilter(url) {
  const m = url.match(/\/ads\/(\d+)-bedroom/);
  if (!m) return false; // require a bedroom count in the slug
  const n = +m[1];
  return n >= 2 && n <= 5;
}

function cdnFolder(u) {
  try {
    const b64 = u.split("/").pop().split("?")[0];
    const j = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    const m = (j.key || "").match(/[a-z]+\/[0-9a-f]{8}-[0-9a-f-]{20,}\//i);
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
      (await page.evaluate(() => [...document.querySelectorAll('a[href*="/ads/"]')].map((a) => a.href).filter((h) => /\/ads\/.+_[0-9a-f-]+$/.test(h.split("?")[0])))).forEach((h) => urls.add(h.split("?")[0]));
      if (log) log(`[thailandproperty] ${u} -> total ${urls.size}`);
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
      let ldName = null;
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        const m = s.textContent.match(/"name":\s*"([^"]*for rent[^"]*)"/i); if (m) ldName = m[1];
      }
      return {
        h1: (document.querySelector("h1") || {}).innerText || document.title,
        ldName,
        ogImage: meta("og:image"),
        ogDesc: meta("og:description"),
        body: (document.body.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 4000),
        imgs: [...new Set([...document.querySelectorAll("img")].map((i) => (i.currentSrc || i.src || "").split("?")[0]).filter((s) => /img\.thailand-property\.com/.test(s)))],
      };
    });
    const pm = d.body.match(/Rent:?\s*฿\s*([\d,]+)\s*\/?\s*month/i) || d.body.match(/฿\s*([\d,]+)\s*\/\s*month/i);
    if (!pm) return null;
    const price = pm[1].replace(/,/g, "");
    const bm = url.match(/(\d+)-bedroom/) || d.h1.match(/(\d+)\s*bedroom/i);
    const beds = bm ? +bm[1] : null;
    // location: breadcrumb line "Chiang Mai, Mueang Chiang Mai, Suthep" or LD name tail
    const locM = d.body.match(/\n\s*(Chiang Mai,[^\n]+)\n/) || (d.ldName ? [null, d.ldName.replace(/^.*\bin\b\s*/i, "")] : null);
    const loc = locM ? locM[1].trim() : null;
    const byFolder = {};
    d.imgs.forEach((u) => { const f = cdnFolder(u); if (f) (byFolder[f] = byFolder[f] || []).push(u); });
    let imgs = Object.values(byFolder).sort((a, b) => b.length - a.length)[0] || [];
    if (!imgs.length && d.ogImage) imgs = [d.ogImage];
    return {
      title: (d.ldName || d.h1 || "").trim(),
      price,
      beds,
      beds_baths: beds ? `${beds} beds` : null,
      area: (loc || d.ldName || d.h1).slice(0, 80),
      rental_location: loc,
      listed: null,
      description: (d.ogDesc || d.body).slice(0, 1200),
      contact: "Contact agent via Thailand-Property listing",
      url,
      imgs,
    };
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { name: "thailandproperty", label: "Thailand-Property", prefix: "tp", search, extract, prefilter };
