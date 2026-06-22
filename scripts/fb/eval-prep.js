// Filter scraped posts down to plausible rental LISTINGS and dump full text
// for evaluation. Excludes moving/cleaning-service spam and "interested" comments.
const fs = require("fs");
const path = require("path");
const data = require("./out.json");

const RENT = /(ให้เช่า|ปล่อยเช่า|for rent|ค่าเช่า|เช่า\s|\/เดือน|บาท\/|thb|บาท)/i;
const SPAM = /(ขนย้าย|ขนส่ง|รับย้าย|ทำความสะอาด|บิ๊กคลีน|big clean|ย้ายหอ|ย้ายบ้าน|ย้ายคอนโด|เจษฎาขนส่ง|รถขนย้าย)/i;
const BEDS = /(\d)\s*(ห้องนอน|นอน|bed|br|bedroom)/i;
const PRICE = /([\d][\d,\.]{2,})\s*(บาท|thb|\/เดือน|k\b)/i;

let all = [];
for (const [id, g] of Object.entries(data)) {
  (g.posts || []).forEach((p) => all.push({ ...p, group: g.label, gid: id }));
}

// candidate = mentions rent, not moving/cleaning spam, and long enough to be a listing
const cands = all.filter((p) => RENT.test(p.text) && !SPAM.test(p.text) && p.text.length > 80);

// crude 2BR signal for prioritization
function beds(t) { const m = t.match(BEDS); return m ? +m[1] : null; }

const out = cands.map((p) => ({ ...p, beds: beds(p.text) }));
// sort: 2-3BR first, then by feed order (recency)
out.sort((a, b) => {
  const aw = a.beds >= 2 && a.beds <= 4 ? 0 : 1;
  const bw = b.beds >= 2 && b.beds <= 4 ? 0 : 1;
  if (aw !== bw) return aw - bw;
  return a.order - b.order;
});

let lines = [`CANDIDATE LISTINGS: ${out.length} (from ${all.length} total posts)\n`];
out.forEach((p, i) => {
  lines.push(`\n===== [${i + 1}] ${p.group} | beds-hint:${p.beds || "?"} | feed#${p.order} | imgs:${p.images.length} =====`);
  lines.push(`URL: ${p.url || "(no permalink captured)"}`);
  lines.push(p.text.trim());
});
fs.writeFileSync(path.join(__dirname, "eval.txt"), lines.join("\n"));
console.log(`candidates: ${out.length} / ${all.length} total -> eval.txt`);
console.log(`with 2-4BR hint: ${out.filter((p) => p.beds >= 2 && p.beds <= 4).length}`);
