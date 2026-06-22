// Shared multi-source scraper pipeline.
//
//   node sources/pipeline.js <adapter> [<adapter> ...]
//   node sources/pipeline.js all
//
// Each adapter (sources/adapters/<name>.js) exports:
//   { name, prefix, search(ctx, log) -> [url],  extract(ctx, url) -> record|null }
// where `record` is a partial results.json row (title, price, beds_baths,
// area, rental_location, listed, description, contact, url, imgs[], ...).
//
// The pipeline normalises, filters (>=2 beds, <=20k THB), zone-classifies,
// dedupes (vs existing + within batch), downloads images, appends to both
// results.json and listings.json, then re-runs score.js over everything.

const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { classifyZone } = require("./classify");

const BOT = "/home/noah/bot";
const SITE = "/home/noah/chiangmai-rentals";
const RES = path.join(BOT, "results.json");
const LST = path.join(SITE, "src/_data/listings.json");
const IMGDIR = path.join(SITE, "src/img");
const PRICE_CAP = 20000;
const PRICE_FLOOR = 3500; // below this for a 2BR+ is almost always a misparse
const MIN_BEDS = 2;
const MAX_BEDS = 5; // 6+ bedrooms = villa/guesthouse, outside the "2 main rooms" brief
const PER_IMG = 12; // max images saved per listing
const CANDIDATE_CAP = 50; // max detail pages to extract per adapter (early pages = freshest)
const OTHER_PROVINCE = /ลำปาง|ลำพูน|เชียงราย|พะเยา|lampang|lamphun|chiang ?rai|phayao/i;
const CHIANG_MAI = /เชียงใหม่|chiang ?mai/i;

const EXEC = "/home/noah/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

const log = (...a) => console.log(...a);

// --- field helpers -----------------------------------------------------------
const parsePrice = (s) => {
  if (s == null) return null;
  const n = parseInt(String(s).replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? null : n;
};
const parseBeds = (s) => {
  if (!s) return null;
  const m = String(s).match(/(\d+)\s*(?:bed|bd|ห้องนอน|นอน)/i);
  if (m) return +m[1];
  if (/studio|สตูดิโอ/i.test(s)) return 0;
  return null;
};
const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/[\/\\(),.·—–|:'"!?#@%&*+=\[\]{}<>]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 46)
    .replace(/-$/, "");
const deriveId = (r, prefix) => {
  if (r.id) return r.id;
  const fb = (r.url || "").match(/item\/(\d+)/);
  if (fb) return fb[1];
  const sid = (r.siteId || "").toString().replace(/[^\w-]/g, "");
  if (sid) return (prefix || "x") + sid;
  return (prefix || "x") + crypto.createHash("md5").update(r.url || "").digest("hex").slice(0, 12);
};
// dedup key: same source listing id, else normalized url, else price+area
const dedupKeys = (r, id) => [
  "id:" + id,
  "url:" + (r.url || "").split("?")[0].replace(/\/$/, ""),
  "pa:" + (r.priceNum || parsePrice(r.price)) + "|" + slugify(r.area || r.title).slice(0, 24),
];

// --- image download (md5-dedup, same approach as rescrape.js) ----------------
async function downloadImages(ctx, id, urls) {
  const dir = path.join(IMGDIR, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const seen = new Set();
  const local = [];
  let n = 0;
  for (const u of urls || []) {
    if (n >= PER_IMG) break;
    try {
      const resp = await ctx.request.get(u, { timeout: 20000 });
      if (resp.status() !== 200) continue;
      const buf = await resp.body();
      if (buf.length < 3000) continue; // skip icons/spacers
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

// --- main --------------------------------------------------------------------
(async () => {
  let names = process.argv.slice(2);
  const adapters = [];
  const ADIR = path.join(__dirname, "adapters");
  if (names[0] === "all") names = fs.readdirSync(ADIR).filter((f) => f.endsWith(".js")).map((f) => f.replace(/\.js$/, ""));
  for (const n of names) {
    try {
      adapters.push(require(path.join(ADIR, n + ".js")));
    } catch (e) {
      log("!! cannot load adapter", n, e.message);
    }
  }
  if (!adapters.length) {
    log("usage: node sources/pipeline.js <adapter|all> [...]");
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(RES, "utf8"));
  const listings = JSON.parse(fs.readFileSync(LST, "utf8"));

  // seed dedup set from everything already known
  const seen = new Set();
  for (const r of results) {
    const id = deriveId(r);
    dedupKeys(r, id).forEach((k) => seen.add(k));
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath: EXEC,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage", "--password-store=basic", "--use-mock-keychain"],
  });
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, locale: "th-TH" });

  const tally = {};
  for (const ad of adapters) {
    tally[ad.name] = { found: 0, kept: 0, dropped: 0, err: 0 };
    let urls = [];
    try {
      urls = await ad.search(ctx, log);
    } catch (e) {
      log(`[${ad.name}] search FAILED: ${e.message.slice(0, 100)} — skipping source`);
      continue;
    }
    urls = [...new Set(urls)];
    // optional cheap URL prefilter (e.g. bedroom count encoded in the URL)
    if (ad.prefilter) urls = urls.filter((u) => ad.prefilter(u));
    tally[ad.name].found = urls.length;
    if (urls.length > CANDIDATE_CAP) { log(`[${ad.name}] capping ${urls.length} -> ${CANDIDATE_CAP} candidates`); urls = urls.slice(0, CANDIDATE_CAP); }
    log(`[${ad.name}] ${urls.length} candidate URLs to extract`);

    for (const url of urls) {
      const pre = dedupKeys({ url }, deriveId({ url }, ad.prefix));
      if (pre.some((k) => seen.has(k))) continue; // url-level early dedup

      let rec;
      try {
        rec = await ad.extract(ctx, url);
      } catch (e) {
        tally[ad.name].err++;
        continue;
      }
      if (!rec) continue;
      rec.url = rec.url || url;
      rec.source_site = ad.label || ad.name;

      // normalize numerics + filter
      const priceNum = parsePrice(rec.price);
      const beds = rec.beds != null ? rec.beds : parseBeds(rec.beds_baths || rec.title);
      if (priceNum == null || priceNum > PRICE_CAP || priceNum < PRICE_FLOOR) { tally[ad.name].dropped++; continue; }
      if (beds == null || beds < MIN_BEDS || beds > MAX_BEDS) { tally[ad.name].dropped++; continue; }
      // wrong-province guard: keyword searches sometimes leak adjacent provinces
      const provHay = [rec.area, rec.rental_location, rec.title].filter(Boolean).join(" ");
      if (OTHER_PROVINCE.test(provHay) && !CHIANG_MAI.test(provHay)) { tally[ad.name].dropped++; continue; }

      const id = deriveId(rec, ad.prefix);
      const keys = dedupKeys(rec, id);
      if (keys.some((k) => seen.has(k))) continue;
      keys.forEach((k) => seen.add(k));

      // zone
      rec.zone = classifyZone(rec.area, rec.title, rec.rental_location, rec.description) || "backup";
      rec.area = rec.area || rec.title;
      rec.move_in_date = rec.move_in_date || null;

      // images
      const local = await downloadImages(ctx, id, rec.imgs);
      rec.imgs = rec.imgs || [];

      // append to results (master)
      const resRec = {
        title: rec.title || rec.area,
        listed: rec.listed || null,
        location_hint: rec.location_hint || null,
        bodytext: null,
        imgs: rec.imgs,
        url: rec.url,
        source_site: rec.source_site,
        price: rec.price != null ? String(rec.price).replace(/[^\d,]/g, "") || String(priceNum) : String(priceNum),
        beds_baths: rec.beds_baths || `${beds} beds`,
        rental_location: rec.rental_location || null,
        description: rec.description || null,
        seller_name: rec.seller_name || null,
        seller_profile: rec.seller_profile || null,
        contact: rec.contact || `See listing on ${rec.source_site}`,
        area: rec.area,
        zone: rec.zone,
        move_in_date: rec.move_in_date,
        id,
      };
      results.push(resRec);

      // append derived listing
      listings.push({
        id,
        slug: id + "-" + slugify(rec.area || rec.title),
        title: resRec.title,
        price: resRec.price,
        priceNum,
        beds,
        beds_baths: resRec.beds_baths,
        area: resRec.area,
        zone: resRec.zone,
        rental_location: resRec.rental_location,
        listed: resRec.listed,
        move_in_date: resRec.move_in_date,
        description: resRec.description,
        source_site: resRec.source_site,
        url: resRec.url,
        seller_name: resRec.seller_name,
        seller_profile: resRec.seller_profile,
        contact: resRec.contact,
        images: local,
        imgCount: local.length,
      });
      tally[ad.name].kept++;
      // incremental write so a timeout/crash never loses found listings
      fs.writeFileSync(RES, JSON.stringify(results, null, 1));
      fs.writeFileSync(LST, JSON.stringify(listings, null, 2));
      log(`  + [${ad.name}] ฿${priceNum} ${beds}BR ${rec.zone} — ${(rec.area || rec.title || "").slice(0, 50)} (${local.length} imgs)`);
    }
  }

  await browser.close();

  fs.writeFileSync(RES, JSON.stringify(results, null, 1));
  fs.writeFileSync(LST, JSON.stringify(listings, null, 2));

  // re-score everything
  try {
    const out = execFileSync("node", [path.join(SITE, "score.js")], { encoding: "utf8" });
    log(out.split("\n").slice(0, 3).join("\n"));
  } catch (e) {
    log("score.js failed:", e.message.slice(0, 120));
  }

  log("\n=== summary ===");
  for (const [n, t] of Object.entries(tally)) log(`  ${n}: found ${t.found}, kept ${t.kept}, dropped ${t.dropped}, errors ${t.err}`);
  log(`results.json now ${results.length}, listings.json now ${listings.length}`);
})();
