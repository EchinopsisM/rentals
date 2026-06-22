// LivingInsider — large Thai listing aggregator (owner + agent posts).
// Search paginates via path: /searchword/{Home|Condo}/Rent/<page>/<query>.html
// Detail URLs: /detail/<...>-<id>. Price "฿ N /ด." (monthly), beds "N ห้องนอน",
// posted "สร้างเมื่อ <thai-relative>".

const { toListed, collectImages } = require("../util");

const Q = "เชียงใหม่";
const SEARCHES = [
  (p) => `https://www.livinginsider.com/searchword/Home/Rent/${p}/${encodeURIComponent(Q)}.html`,
  (p) => `https://www.livinginsider.com/searchword/Condo/Rent/${p}/${encodeURIComponent(Q)}.html`,
];
const MAX_PAGES = 2;

// URLs encode bedroom count ("...-2bedroom-12345"); skip <2BR before extract.
function prefilter(url) {
  const m = url.match(/(\d+)bedroom/);
  return !m || +m[1] >= 2;
}

async function search(ctx, log) {
  const page = await ctx.newPage();
  const urls = new Set();
  for (const mk of SEARCHES) {
    for (let p = 1; p <= MAX_PAGES; p++) {
      try {
        await page.goto(mk(p), { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
        await page.evaluate(async () => { for (let i = 0; i < 4; i++) { window.scrollBy(0, 1400); await new Promise((r) => setTimeout(r, 300)); } });
      } catch (e) { break; }
      const before = urls.size;
      (await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/detail/"]')].map((a) => a.href)
          .filter((h) => /\/detail\/.*-\d+$/.test(h.split("?")[0]) && !/for-sale(?!-rent)/.test(h))
      )).forEach((h) => urls.add(h.split("?")[0]));
      if (log) log(`[livinginsider] page ${p} -> total ${urls.size}`);
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
      };
    });
    // LivingInsider's gallery is lazy-loaded JS and the page is dominated by
    // similar-listing thumbnails (all full-res), so multi-image extraction is
    // unreliable. Use the og:image only — it is this listing's own hero photo
    // (its URL embeds the listing id), guaranteeing no cross-listing mixups.
    const pm = d.body.match(/฿\s*([\d,]+)\s*\/?\s*ด\./) || d.body.match(/฿\s*([\d,]+)\s*\/\s*month/i);
    const price = pm ? pm[1].replace(/,/g, "") : null;
    if (!price) return null;
    const bm = d.body.match(/(\d+)\s*ห้องนอน/) || url.match(/(\d+)bedroom/);
    const beds = bm ? +bm[1] : null;
    const postedM = d.body.match(/สร้างเมื่อ\s*([^\n(]+)/);
    const listed = postedM ? toListed(postedM[1].trim()) : null;
    // location: the 📍 line, else description first line
    const locM = d.body.match(/📍\s*([^\n]+)/);
    const loc = locM ? locM[1].trim() : null;
    const finalImgs = d.ogImage ? [d.ogImage] : [];
    return {
      title: (d.h1 || "").replace(/[🏡✨📍🚗]/g, "").trim().slice(0, 120),
      price,
      beds,
      beds_baths: beds ? `${beds} beds` : null,
      area: (loc || d.h1 || "").replace(/[🏡✨📍🚗]/g, "").trim().slice(0, 80),
      rental_location: loc,
      listed,
      description: (d.ogDesc || d.body).slice(0, 1200),
      contact: "Contact owner/agent via LivingInsider listing",
      url,
      imgs: finalImgs,
    };
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { name: "livinginsider", label: "LivingInsider", prefix: "li", search, extract, prefilter };
