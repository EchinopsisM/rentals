// Merge parallel scrape outputs (sources/out/*.json) into the live data.
//   node sources/merge.js [<name> ...]   (default: all files in out/)
// Dedups against existing results.json + within the batch, appends to both
// results.json and listings.json, then re-runs score.js.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BOT = "/home/noah/bot";
const SITE = "/home/noah/chiangmai-rentals";
const RES = path.join(BOT, "results.json");
const LST = path.join(SITE, "src/_data/listings.json");
const OUTDIR = path.join(__dirname, "out");

const slug24 = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9ก-๙]+/g, "").slice(0, 24);
const keysOf = (r) => ["id:" + r.id, "url:" + (r.url || "").split("?")[0].replace(/\/$/, ""), "pa:" + (r.priceNum || "") + "|" + slug24(r.area || r.title)];

const results = JSON.parse(fs.readFileSync(RES, "utf8"));
const listings = JSON.parse(fs.readFileSync(LST, "utf8"));
const seen = new Set();
results.forEach((r) => { const id = r.id || (r.url.match(/item\/(\d+)/) || [])[1]; keysOf({ id, url: r.url, priceNum: listings.find((l) => l.id === id)?.priceNum, area: r.area, title: r.title }).forEach((k) => seen.add(k)); });

let names = process.argv.slice(2);
if (!names.length) names = fs.readdirSync(OUTDIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

let added = 0, skipped = 0;
for (const name of names) {
  const f = path.join(OUTDIR, name + ".json");
  if (!fs.existsSync(f)) { console.log("no output for", name); continue; }
  const recs = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const o of recs) {
    if (keysOf(o).some((k) => seen.has(k))) { skipped++; continue; }
    keysOf(o).forEach((k) => seen.add(k));
    results.push({
      title: o.title, listed: o.listed, location_hint: null, bodytext: null,
      imgs: [], url: o.url, source_site: o.source_site, price: o.price,
      beds_baths: o.beds_baths, rental_location: o.rental_location, description: o.description,
      seller_name: o.seller_name, seller_profile: o.seller_profile, contact: o.contact,
      area: o.area, zone: o.zone, move_in_date: o.move_in_date, id: o.id,
    });
    listings.push({
      id: o.id, slug: o.slug, title: o.title, price: o.price, priceNum: o.priceNum,
      beds: o.beds, beds_baths: o.beds_baths, area: o.area, zone: o.zone,
      rental_location: o.rental_location, listed: o.listed, move_in_date: o.move_in_date,
      description: o.description, source_site: o.source_site, url: o.url,
      seller_name: o.seller_name, seller_profile: o.seller_profile, contact: o.contact,
      images: o.images, imgCount: o.images.length,
    });
    added++;
  }
}
fs.writeFileSync(RES, JSON.stringify(results, null, 1));
fs.writeFileSync(LST, JSON.stringify(listings, null, 2));
console.log(`merged: +${added}, skipped(dup) ${skipped} -> results ${results.length}, listings ${listings.length}`);
console.log(execFileSync("node", [path.join(SITE, "score.js")], { encoding: "utf8" }).split("\n").slice(0, 2).join("\n"));
