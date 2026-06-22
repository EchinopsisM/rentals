#!/usr/bin/env node
// Orchestrates the Facebook refresh for the rental site:
//   1. scrape rental groups (fb-scrape.js) + Marketplace (mp-scrape.js)
//   2. filter to the Zoo->Wat Umong band, 2BR+, <=20k, rentals only
//   3. convert to the site's listing schema (group posts = location-confirmed;
//      Marketplace = location-unsure) and merge into listings.json
// Idempotent: every run replaces the previous FB-sourced entries (fbRefresh:true)
// so stale posts drop out automatically. Safe to run unattended from the daemon —
// if the saved FB session is logged out, the scrapers exit 2 and we skip cleanly.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const LST = "/home/noah/chiangmai-rentals/src/_data/feed.json";
const GROUP_SCROLLS = process.env.FB_SCROLLS || "8";

function run(script, args, ms) {
  try {
    execFileSync("node", [path.join(DIR, script), ...args], { cwd: DIR, timeout: ms, stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch (e) {
    const code = e.status;
    process.stdout.write(`[fb-to-site] ${script} exit ${code} (${e.signal || e.message || ""})\n`);
    return false; // logged-out (2), timeout, or error — caller continues with whatever JSON exists
  }
}

// --- filters (mirror target-filter.js) ---
const ZONE = /(สุเทพ|suthep|มช\b|ม\.ช|มหาวิทยาลัยเชียงใหม่|cmu|chiang mai university|นิมมาน|nimman|สวนดอก|suan ?dok|มหาราช|maharaj|ห้วยแก้ว|huay ?kaew|huai ?kaew|คลองชลประทาน|คลองชล|canal ?road|คันคลอง|อุโมงค์|umong|ต้นพยอม|ton ?payom|เมญ่า|maya|ศิริมังคลาจารย์|sirimangkala|หลังมอ|หลัง ?มช|วัดอุโมงค์|ผาลาด|โพธาราม)/i;
const CORE = /(มช\b|ม\.ช|มหาวิทยาลัยเชียงใหม่|cmu|chiang mai university|สวนดอก|suan ?dok|มหาราช|maharaj|นิมมาน|nimman|ห้วยแก้ว|huay ?kaew|huai ?kaew|เมญ่า|maya)/i;
const OUTZONE = /(ช้างเผือก|chang ?phueak|โชตนา|chotana|ป่าตัน|pa ?tan|บ้านท่อ|สันติธรรม|santitham|เจ็ดยอด|jed ?yod|หนองหอย|nong ?hoi|หางดง|hang ?dong|สันกำแพง|san ?kamphaeng|สารภี|saraphi|ดอยสะเก็ด|doi ?saket|สันทราย|san ?sai|แม่โจ้|mae ?jo|รวมโชค|ruamchok|ฟ้าฮ่าม|fa ?ham|แม่เหียะ|mae ?hia|ไนท์ซาฟารี|night ?safari)/i;
const RENT = /(ให้เช่า|ปล่อยเช่า|ค่าเช่า|for rent|เช่า\s|\/เดือน|\/month|บาท\/เดือน|thb\/)/i;
const SALE_ONLY = /(ขาย|sale|sell|ล้านบาท|million|ผ่อน|โอน)/i;
const SPAM = /(ขนย้าย|ขนส่ง|รับย้าย|ทำความสะอาด|บิ๊กคลีน|สินเชื่อ|นายหน้าคอม)/i;
const BTS = /(bts|mrt|sukhumvit|สุขุมวิท|พระราม|กรุงเทพ|bangkok|thong ?lo|ทองหล่อ|phrom|อโศก|เกษตร|นวมินทร์)/i;
const BEDS = /(\d)\s*(ห้องนอน|นอน\b|bed|br\b|bedroom)/i;

const beds = (t) => { const m = t.match(BEDS); return m ? +m[1] : null; };
const rentPrice = (t) => { const m = t.match(/(?:ค่าเช่า|เช่า|rent)[^\d]{0,8}([\d][\d,]{2,})/i) || t.match(/([\d][\d,]{2,})\s*(?:บาท|thb|฿)?\s*\/\s*(?:เดือน|month)/i) || t.match(/฿\s*([\d][\d,]{2,})/); return m ? +m[1].replace(/,/g, "") : null; };
const priceSub = (n) => Math.max(0, Math.min(1, (20000 - n) / 10000));
const sb = (mv, loc, rec, pr) => ({ moveIn: { sub: mv, points: +(mv * 40).toFixed(1) }, location: { sub: loc, points: +(loc * 25).toFixed(2) }, recency: { sub: rec, points: +(rec * 20).toFixed(1) }, price: { sub: pr, points: +(pr * 15).toFixed(1) } });
const score = (b) => +(b.moveIn.points + b.location.points + b.recency.points + b.price.points).toFixed(1);
const pid = (url) => (url.match(/\/(?:permalink|posts|item)\/(\d+)/) || [])[1] || url.slice(-16);

function buildFromGroups(groups) {
  const out = [], seen = new Set();
  for (const g of Object.values(groups)) {
    for (const p of (g.posts || [])) {
      const t = p.text || ""; if (!p.url) continue;
      if (!ZONE.test(t) || OUTZONE.test(t) || !RENT.test(t) || SPAM.test(t) || BTS.test(t)) continue;
      const b = beds(t); if (!(b >= 2 && b <= 5)) continue;
      const pr = rentPrice(t); if (pr && pr > 20000) continue;
      if (SALE_ONLY.test(t) && !RENT.test(t)) continue;
      const k = t.slice(0, 80); if (seen.has(k)) continue; seen.add(k);
      const id = pid(p.url);
      const zone = CORE.test(t) ? "target" : "target-edge";
      const locSub = CORE.test(t) ? 0.9 : 0.75;
      const bk = sb(1, locSub, 0.95, priceSub(pr || 18000));
      out.push({
        id, slug: id + "-fb-group", title: (t.split("\n")[0] || "").slice(0, 80) || `${b}BR — ${g.label}`,
        price: pr ? pr.toLocaleString() : "?", priceNum: pr || 18000, beds: b, beds_baths: `${b} beds`,
        area: `In-band rental — ${g.label}`, zone, rental_location: "Suthep / CMU band (named in post — verify exact spot)",
        listed: "Listed recently", move_in_date: "Ready now",
        description: t.slice(0, 1200), source_site: `Facebook Group — ${g.label}`,
        url: p.url, seller_name: "", seller_profile: "", contact: "View on Facebook group post (link)",
        images: [], imgCount: 0, fbRefresh: true, scoreBreakdown: bk, score: score(bk),
      });
    }
  }
  return out;
}

function buildFromMarketplace(mp) {
  const out = [];
  for (const x of mp) {
    const t = x.text || ""; const sutQ = (x.q || "").includes("สุเทพ");
    if (OUTZONE.test(t)) continue;
    if (!sutQ && !ZONE.test(t)) continue;
    const b = beds(t); if (!(b >= 2 && b <= 5)) continue;
    const pm = t.match(/฿\s*([\d,]+)/); const priceNum = pm ? +pm[1].replace(/,/g, "") : null;
    if (priceNum && priceNum > 20000) continue;
    const id = x.id;
    const bk = sb(1, 0.30, 0.9, priceSub(priceNum || 20000));
    out.push({
      id, slug: id + "-fb-mp-unsure", title: t.replace(/Just listed \| /, "").replace(/\s*\| Chiang Mai.*/, "").trim() || `${b}BR`,
      price: priceNum ? priceNum.toLocaleString() : "?", priceNum: priceNum || 99999, beds: b, beds_baths: `${b} beds`,
      area: "⚠️ Location UNSURE — FB Marketplace (Suthep search)", zone: "out",
      rental_location: "Chiang Mai (exact location hidden by Marketplace — verify by opening link)",
      listed: "Listed recently", move_in_date: "—",
      description: "⚠️ LOCATION UNSURE — from the FB Marketplace 'เช่า สุเทพ' search; open the link to confirm it sits between Chiang Mai Zoo and Wat Umong.\n\nCard: " + t,
      source_site: "Facebook Marketplace (location unsure)", url: x.url,
      seller_name: "", seller_profile: "", contact: "Open on FB Marketplace to view location & message seller",
      images: [], imgCount: 0, fbRefresh: true, scoreBreakdown: bk, score: score(bk),
    });
  }
  return out;
}

// --- run scrapers (best-effort; SKIP_SCRAPE=1 reuses out.json/mp.json on disk) ---
if (!process.env.SKIP_SCRAPE) {
  console.log(`[fb-to-site] ${new Date().toISOString()} scraping groups...`);
  run("fb-scrape.js", [GROUP_SCROLLS], 12 * 60 * 1000);
  console.log(`[fb-to-site] scraping marketplace...`);
  run("mp-scrape.js", ["2 bedroom", "บ้านเช่า", "คอนโดเช่า", "2 ห้องนอน", "เช่า สุเทพ", "condo for rent"], 5 * 60 * 1000);
}

// --- build entries ---
let fbEntries = [];
try { fbEntries = fbEntries.concat(buildFromGroups(JSON.parse(fs.readFileSync(path.join(DIR, "out.json"), "utf8")))); } catch (e) { console.log("[fb-to-site] no group data:", e.message); }
try { fbEntries = fbEntries.concat(buildFromMarketplace(JSON.parse(fs.readFileSync(path.join(DIR, "mp.json"), "utf8")))); } catch (e) { console.log("[fb-to-site] no mp data:", e.message); }

if (!fbEntries.length) { console.log("[fb-to-site] no FB entries this run — leaving listings unchanged"); process.exit(0); }

// --- merge into site listings (replace prior FB-sourced entries) ---
const listings = JSON.parse(fs.readFileSync(LST, "utf8"));
// Drop ALL prior fb-to-site-managed entries (by source marker or flag) so rotated-out
// posts disappear; the original portal "Facebook Marketplace" listings are preserved.
const isManaged = (l) => l.fbRefresh === true || /^Facebook Group —/.test(l.source_site || "") || l.source_site === "Facebook Marketplace (location unsure)";
const finalById = {};
// Keep portal listings + any pinned (hand-curated) entries; pinned never gets wiped.
listings.filter((l) => l.pinned || !isManaged(l)).forEach((l) => { finalById[l.id] = l; });
// Fresh FB entries win, except where a pinned curated version exists for that id.
fbEntries.forEach((e) => { if (!(finalById[e.id] && finalById[e.id].pinned)) finalById[e.id] = e; });
const merged = Object.values(finalById).sort((a, b) => b.score - a.score);
fs.writeFileSync(LST, JSON.stringify(merged, null, 1));
console.log(`[fb-to-site] merged ${fbEntries.length} FB entries; total ${merged.length}`);
