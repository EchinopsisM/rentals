// Shared adapter helpers.

// Normalise various "posted" formats to the relative-English form that
// score.js's recency parser understands ("Listed N days ago"). Handles:
//   - Thai relative:  "สร้างเมื่อ 11 ชั่วโมงที่แล้ว", "3 วันที่แล้ว", "2 สัปดาห์"
//   - absolute dates:  "27 May 26", "27 May 2026", "2026-05-27"
//   - English relative passes through unchanged.
const TH_MONTHS = { "ม.ค.": 0, "ก.พ.": 1, "มี.ค.": 2, "เม.ย.": 3, "พ.ค.": 4, "มิ.ย.": 5, "ก.ค.": 6, "ส.ค.": 7, "ก.ย.": 8, "ต.ค.": 9, "พ.ย.": 10, "ธ.ค.": 11 };

function toListed(text, now = new Date()) {
  if (!text) return null;
  const s = String(text).trim();

  // already English-relative
  if (/listed|ago|yesterday|today|hour|minute/i.test(s) && !/ที่แล้ว|ชั่วโมง|วันนี้/.test(s)) return s;

  // Thai relative ("X หน่วย ที่แล้ว" or "เมื่อสักครู่"/"วันนี้")
  if (/เมื่อสักครู่|just now|วันนี้/.test(s)) return "Listed today";
  if (/เมื่อวาน/.test(s)) return "Listed 1 day ago";
  let m = s.match(/(\d+)\s*(นาที|ชั่วโมง|วัน|สัปดาห์|เดือน|ปี)/);
  if (m) {
    const n = +m[1];
    const unit = m[2];
    if (unit === "นาที" || unit === "ชั่วโมง") return "Listed today";
    if (unit === "วัน") return `Listed ${n} days ago`;
    if (unit === "สัปดาห์") return `Listed ${n * 7} days ago`;
    if (unit === "เดือน") return `Listed ${n * 30} days ago`;
    if (unit === "ปี") return `Listed ${n * 365} days ago`;
  }

  // absolute date -> days ago
  const days = absoluteToDaysAgo(s, now);
  if (days != null) return days <= 0 ? "Listed today" : `Listed ${days} days ago`;
  return s;
}

function absoluteToDaysAgo(s, now) {
  let d = null;
  // ISO
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) d = new Date(+m[1], +m[2] - 1, +m[3]);
  // DD/MM/YYYY
  if (!d) { m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) d = new Date(+m[3], +m[2] - 1, +m[1]); }
  // "27 May 26" / "27 May 2026"
  if (!d) {
    m = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?\s+(\d{2,4})/);
    if (m) {
      const mon = new Date(Date.parse(m[2] + " 1, 2000")).getMonth();
      if (!isNaN(mon)) {
        let y = +m[3];
        if (y < 100) y += 2000;
        d = new Date(y, mon, +m[1]);
      }
    }
  }
  if (!d || isNaN(d.getTime())) return null;
  return Math.round((now.getTime() - d.getTime()) / 86400000);
}

// Collect a listing's OWN photos from the current page, excluding small
// "similar listings" thumbnails (served at low resolution) by requiring a
// large source/rendered width. Returns absolute image URLs, og:image first.
// `cdn` is a RegExp the image URL must match (the site's image host).
async function collectImages(page, cdn) {
  return await page.evaluate((cdnSrc) => {
    const re = new RegExp(cdnSrc, "i");
    const og = (document.querySelector('meta[property="og:image"]') || {}).content;
    const out = [];
    const seen = new Set();
    const push = (u) => { if (u && re.test(u) && !seen.has(u)) { seen.add(u); out.push(u); } };
    if (og && re.test(og)) push(og);
    for (const i of document.querySelectorAll("img")) {
      const w = Math.max(i.naturalWidth || 0, i.getBoundingClientRect().width || 0);
      if (w > 450) push(i.currentSrc || i.src);
    }
    return out;
  }, cdn.source || cdn);
}

module.exports = { toListed, collectImages };
