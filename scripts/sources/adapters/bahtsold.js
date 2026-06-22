// BahtSold — old-school Thailand classifieds, owner-style postings.
// CM rentals via ?area_id=9. Detail URLs: /view/<slug>-<id>.
// Detail page is cleanly labelled: ฿<price>, "Posted <date>", "Bedrooms <n>".

const { toListed, collectImages } = require("../util");

const SEARCHES = [
  "https://www.bahtsold.com/category/house-for-rent-177?area_id=9",
  "https://www.bahtsold.com/category/condo-apartment-for-rent-175?area_id=9",
];
const MAX_PAGES = 4;

async function search(ctx, log) {
  const page = await ctx.newPage();
  const urls = new Set();
  for (const base of SEARCHES) {
    for (let p = 1; p <= MAX_PAGES; p++) {
      const u = base + (p > 1 ? `&page=${p}` : "");
      try {
        await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
      } catch (e) { break; }
      const before = urls.size;
      (await page.evaluate(() =>
        [...document.querySelectorAll('a[href*="/view/"]')].map((a) => a.href).filter((h) => /\/view\/.+-\d+$/.test(h.split("?")[0]))
      )).forEach((h) => urls.add(h.split("?")[0]));
      if (log) log(`[bahtsold] ${u} -> total ${urls.size}`);
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
    await page.waitForTimeout(2200);
    const d = await page.evaluate(() => {
      const meta = (p) => { const e = document.querySelector(`meta[property="${p}"],meta[name="${p}"]`); return e ? e.content : null; };
      return {
        h1: (document.querySelector("h1") || {}).innerText || document.title,
        ogImage: meta("og:image"),
        body: (document.body.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 4000),
      };
    });
    const imgs = await collectImages(page, /images\.bahtsold\.com/);
    // price: first ฿ amount (the main listing price, shown above Save/Share)
    const pm = d.body.match(/฿\s*([\d,]+)/);
    const price = pm ? pm[1].replace(/,/g, "") : null;
    if (!price) return null;
    const bm = d.body.match(/Bedrooms\s*\n?\s*(\d+)/i) || d.h1.match(/(\d+)\s*bed/i);
    const beds = bm ? +bm[1] : null;
    const posted = (d.body.match(/Posted\s+([0-9]{1,2}\s+\w+\s+[0-9]{2,4})/) || [])[1] || null;
    // location: the line right after "Posted ... •"
    const locM = d.body.match(/Posted[^\n]*\n?\s*•?\s*\n?\s*([^\n]+)\n/) || d.body.match(/•\s*\n\s*([A-Za-zก-๙][^\n]{2,40})\n/);
    const loc = locM ? locM[1].trim() : null;
    const finalImgs = imgs.length ? imgs : d.ogImage ? [d.ogImage] : [];
    return {
      title: (d.h1 || "").trim(),
      price,
      beds,
      beds_baths: beds ? `${beds} beds` : null,
      area: (loc ? loc + ", Chiang Mai" : d.h1).slice(0, 80),
      rental_location: loc,
      listed: posted ? toListed(posted) : null,
      description: d.body.replace(/^[\s\S]*?(Property Overview|Description)/, "$1").slice(0, 1200),
      contact: "Contact via BahtSold listing",
      url,
      imgs: finalImgs,
    };
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { name: "bahtsold", label: "BahtSold", prefix: "bs", search, extract };
