// Isolated single-adapter scraper for parallel fan-out.
//   node sources/scrape-one.js <adapter>
// Scrapes ONE adapter and writes kept listings to sources/out/<adapter>.json
// (does NOT touch the shared results.json/listings.json). Images go to
// id-prefixed dirs under the site, so concurrent runs never collide.
// A separate merge step folds the per-adapter files into the live data.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { classifyZone } = require("./classify");

const SITE = "/home/noah/chiangmai-rentals";
const IMGDIR = path.join(SITE, "src/img");
const OUTDIR = path.join(__dirname, "out");
const PRICE_CAP = 20000, PRICE_FLOOR = 3500, MIN_BEDS = 2, MAX_BEDS = 5, PER_IMG = 12, CANDIDATE_CAP = 50;
const OTHER_PROVINCE = /ลำปาง|ลำพูน|เชียงราย|พะเยา|lampang|lamphun|chiang ?rai|phayao/i;
const CHIANG_MAI = /เชียงใหม่|chiang ?mai/i;
const EXEC = "/home/noah/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const parsePrice = (s) => { if (s == null) return null; const n = parseInt(String(s).replace(/[^\d]/g, ""), 10); return isNaN(n) ? null : n; };
const parseBeds = (s) => { if (!s) return null; const m = String(s).match(/(\d+)\s*(?:bed|bd|ห้องนอน|นอน)/i); return m ? +m[1] : null; };
const slugify = (s) => String(s || "").toLowerCase().normalize("NFC").replace(/[\/\\(),.·—–|:'"!?#@%&*+=\[\]{}<>]+/g, " ").trim().replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 46).replace(/-$/, "");
const deriveId = (r, prefix) => { if (r.id) return r.id; const sid = (r.siteId || "").toString().replace(/[^\w-]/g, ""); if (sid) return prefix + sid; return prefix + crypto.createHash("md5").update(r.url || "").digest("hex").slice(0, 12); };

async function downloadImages(ctx, id, urls) {
  const dir = path.join(IMGDIR, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const seen = new Set(); const local = []; let n = 0;
  for (const u of urls || []) {
    if (n >= PER_IMG) break;
    try {
      const resp = await ctx.request.get(u, { timeout: 20000 });
      if (resp.status() !== 200) continue;
      const buf = await resp.body();
      if (buf.length < 3000) continue;
      const h = crypto.createHash("md5").update(buf).digest("hex");
      if (seen.has(h)) continue;
      seen.add(h);
      fs.writeFileSync(path.join(dir, n + ".jpg"), buf);
      local.push("/img/" + id + "/" + n + ".jpg");
      n++;
    } catch (e) {}
  }
  if (!local.length) fs.rmSync(dir, { recursive: true, force: true });
  return local;
}

(async () => {
  const name = process.argv[2];
  const ad = require(path.join(__dirname, "adapters", name + ".js"));
  fs.mkdirSync(OUTDIR, { recursive: true });
  const OUT = path.join(OUTDIR, name + ".json");
  const out = [];
  const log = (...a) => console.log(`[${name}]`, ...a);

  const browser = await chromium.launch({ headless: true, executablePath: EXEC, args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--password-store=basic", "--use-mock-keychain"] });
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, locale: "th-TH" });

  let urls = [];
  try { urls = await ad.search(ctx, () => {}); } catch (e) { log("search FAILED:", e.message.slice(0, 80)); await browser.close(); fs.writeFileSync(OUT, "[]"); return; }
  urls = [...new Set(urls)];
  if (ad.prefilter) urls = urls.filter((u) => ad.prefilter(u));
  if (urls.length > CANDIDATE_CAP) urls = urls.slice(0, CANDIDATE_CAP);
  log(urls.length, "candidates");

  const localSeen = new Set();
  let kept = 0, dropped = 0;
  for (const url of urls) {
    let rec;
    try { rec = await ad.extract(ctx, url); } catch (e) { continue; }
    if (!rec) continue;
    rec.url = rec.url || url;
    const priceNum = parsePrice(rec.price);
    const beds = rec.beds != null ? rec.beds : parseBeds(rec.beds_baths || rec.title);
    if (priceNum == null || priceNum > PRICE_CAP || priceNum < PRICE_FLOOR) { dropped++; continue; }
    if (beds == null || beds < MIN_BEDS || beds > MAX_BEDS) { dropped++; continue; }
    const provHay = [rec.area, rec.rental_location, rec.title].filter(Boolean).join(" ");
    if (OTHER_PROVINCE.test(provHay) && !CHIANG_MAI.test(provHay)) { dropped++; continue; }
    const id = deriveId(rec, ad.prefix);
    const dk = priceNum + "|" + slugify(rec.area || rec.title).slice(0, 24);
    if (localSeen.has(dk)) continue;
    localSeen.add(dk);
    rec.zone = classifyZone(rec.area, rec.title, rec.rental_location, rec.description) || "backup";
    const local = await downloadImages(ctx, id, rec.imgs);
    out.push({
      id, priceNum, beds,
      source_site: ad.label || name,
      title: rec.title || rec.area, price: String(priceNum), beds_baths: rec.beds_baths || `${beds} beds`,
      area: rec.area || rec.title, zone: rec.zone, rental_location: rec.rental_location || null,
      listed: rec.listed || null, move_in_date: rec.move_in_date || null,
      description: rec.description || null, url: rec.url,
      seller_name: rec.seller_name || null, seller_profile: rec.seller_profile || null,
      contact: rec.contact || `See listing on ${ad.label || name}`,
      images: local, slug: id + "-" + slugify(rec.area || rec.title),
    });
    kept++;
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    log(`+ ฿${priceNum} ${beds}BR ${rec.zone} ${(rec.area || "").slice(0, 36)} (${local.length} imgs)`);
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  log(`DONE: kept ${kept}, dropped ${dropped} -> ${OUT}`);
})();
