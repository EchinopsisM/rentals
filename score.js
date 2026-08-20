// Target-quality scoring for the Chiang Mai 2BR condo search.
//
// Each listing gets a 0–100 score built from five weighted sub-scores, each
// normalised to 0–1 (1 = best).
//
//   factor      weight   why
//   ----------------------------------------------------------------------
//   location      30     target zone (CMU/Suthep) has hiking + downtown access
//   price         25     10k–24k/mo budget match
//   recency       25     PRIORITIZED: recently posted = more likely available
//   move-in       15     availability (ready now is best)
//   pet-friendly   5     minor bonus if pets allowed (user preference)
//
// Run directly to (re)score every listing, persist the result back into
// src/_data/listings.json, and print a ranked leaderboard:
//
//   node score.js
//
// Require it as a module to reuse scoreListing() elsewhere (e.g. the build).

const fs = require("fs");
const path = require("path");

// feed.json is the file the site actually renders from (see src/_data/listings.js,
// which merges feed.json + pinned.json into the `listings` collection). Score
// that file directly — a separate listings.json here would silently drift out
// of sync with what's displayed.
const LISTINGS = path.join(__dirname, "src", "_data", "feed.json");

// "Today" for the purposes of recency/move-in horizons. Override with the
// SCORE_TODAY env var (YYYY-MM-DD) if you re-run on a different day.
const TODAY = process.env.SCORE_TODAY
  ? new Date(process.env.SCORE_TODAY + "T00:00:00Z")
  : new Date();

// Zone coordinates for geographic scoring (lat, lon)
const ZONE_COORDS = {
  "target": [18.8092, 98.9453], // Doi Suthep / CMU core
  "target-edge": [18.8050, 98.9500], // Suthep edge
  "fallback": [18.8800, 98.9500], // Nimman / Huay Kaew
  "backup": [18.7900, 98.9900], // Old City / Tha Phae center
};
const DOWNTOWN_COORDS = [18.7883, 98.9853]; // Tha Phae area (downtown)
const TRAIL_COORDS = [18.8092, 98.9453]; // Doi Suthep (hiking base)

const WEIGHTS = { location: 30, price: 25, recency: 25, moveIn: 15, petFriendly: 5 };

// --- Location: zone -> 0–1 closeness score -----------------------------------
// Balances proximity to hiking trails (Suthep core) with downtown access (Tha Phae).
// "Out" zone includes nearby suburbs: Hang Dong, San Sai, Mae Rim, Saraphi,
// San Kamphaeng, Doi Saket, plus the next ring bordering those (San Pa Tong,
// Doi Lo, Mae Wang, Samoeng, Mae Taeng, Phrao, Mae On) — scored low but included.
const ZONE_SCORE = {
  "target": 1.0, // CMU / Suthep core — prime hiking + reasonable downtown
  "target-edge": 0.85, // Suthep edge — excellent trails
  "fallback": 0.75, // Nimman / Huay Kaew — closer to downtown, trail access
  "backup": 0.45, // Old City / Tha Phae — downtown but far from trails
  "out": 0.25, // adjacent areas: Hang Dong, San Sai, Mae Rim, Saraphi, San Kamphaeng
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
  if ((m = s.match(/(\d+)\s*year/))) return +m[1] * 365;
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

// --- Price: within budget is best, linear across the search band ---------------
const PRICE_FLOOR = 5000; // user's target minimum (best score, expanded from 10k)
const PRICE_CAP = 24000; // user's target maximum (worst score)

function priceScore(priceNum) {
  if (!priceNum || isNaN(priceNum)) return 0.3;
  return clamp01((PRICE_CAP - priceNum) / (PRICE_CAP - PRICE_FLOOR));
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// --- Pet-friendly: bonus if listing allows pets -------------------------------
function petFriendlyScore(petFriendly) {
  return petFriendly ? 1.0 : 0.0; // full bonus if confirmed pet-friendly, none otherwise
}

// --- Combine -----------------------------------------------------------------
function scoreListing(l) {
  const sub = {
    location: ZONE_SCORE[l.zone] ?? 0,
    price: priceScore(l.priceNum),
    recency: recencyScore(l.listed),
    moveIn: moveInScore(l.move_in_date),
    petFriendly: petFriendlyScore(l.petFriendly)
  };
  const total =
    sub.location * WEIGHTS.location +
    sub.price * WEIGHTS.price +
    sub.recency * WEIGHTS.recency +
    sub.moveIn * WEIGHTS.moveIn +
    sub.petFriendly * WEIGHTS.petFriendly;

  const round2 = (x) => Math.round(x * 100) / 100;
  return {
    score: Math.round(total * 10) / 10, // 0–100, one decimal
    breakdown: {
      location: { sub: round2(sub.location), points: round2(sub.location * WEIGHTS.location) },
      price: { sub: round2(sub.price), points: round2(sub.price * WEIGHTS.price) },
      recency: { sub: round2(sub.recency), points: round2(sub.recency * WEIGHTS.recency) },
      moveIn: { sub: round2(sub.moveIn), points: round2(sub.moveIn * WEIGHTS.moveIn) },
      petFriendly: { sub: round2(sub.petFriendly), points: round2(sub.petFriendly * WEIGHTS.petFriendly) }
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
  console.log(`weights: location ${WEIGHTS.location} · price ${WEIGHTS.price} · recency ${WEIGHTS.recency} · move-in ${WEIGHTS.moveIn} · pets ${WEIGHTS.petFriendly}\n`);
  console.log("  #  score | loc  pr rec  mv pet | zone        price   pets  area");
  console.log("  ".padEnd(95, "-"));
  ranked.forEach((l, i) => {
    const b = l.scoreBreakdown;
    const petFlag = l.petFriendly ? "✓" : "·";
    const row = [
      String(i + 1).padStart(3),
      String(l.score).padStart(5),
      "|",
      String(b.location.points).padStart(4),
      String(b.price.points).padStart(3),
      String(b.recency.points).padStart(4),
      String(b.moveIn.points).padStart(3),
      String(b.petFriendly.points).padStart(3),
      "|",
      (l.zone || "?").padEnd(11),
      String(l.priceNum).padStart(6),
      petFlag.padStart(4),
      (l.area || l.title || "").slice(0, 26)
    ];
    console.log("  " + row.join(" "));
  });
}
