// PropertyHub (Renthub network) — strong for Chiang Mai condos, incl. CMU area.
// Listing detail URLs: /listings/<thai-slug>---<id>. Search paginates ?page=N.
// Detail: "N/ เดือน" price, "N ห้องนอน" beds, "อัพเดทล่าสุด : DD/MM/YYYY".
// Images: bcdn.propertyhub.in.th/pictures/... (one upload folder per listing).

const { toListed, collectImages } = require("../util");

const SEARCHES = [
  "https://propertyhub.in.th/เช่าคอนโด/เชียงใหม่",
  "https://propertyhub.in.th/เช่าบ้าน/เชียงใหม่",
];
const MAX_PAGES = 2;

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
        [...document.querySelectorAll('a[href*="/listings/"]')].map((a) => a.href).filter((h) => /\/listings\/.+--+\d+$/.test(h.split("?")[0]))
      )).forEach((h) => urls.add(h.split("?")[0]));
      if (log) log(`[propertyhub] ${u} -> total ${urls.size}`);
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
    // Each listing's photos live in ONE upload folder (/pictures/YYYYMM/YYYYMMDD/);
    // similar-listing thumbnails use other folders. Keep only the dominant folder.
    const allImgs = await page.evaluate(() =>
      [...new Set([...document.querySelectorAll("img")].map((i) => (i.currentSrc || i.src || "").split("?")[0]).filter((s) => /bcdn\.propertyhub\.in\.th\/pictures/.test(s)))]
    );
    const folderOf = (u) => (u.match(/\/pictures\/\d+\/\d+\//) || [""])[0];
    const byFolder = {};
    allImgs.forEach((u) => { const f = folderOf(u); if (f) (byFolder[f] = byFolder[f] || []).push(u); });
    const top = Object.values(byFolder).sort((a, b) => b.length - a.length)[0] || [];
    const imgs = top;
    const pm = d.body.match(/([\d,]+)\s*\/\s*เดือน/) || d.body.match(/([\d,]+)\s*\/\s*month/i) || (d.h1.match(/เช่า\s*([\d,]+)/) || [])[0];
    const price = pm ? (Array.isArray(pm) ? pm[1] : pm.match(/[\d,]+/)[0]).replace(/,/g, "") : null;
    if (!price) return null;
    const bm = d.body.match(/(\d+)\s*ห้องนอน/) || d.h1.match(/(\d+)\s*(?:นอน|bed)/i);
    const beds = bm ? +bm[1] : null;
    const upM = d.body.match(/อัพเดทล่าสุด\s*:?\s*([0-9/]+)/);
    const listed = upM ? toListed(upM[1]) : null;
    // location line: appears after the room facts, before "ไปที่แผนที่"
    const locM = d.body.match(/ตร\.ม\.\s*\n([^\n]+?)\s*\n?\s*-?\s*\nไปที่แผนที่/) || d.body.match(/\n([^\n]*(?:เมือง|ตำบล|อำเภอ)[^\n]*)\nไปที่แผนที่/);
    const loc = locM ? locM[1].replace(/\s*-\s*$/, "").trim() : null;
    return {
      title: (d.h1 || "").trim().slice(0, 120),
      price,
      beds,
      beds_baths: beds ? `${beds} beds` : null,
      area: (loc || d.h1 || "").slice(0, 80),
      rental_location: loc,
      listed,
      description: (d.ogDesc || d.body).slice(0, 1200),
      contact: "Contact owner/agent via PropertyHub listing",
      url,
      imgs: imgs.length ? imgs : d.ogImage ? [d.ogImage] : [],
    };
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { name: "propertyhub", label: "PropertyHub", prefix: "ph", search, extract };
