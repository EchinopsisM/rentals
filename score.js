// Target-quality scoring for the Chiang Mai rental listings.
//
// Each listing gets a 0–100 score built from four weighted sub-scores, each
// normalised to 0–1 (1 = best). Move-in date is weighted most strongly, per
// the brief.
//
//   factor      weight   why
//   ----------------------------------------------------------------------
//   move-in       40     earliest move-in wins — weighted strongest
//   location      25     closeness to the CMU/Suthep target zone
//   recency       20     more recently posted = more likely still available
//   price         15     cheaper = better target
//
// Run directly to (re)score every listing, persist the result back into
// src/_data/listings.json, and print a ranked leaderboard:
//
//   node score.js
//
// Require it as a module to reuse scoreListing() elsewhere (e.g. the build).

const fs = require("fs");
const path = require("path");

const LISTINGS = path.join(__dirname, "src", "_data", "listings.json");

// "Today" for the purposes of recency/move-in horizons. Override with the
// SCORE_TODAY env var (YYYY-MM-DD) if you re-run on a different day.
const TODAY = process.env.SCORE_TODAY
  ? new Date(process.env.SCORE_TODAY + "T00:00:00Z")
  : new Date();

const WEIGHTS = { moveIn: 40, location: 25, recency: 20, price: 15 };

// --- Location: zone -> 0–1 closeness score -----------------------------------
// Ranks come from .eleventy.js; the qualitative gaps between zones are not
// uniform, so we map each zone to an explicit score rather than scaling rank.
const ZONE_SCORE = {
  "target": 1.0, // CMU / Ang Kaew / Wat Umong / Suthep core
  "target-edge": 0.8, // Suthep edge, Canal Rd foothills
  "fallback": 0.55, // Nimman / Huay Kaew / Santitham — close enough
  "backup": 0.35, // wider city, still commutable
  "out": 0.1, // out of the desired area
  "reject-type": 0.0,
  "other": 0.0
};

// --- Recency: "Listed N days ago" -> days, then linear decay -----------------
const RECENCY_HORIZON_DAYS = 21; // 3-week window from the original brief

function daysSinceListed(text) {
  if (!text) return null;
  const s = String(text).toLowerCase();
  if (/hour|minute|just now|moments|today/.test(s)) return 0;
  if (/yesterday|a day ago/.test(s)) return 1;
  let m;
  if ((m = s.match(/(\d+)\s*day/))) return +m[1];
  if ((m = s.match(/(\d+)\s*week/))) return +m[1] * 7;
  if ((m = s.match(/(\d+)\s*month/))) return +m[1] * 30;
  // "over a week ago" / "a week ago" — no exact figure; assume ~10 days.
  if (/over a week|a week ago|last week/.test(s)) return 10;
  return null;
}

function recencyScore(text) {
  const d = daysSinceListed(text);
  if (d == null) return 0.3; // unknown posting age: mild penalty
  return clamp01(1 - d / RECENCY_HORIZON_DAYS);
}

// --- Move-in: "Ready now" or a date -> days from today, then linear decay ----
const MOVEIN_HORIZON_DAYS = 30; // ready-now = best; +30d out = worst

function daysUntilMoveIn(text) {
  if (!text) return null;
  const s = String(text).toLowerCase().trim();
  if (/ready now|available now|move in now|immediate|asap|^now$|right now/.test(s)) return 0;
  const t = Date.parse(text);
  if (!isNaN(t)) return Math.round((t - TODAY.getTime()) / 86400000);
  return null;
}

function moveInScore(text) {
  const d = daysUntilMoveIn(text);
  if (d == null) return 0.4; // unknown move-in: middling
  if (d <= 0) return 1; // ready now or already past = best
  return clamp01(1 - d / MOVEIN_HORIZON_DAYS);
}

// --- Price: lower is better, linear across the search band -------------------
const PRICE_FLOOR = 10000; // at/below this = best
const PRICE_CAP = 20000; // at/above this = worst

function priceScore(priceNum) {
  if (!priceNum || isNaN(priceNum)) return 0.3;
  return clamp01((PRICE_CAP - priceNum) / (PRICE_CAP - PRICE_FLOOR));
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// --- Combine -----------------------------------------------------------------
function scoreListing(l) {
  const sub = {
    moveIn: moveInScore(l.move_in_date),
    location: ZONE_SCORE[l.zone] ?? 0,
    recency: recencyScore(l.listed),
    price: priceScore(l.priceNum)
  };
  const total =
    sub.moveIn * WEIGHTS.moveIn +
    sub.location * WEIGHTS.location +
    sub.recency * WEIGHTS.recency +
    sub.price * WEIGHTS.price;

  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    score: Math.round(total * 10) / 10, // 0–100, one decimal
    breakdown: {
      moveIn: { sub: round2(sub.moveIn), points: round2(sub.moveIn * WEIGHTS.moveIn) },
      location: { sub: round2(sub.location), points: round2(sub.location * WEIGHTS.location) },
      recency: { sub: round2(sub.recency), points: round2(sub.recency * WEIGHTS.recency) },
      price: { sub: round2(sub.price), points: round2(sub.price * WEIGHTS.price) }
    }
  };
}

module.exports = { scoreListing, WEIGHTS };

// --- CLI: score all, persist, print leaderboard ------------------------------
if (require.main === module) {
  const listings = JSON.parse(fs.readFileSync(LISTINGS, "utf8"));

  for (const l of listings) {
    const { score, breakdown } = scoreListing(l);
    l.score = score;
    l.scoreBreakdown = breakdown;
  }

  const ranked = [...listings].sort((a, b) => b.score - a.score);

  fs.writeFileSync(LISTINGS, JSON.stringify(listings, null, 2));

  const today = TODAY.toISOString().slice(0, 10);
  console.log(`Scored ${listings.length} listings  (today=${today})`);
  console.log(`weights: move-in ${WEIGHTS.moveIn} · location ${WEIGHTS.location} · recency ${WEIGHTS.recency} · price ${WEIGHTS.price}\n`);
  console.log("  #  score | mv  loc rec pr | zone        price   listed                  title");
  console.log("  ".padEnd(95, "-"));
  ranked.forEach((l, i) => {
    const b = l.scoreBreakdown;
    const row = [
      String(i + 1).padStart(3),
      String(l.score).padStart(5),
      "|",
      String(b.moveIn.points).padStart(3),
      String(b.location.points).padStart(3),
      String(b.recency.points).padStart(3),
      String(b.price.points).padStart(3),
      "|",
      (l.zone || "?").padEnd(11),
      String(l.priceNum).padStart(6),
      (l.listed || "?").padEnd(22),
      (l.area || l.title || "").slice(0, 32)
    ];
    console.log("  " + row.join(" "));
  });
}
