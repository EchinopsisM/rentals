// Craigslist (Bangkok board, query "chiang mai") — sparse, owner/broker mix.
// Rental category: /search/apa. Search list is JS-rendered (needs networkidle).
// Detail pages are static HTML: H1 "฿<price> / <n>br - <title> (<hood>)".

const SEARCHES = [
  "https://bangkok.craigslist.org/search/apa?query=chiang+mai",
  "https://bangkok.craigslist.org/search/hhh?query=chiang+mai+for+rent",
];

async function search(ctx, log) {
  const page = await ctx.newPage();
  const urls = new Set();
  for (const u of SEARCHES) {
    try {
      await page.goto(u, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(4000);
      await page.evaluate(async () => { for (let i = 0; i < 4; i++) { window.scrollBy(0, 1400); await new Promise((r) => setTimeout(r, 350)); } });
    } catch (e) { continue; }
    (await page.evaluate(() => [...document.querySelectorAll('a[href*="/d/"]')].map((a) => a.href).filter((h) => /\/d\/.+\/\d+\.html$/.test(h)))).forEach((h) => urls.add(h));
    if (log) log(`[craigslist] ${u} -> total ${urls.size}`);
  }
  await page.close();
  return [...urls];
}

async function extract(ctx, url) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1500);
    const d = await page.evaluate(() => {
      const meta = (p) => { const e = document.querySelector(`meta[property="${p}"],meta[name="${p}"]`); return e ? e.content : null; };
      let beds = null;
      for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
        const m = s.textContent.match(/"numberOfBedrooms":\s*"?(\d+)"?/); if (m) beds = +m[1];
      }
      return {
        h1: (document.querySelector("h1") || {}).innerText || document.title,
        ogImage: meta("og:image"),
        body: (document.body.innerText || "").replace(/\n{2,}/g, "\n").slice(0, 3000),
        beds,
        imgs: [...new Set([...document.querySelectorAll("img")].map((i) => i.currentSrc || i.src).filter((s) => /images\.craigslist\.org/.test(s)))],
      };
    });
    // only keep rentals
    if (!/for rent|\/\s*\d+\s*br|\brent\b/i.test(d.h1 + " " + d.body) || /for sale/i.test(d.h1)) {
      if (/for sale/i.test(d.h1)) return null;
    }
    const pm = d.h1.match(/฿\s*([\d,]+)/) || d.body.match(/฿\s*([\d,]+)/);
    if (!pm) return null;
    const price = pm[1].replace(/,/g, "");
    const beds = d.beds || (d.h1.match(/(\d+)\s*br/i) || [])[1];
    const titleM = d.h1.match(/-\s*(.+?)\s*\(([^)]+)\)\s*$/) || d.h1.match(/-\s*(.+)$/);
    const title = titleM ? titleM[1].trim() : d.h1;
    const hood = titleM && titleM[2] ? titleM[2].trim() : null;
    return {
      title,
      price,
      beds: beds ? +beds : null,
      beds_baths: beds ? `${beds} beds` : null,
      area: (hood ? hood + ", Chiang Mai" : title).slice(0, 80),
      rental_location: hood,
      listed: null,
      description: d.body.replace(/^[\s\S]*?(QR Code|◀ prev)/, "").slice(0, 1200) || title,
      contact: "Reply via Craigslist listing",
      url,
      imgs: d.imgs,
    };
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { name: "craigslist", label: "Craigslist", prefix: "cl", search, extract };
