// Global site data. `updated` is stamped at build time (Asia/Bangkok), so every
// rebuild — local, daemon cycle, or Netlify deploy — shows the true last-built date.
const updated = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric",
}).format(new Date());

module.exports = {
  title: "Chiang Mai Rentals — CMU / Suthep Shortlist",
  tagline: "2-room rentals near CMU, Suthep, Canal Road & Doi Suthep foothills · ≤ ฿20k · from Facebook groups & Marketplace, BaanFinder, BahtSold, LivingInsider, PropertyHub & Hipflat",
  updated,
};
