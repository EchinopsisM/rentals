// The `listings` collection the whole site renders from = the daemon-managed
// feed (feed.json, rewritten every scrape cycle) merged with hand-curated pinned
// entries (pinned.json, which the daemon NEVER touches). Keeping curated data in a
// separate file means scraper cycles can't clobber it (the old race that ate edits).
// Pinned entries win on id collision; everything is sorted by score.
const fs = require("fs");
const path = require("path");

function load(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf8")); }
  catch (e) { return []; }
}

module.exports = () => {
  const feed = load("feed.json");
  const pinned = load("pinned.json").map((p) => ({ ...p, pinned: true }));
  const byId = {};
  feed.forEach((l) => { byId[l.id] = l; });
  pinned.forEach((p) => { byId[p.id] = p; }); // curated wins
  return Object.values(byId).sort((a, b) => (b.score || 0) - (a.score || 0));
};
