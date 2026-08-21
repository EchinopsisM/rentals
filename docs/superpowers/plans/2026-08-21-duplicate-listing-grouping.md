# Duplicate Listing Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect likely same-unit duplicate listings across sources, collapse them into one card on the index with a link to a group page, and let visitors kick a mismarked listing out of a group client-side.

**Architecture:** A new `bot/group-duplicates.js` script (run as the final step of `bot/sources/pipeline.js`) does cascading matching — cheap price/beds/zone filter, then confirm via description text-shingle similarity OR perceptual image-hash distance — and writes `groupId`/`groupSize` onto matched listings in `feed.json` using union-find for transitive grouping. The Eleventy site reads those fields to collapse grouped cards on the index and render a per-group page; a `localStorage`-backed "Not a duplicate" mark (same pattern as the existing fav/taken marks) removes a listing from its group without a rebuild.

**Tech Stack:** Node.js (bot side, no framework — matches existing `bot/sources/*` style), `jimp` (pure-JS image library, for perceptual hashing), Eleventy/Nunjucks + vanilla JS (site side, matches existing `src/index.njk` style).

**Spec:** `docs/superpowers/specs/2026-08-21-duplicate-listing-grouping-design.md`

## Global Constraints

- No separate `groups.json` on the bot side — `groupId`/`groupSize` are written directly onto listing records in `feed.json` (per spec's Data model section).
- "Not a duplicate" state is per-browser `localStorage`, not server-side (per spec's Site behavior + Out of scope sections) — this matches the existing `cmr_fav`/`cmr_taken` pattern in `src/index.njk`.
- Text-similarity threshold starts at `0.5` (Jaccard over 5-word shingles), image-hash distance threshold starts at `0.15` (Jimp's normalized 0–1 distance) — both are tunable constants in `bot/group-duplicates.js`, tuned empirically in Task 4/8.
- This codebase has no test runner installed anywhere (bot or site) — tests are plain Node scripts using `assert`, run directly with `node`, matching the existing `bot/` convention of small standalone scripts. Do not introduce Jest/Mocha/etc.

---

## Task 1: Add `jimp` dependency to the bot

**Files:**
- Create: `bot/package.json`

**Interfaces:**
- Produces: an installed `jimp` package importable from any file under `bot/`.

- [ ] **Step 1: Create `bot/package.json`**

```json
{
  "name": "chiangmai-rentals-bot",
  "private": true,
  "version": "1.0.0",
  "dependencies": {
    "jimp": "^1.6.1"
  }
}
```

- [ ] **Step 2: Install**

Run: `cd /home/noah/bot && npm install`
Expected: `node_modules/jimp` exists, no errors.

- [ ] **Step 3: Verify it loads**

Run: `cd /home/noah/bot && node -e "require('jimp'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
cd /home/noah/bot
git add package.json package-lock.json
git commit -m "Add jimp dependency for perceptual image hashing"
```

---

## Task 2: Cheap-filter and text-similarity matching (`bot/lib/dedupe-match.js`)

**Files:**
- Create: `bot/lib/dedupe-match.js`
- Test: `bot/lib/dedupe-match.test.js`

**Interfaces:**
- Consumes: nothing (pure functions, no dependencies on other tasks).
- Produces:
  - `normalizeText(s: string) -> string`
  - `shingles(s: string, n?: number) -> Set<string>`
  - `textSimilarity(a: string, b: string) -> number` (0..1 Jaccard overlap)
  - `cheapMatch(a: {beds, zone, priceNum}, b: {beds, zone, priceNum}) -> boolean`
  - All exported from `module.exports = { normalizeText, shingles, textSimilarity, cheapMatch }` — Task 4 imports these exact names.

- [ ] **Step 1: Write the failing test**

Create `bot/lib/dedupe-match.test.js`:

```js
const assert = require("assert");
const { normalizeText, shingles, textSimilarity, cheapMatch } = require("./dedupe-match");

// normalizeText
assert.strictEqual(normalizeText("  Cozy 2BR Condo!!  Near CMU 123  "), "cozy br condo near cmu");

// shingles (5-word default)
const s = shingles("the quick brown fox jumps over the lazy dog");
assert.ok(s.has("the quick brown fox jumps"));
assert.ok(s.has("jumps over the lazy dog"));
assert.strictEqual(s.size, 5); // 9 words -> 5 five-word windows

// textSimilarity: identical text -> 1
assert.strictEqual(textSimilarity("a cozy two bedroom condo near CMU", "a cozy two bedroom condo near CMU"), 1);
// textSimilarity: wildly different text -> 0
assert.strictEqual(textSimilarity("a cozy two bedroom condo near CMU", "spicy tom yum soup recipe tonight"), 0);
// textSimilarity: empty text -> 0
assert.strictEqual(textSimilarity("", "a cozy two bedroom condo near CMU"), 0);

// cheapMatch: same beds/zone, price within 5% -> true
assert.strictEqual(
  cheapMatch({ beds: 2, zone: "target", priceNum: 12000 }, { beds: 2, zone: "target", priceNum: 12500 }),
  true
);
// cheapMatch: different beds -> false
assert.strictEqual(
  cheapMatch({ beds: 2, zone: "target", priceNum: 12000 }, { beds: 3, zone: "target", priceNum: 12000 }),
  false
);
// cheapMatch: price too far apart -> false
assert.strictEqual(
  cheapMatch({ beds: 2, zone: "target", priceNum: 10000 }, { beds: 2, zone: "target", priceNum: 12000 }),
  false
);
// cheapMatch: missing priceNum -> false
assert.strictEqual(
  cheapMatch({ beds: 2, zone: "target", priceNum: null }, { beds: 2, zone: "target", priceNum: 12000 }),
  false
);

console.log("dedupe-match.test.js: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/noah/bot && node lib/dedupe-match.test.js`
Expected: `Error: Cannot find module './dedupe-match'`

- [ ] **Step 3: Write the implementation**

Create `bot/lib/dedupe-match.js`:

```js
// Pure text/price matching helpers for cross-source duplicate detection.
// No I/O, no dependencies — see bot/group-duplicates.js for the caller.

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\d]+/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(s, n = 5) {
  const words = normalizeText(s).split(" ").filter(Boolean);
  if (!words.length) return new Set();
  if (words.length < n) return new Set([words.join(" ")]);
  const out = new Set();
  for (let i = 0; i <= words.length - n; i++) out.add(words.slice(i, i + n).join(" "));
  return out;
}

function textSimilarity(a, b) {
  const sa = shingles(a);
  const sb = shingles(b);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const g of sa) if (sb.has(g)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function cheapMatch(a, b) {
  if (a.beds !== b.beds) return false;
  if (a.zone !== b.zone) return false;
  if (!a.priceNum || !b.priceNum) return false;
  const diff = Math.abs(a.priceNum - b.priceNum) / Math.max(a.priceNum, b.priceNum);
  return diff <= 0.05;
}

module.exports = { normalizeText, shingles, textSimilarity, cheapMatch };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/noah/bot && node lib/dedupe-match.test.js`
Expected: prints `dedupe-match.test.js: all assertions passed`, exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/noah/bot
git add lib/dedupe-match.js lib/dedupe-match.test.js
git commit -m "Add cheap-filter and text-similarity duplicate matching helpers"
```

---

## Task 3: Perceptual image hashing (`bot/lib/image-hash.js`)

**Files:**
- Create: `bot/lib/image-hash.js`
- Test: `bot/lib/image-hash.test.js`

**Interfaces:**
- Consumes: `jimp` (Task 1).
- Produces:
  - `phash(imgPath: string) -> Promise<string>` (perceptual hash string, or throws if the file can't be read/decoded)
  - `hashDistance(h1: string, h2: string) -> number` (0..1 normalized distance, 0 = identical)
  - Exported as `module.exports = { phash, hashDistance }` — Task 4 imports these exact names.

- [ ] **Step 1: Write the failing test**

Create `bot/lib/image-hash.test.js`. It builds two synthetic images in-memory with Jimp (no dependency on real scraped photos, so the test is deterministic) and checks that identical images hash identically and very different images hash far apart:

```js
const assert = require("assert");
const os = require("os");
const path = require("path");
const { Jimp } = require("jimp");
const { phash, hashDistance } = require("./image-hash");

(async () => {
  const dir = os.tmpdir();
  const redPath = path.join(dir, "dedupe-test-red.png");
  const redPath2 = path.join(dir, "dedupe-test-red2.png");
  const bluePath = path.join(dir, "dedupe-test-blue.png");

  const red = new Jimp({ width: 64, height: 64, color: 0xff0000ff });
  await red.write(redPath);
  await red.write(redPath2); // identical content, different file
  const blue = new Jimp({ width: 64, height: 64, color: 0x0000ffff });
  await blue.write(bluePath);

  const hRed = await phash(redPath);
  const hRed2 = await phash(redPath2);
  const hBlue = await phash(bluePath);

  assert.strictEqual(typeof hRed, "string");
  assert.ok(hRed.length > 0);

  const distSame = hashDistance(hRed, hRed2);
  const distDiff = hashDistance(hRed, hBlue);
  assert.strictEqual(distSame, 0, `identical images should have distance 0, got ${distSame}`);
  assert.ok(distDiff > distSame, `different images (${distDiff}) should be farther apart than identical ones (${distSame})`);

  console.log("image-hash.test.js: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/noah/bot && node lib/image-hash.test.js`
Expected: `Error: Cannot find module './image-hash'`

- [ ] **Step 3: Write the implementation**

Create `bot/lib/image-hash.js`:

```js
// Thin wrapper around Jimp's perceptual hash for duplicate-image detection.
const { Jimp } = require("jimp");

async function phash(imgPath) {
  const img = await Jimp.read(imgPath);
  return img.hash();
}

function hashDistance(h1, h2) {
  return Jimp.distance(h1, h2);
}

module.exports = { phash, hashDistance };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/noah/bot && node lib/image-hash.test.js`
Expected: prints `image-hash.test.js: all assertions passed`, exits 0.

If `Jimp.distance`/`img.hash()` don't behave as expected (API differences between Jimp versions), adjust the implementation to match the installed `jimp` version's actual API — check `node -e "const {Jimp}=require('jimp'); console.log(Object.keys(Jimp))"` and the installed version's docs, keeping the two exported function signatures identical.

- [ ] **Step 5: Commit**

```bash
cd /home/noah/bot
git add lib/image-hash.js lib/image-hash.test.js
git commit -m "Add perceptual image hashing helper for duplicate detection"
```

---

## Task 4: Grouping engine (`bot/group-duplicates.js`)

**Files:**
- Create: `bot/group-duplicates.js`
- Test: `bot/group-duplicates.test.js`

**Interfaces:**
- Consumes: `cheapMatch, textSimilarity` from `./lib/dedupe-match` (Task 2), `phash, hashDistance` from `./lib/image-hash` (Task 3).
- Produces: `groupDuplicates(listings: Array<Listing>) -> Promise<Array<Listing>>` where each returned listing is a shallow copy of the input, with `groupId: string` and `groupSize: number` added when it's part of a group of 2+ (both fields absent on ungrouped listings). Exported as `module.exports = { groupDuplicates }`. Task 5 (pipeline.js) invokes this file as a CLI (`node group-duplicates.js`), reading and writing `chiangmai-rentals/src/_data/feed.json` in place.

- [ ] **Step 1: Write the failing test**

Create `bot/group-duplicates.test.js`. Uses fixture listings with no `images` (so image-hashing is skipped and the test only exercises text-similarity + union-find — deterministic, no real image files needed):

```js
const assert = require("assert");
const { groupDuplicates } = require("./group-duplicates");

(async () => {
  const listings = [
    { id: "a", beds: 2, zone: "target", priceNum: 12000, description: "cozy two bedroom condo near CMU with pool and gym facilities available now", images: [] },
    { id: "b", beds: 2, zone: "target", priceNum: 12200, description: "cozy two bedroom condo near CMU with pool and gym facilities available now", images: [] }, // near-identical text -> should match a
    { id: "c", beds: 2, zone: "target", priceNum: 12100, description: "cozy two bedroom condo near CMU with pool and gym facilities available today", images: [] }, // matches b closely -> transitively joins a+b's group
    { id: "d", beds: 3, zone: "target", priceNum: 12000, description: "cozy two bedroom condo near CMU with pool and gym facilities available now", images: [] }, // different beds -> never a candidate
    { id: "e", beds: 2, zone: "fallback", priceNum: 12000, description: "totally unrelated studio listing across town near the airport with parking", images: [] }, // different zone + text -> ungrouped
  ];

  const out = await groupDuplicates(listings);
  const byId = Object.fromEntries(out.map((l) => [l.id, l]));

  assert.ok(byId.a.groupId, "a should be grouped");
  assert.strictEqual(byId.a.groupId, byId.b.groupId, "a and b should share a group");
  assert.strictEqual(byId.a.groupId, byId.c.groupId, "a and c should share a group (transitively via b)");
  assert.strictEqual(byId.a.groupSize, 3);
  assert.strictEqual(byId.d.groupId, undefined, "d has different beds, must stay ungrouped");
  assert.strictEqual(byId.e.groupId, undefined, "e has different zone/text, must stay ungrouped");

  // re-running with the same input produces the same groupId (stable hash)
  const out2 = await groupDuplicates(listings);
  assert.strictEqual(out2.find((l) => l.id === "a").groupId, byId.a.groupId, "groupId must be stable across reruns");

  console.log("group-duplicates.test.js: all assertions passed");
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/noah/bot && node group-duplicates.test.js`
Expected: `Error: Cannot find module './group-duplicates'`

- [ ] **Step 3: Write the implementation**

Create `bot/group-duplicates.js`:

```js
// Cross-source duplicate detection: cheap price/beds/zone filter, then confirm
// via description text similarity OR perceptual image-hash distance. Confirmed
// pairs are merged transitively (union-find) into groups; each group gets a
// stable groupId (hash of its sorted member ids) written onto every member.
//
//   node group-duplicates.js         # reads+writes feed.json in place
//
// Also run automatically as the last step of sources/pipeline.js.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { cheapMatch, textSimilarity } = require("./lib/dedupe-match");
const { phash, hashDistance } = require("./lib/image-hash");

const SITE = "/home/noah/chiangmai-rentals";
const LST = path.join(SITE, "src/_data/feed.json");

const TEXT_SIM_THRESHOLD = 0.5;
const IMAGE_DIST_THRESHOLD = 0.15;

async function getHash(listing, cache) {
  if (cache.has(listing.id)) return cache.get(listing.id);
  const img = listing.images && listing.images[0];
  let h = null;
  if (img) {
    try { h = await phash(path.join(SITE, "src", img)); }
    catch (e) { h = null; }
  }
  cache.set(listing.id, h);
  return h;
}

async function isDuplicate(a, b, hashCache) {
  if (!cheapMatch(a, b)) return false;
  if (textSimilarity(a.description, b.description) >= TEXT_SIM_THRESHOLD) return true;
  const ha = await getHash(a, hashCache);
  const hb = await getHash(b, hashCache);
  if (!ha || !hb) return false;
  return hashDistance(ha, hb) <= IMAGE_DIST_THRESHOLD;
}

function makeUnionFind(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  return { find, union };
}

async function groupDuplicates(listings) {
  const uf = makeUnionFind(listings.length);
  const hashCache = new Map();
  for (let i = 0; i < listings.length; i++) {
    for (let j = i + 1; j < listings.length; j++) {
      if (await isDuplicate(listings[i], listings[j], hashCache)) uf.union(i, j);
    }
  }
  const groups = new Map(); // root index -> [member indices]
  for (let i = 0; i < listings.length; i++) {
    const r = uf.find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  const out = listings.map((l) => ({ ...l }));
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const ids = members.map((i) => listings[i].id).sort();
    const groupId = crypto.createHash("md5").update(ids.join("|")).digest("hex").slice(0, 12);
    members.forEach((i) => { out[i].groupId = groupId; out[i].groupSize = members.length; });
  }
  return out;
}

module.exports = { groupDuplicates };

if (require.main === module) {
  (async () => {
    const listings = JSON.parse(fs.readFileSync(LST, "utf8"));
    const grouped = await groupDuplicates(listings);
    fs.writeFileSync(LST, JSON.stringify(grouped, null, 2));
    const groupedListings = grouped.filter((l) => l.groupId);
    const nGroups = new Set(groupedListings.map((l) => l.groupId)).size;
    console.log(`group-duplicates: ${nGroups} groups formed across ${groupedListings.length} listings (of ${grouped.length} total)`);
  })();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/noah/bot && node group-duplicates.test.js`
Expected: prints `group-duplicates.test.js: all assertions passed`, exits 0.

- [ ] **Step 5: Commit**

```bash
cd /home/noah/bot
git add group-duplicates.js group-duplicates.test.js
git commit -m "Add duplicate-listing grouping engine (union-find over text/image match)"
```

---

## Task 5: Wire into the pipeline

**Files:**
- Modify: `bot/sources/pipeline.js` (the block right after the `score.js` `execFileSync` call, before the `=== summary ===` log — see the existing pattern at the end of the file)

**Interfaces:**
- Consumes: `bot/group-duplicates.js` (Task 4), invoked as a CLI subprocess exactly like the existing `score.js` call.
- Produces: nothing new for other tasks — this is a wiring-only task.

- [ ] **Step 1: Add the pipeline step**

In `bot/sources/pipeline.js`, find:

```js
  // re-score everything
  try {
    const out = execFileSync("node", [path.join(SITE, "score.js")], { encoding: "utf8" });
    log(out.split("\n").slice(0, 3).join("\n"));
  } catch (e) {
    log("score.js failed:", e.message.slice(0, 120));
  }
```

Add immediately after it:

```js
  // group cross-source duplicates (writes groupId/groupSize into feed.json)
  try {
    const out = execFileSync("node", [path.join(BOT, "group-duplicates.js")], { encoding: "utf8" });
    log(out.trim());
  } catch (e) {
    log("group-duplicates.js failed:", e.message.slice(0, 120));
  }
```

- [ ] **Step 2: Verify manually against the real feed**

Run: `cd /home/noah/bot && node group-duplicates.js`
Expected: prints a `group-duplicates: N groups formed across M listings (of 220 total)` line (count will vary), exits 0, and `git diff --stat /home/noah/chiangmai-rentals/src/_data/feed.json` shows changes (new `groupId`/`groupSize` fields).

- [ ] **Step 3: Inspect a sample group by hand for false positives**

Run:
```bash
cd /home/noah/bot && node -e "
const f = require('/home/noah/chiangmai-rentals/src/_data/feed.json');
const groups = {};
f.forEach(l => { if (l.groupId) (groups[l.groupId] = groups[l.groupId] || []).push(l); });
const sample = Object.values(groups).slice(0, 5);
sample.forEach(g => console.log(g.map(l => ({id: l.id, source: l.source_site, price: l.priceNum, area: l.area})), '\n'));
"
```
Read the output: for each group, do the member listings plausibly describe the same unit (similar price, similar area/description)? If a group looks wrong (e.g. two clearly different units grouped), tighten `TEXT_SIM_THRESHOLD` or `IMAGE_DIST_THRESHOLD` in `bot/group-duplicates.js` and re-run Step 2 until samples look right. If no groups form at all, loosen the thresholds slightly and recheck — the goal is plausible groups, not a specific count.

- [ ] **Step 4: Commit**

```bash
cd /home/noah/bot
git add sources/pipeline.js
git commit -m "Run duplicate grouping as the final pipeline step"
```

(If Step 3 required threshold changes, include the updated `group-duplicates.js` in this commit too.)

---

## Task 6: Site data — `groups` collection

**Files:**
- Create: `chiangmai-rentals/src/_data/groups.js`

**Interfaces:**
- Consumes: `chiangmai-rentals/src/_data/feed.json` and `pinned.json` directly (same files `src/_data/listings.js` reads — this mirrors that file's loader rather than importing it, since Eleventy data files must each be independently requireable).
- Produces: an Eleventy global data array `groups`, each entry `{ groupId: string, members: Array<Listing> }` (members sorted by `score` descending) — consumed by Task 7's `group.njk` pagination.

- [ ] **Step 1: Create `chiangmai-rentals/src/_data/groups.js`**

```js
// Groups listings that share a groupId (written by bot/group-duplicates.js)
// into { groupId, members[] } for the /duplicates/{groupId}/ pages.
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
  pinned.forEach((p) => { byId[p.id] = p; });

  const byGroup = {};
  Object.values(byId).forEach((l) => {
    if (!l.groupId) return;
    (byGroup[l.groupId] = byGroup[l.groupId] || []).push(l);
  });

  return Object.entries(byGroup).map(([groupId, members]) => ({
    groupId,
    members: members.sort((a, b) => (b.score || 0) - (a.score || 0)),
  }));
};
```

- [ ] **Step 2: Verify it loads under Eleventy's data resolution**

Run: `cd /home/noah/chiangmai-rentals && node -e "console.log(require('./src/_data/groups.js')().length, 'groups')"`
Expected: prints a number ≥ 0, no errors. (0 is fine here if Task 5 hasn't run against this checkout yet — re-run `node /home/noah/bot/group-duplicates.js` first if you want a non-zero sample.)

- [ ] **Step 3: Commit**

```bash
cd /home/noah/chiangmai-rentals
git add src/_data/groups.js
git commit -m "Add groups Eleventy data collection for duplicate-listing pages"
```

---

## Task 7: Group page template + index collapsing

**Files:**
- Create: `chiangmai-rentals/src/duplicates/group.njk`
- Modify: `chiangmai-rentals/src/index.njk` (card markup gets `data-group`/`data-groupsize` attributes; script gets group-collapsing logic)
- Modify: `chiangmai-rentals/src/assets/style.css` (add `.dup-badge`, `.act-notdup` rules)

**Interfaces:**
- Consumes: `groups` data (Task 6), `groupId`/`groupSize` fields on listings (Task 4/5), existing `zoneMeta` filter and `.card`/`.card-media`/`.card-body`/`.card-actions`/`.act` CSS classes (already in the codebase, see `src/index.njk`).
- Produces: `/duplicates/{groupId}/` pages; a `cmr_notdup` localStorage key read by both this page and the index.

- [ ] **Step 1: Create `chiangmai-rentals/src/duplicates/group.njk`**

```njk
---
layout: layout.njk
pagination:
  data: groups
  size: 1
  alias: g
permalink: "/duplicates/{{ g.groupId }}/"
eleventyComputed:
  title: "Possible duplicate listings ({{ g.members.length }})"
---
<p class="back"><a href="/">← all listings</a></p>
<h1>Possible duplicate listings</h1>
<p class="lede">These {{ g.members.length }} listings look like the same unit posted across sources. If one isn't actually the same, mark it "Not a duplicate" and it'll show up as its own listing on the main page.</p>

<div class="grid" id="dupgrid">
  {% for l in g.members %}
  {% set zm = l.zone | zoneMeta %}
  <article class="card" data-id="{{ l.id }}">
    <a class="card-media" href="/listings/{{ l.slug }}/">
      {% if l.images | length %}
        <img loading="lazy" src="{{ l.images[0] }}" alt="{{ l.title }}">
      {% else %}
        <span class="noimg">no photo</span>
      {% endif %}
      <span class="zbadge" style="background:{{ zm.color }}">{{ zm.label }}</span>
      <span class="score-badge" title="Target score {{ l.score }}/100">{{ l.score }}<small>/100</small></span>
    </a>
    <div class="card-body">
      <div class="card-top">
        <span class="price">฿{{ l.price }}<small>/mo</small></span>
        <span class="beds">{{ l.beds_baths or "—" }}</span>
      </div>
      <h2 class="card-area"><a href="/listings/{{ l.slug }}/">{{ l.area }}</a></h2>
      <p class="card-meta">{{ l.source_site }} · {{ l.listed }}</p>
      <div class="card-actions">
        <button type="button" class="act act-notdup" data-act="notdup">Not a duplicate</button>
      </div>
    </div>
  </article>
  {% endfor %}
</div>

<p class="empty" id="dupempty" hidden>All listings in this group have been marked "not a duplicate".</p>

<script>
  const NOTDUP_KEY = "cmr_notdup";
  const load = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch (e) { return new Set(); } };
  const save = (k, s) => localStorage.setItem(k, JSON.stringify([...s]));
  let notdup = load(NOTDUP_KEY);
  const grid = document.getElementById("dupgrid");
  const cards = [...grid.querySelectorAll(".card")];

  function applyMarks() {
    let visible = 0;
    cards.forEach((c) => {
      const hide = notdup.has(c.dataset.id);
      c.hidden = hide;
      if (!hide) visible++;
    });
    document.getElementById("dupempty").hidden = visible > 0;
  }

  grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act='notdup']");
    if (!b) return;
    e.preventDefault();
    const id = b.closest(".card").dataset.id;
    notdup.add(id);
    save(NOTDUP_KEY, notdup);
    applyMarks();
  });

  applyMarks();
</script>
```

- [ ] **Step 2: Add `data-group`/`data-groupsize` attributes to index cards**

In `chiangmai-rentals/src/index.njk`, find the `<article class="card" ...>` opening tag (around line 69-77):

```njk
  <article class="card"
    data-id="{{ l.id }}"
    data-zone="{{ l.zone }}"
    data-price="{{ l.priceNum }}"
    data-beds="{{ l.beds or 0 }}"
    data-score="{{ l.score }}"
    data-recency="{{ l.scoreBreakdown.recency.sub }}"
    data-movein="{{ l.scoreBreakdown.moveIn.sub }}"
    data-location="{{ l.scoreBreakdown.location.sub }}">
```

Add two more attributes:

```njk
  <article class="card"
    data-id="{{ l.id }}"
    data-zone="{{ l.zone }}"
    data-price="{{ l.priceNum }}"
    data-beds="{{ l.beds or 0 }}"
    data-score="{{ l.score }}"
    data-recency="{{ l.scoreBreakdown.recency.sub }}"
    data-movein="{{ l.scoreBreakdown.moveIn.sub }}"
    data-location="{{ l.scoreBreakdown.location.sub }}"
    data-group="{{ l.groupId or '' }}"
    data-groupsize="{{ l.groupSize or 1 }}">
```

- [ ] **Step 3: Add group-collapsing JS to `chiangmai-rentals/src/index.njk`**

In the same file's `<script>` block, find:

```js
  // --- favorites + taken (persisted per-browser in localStorage) ---
  const FAV_KEY = "cmr_fav", TAKEN_KEY = "cmr_taken";
  const load = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch (e) { return new Set(); } };
  const save = (k, s) => localStorage.setItem(k, JSON.stringify([...s]));
  let fav = load(FAV_KEY), taken = load(TAKEN_KEY);
```

Add a third key and the group-collapsing function right after it:

```js
  // --- favorites + taken (persisted per-browser in localStorage) ---
  const FAV_KEY = "cmr_fav", TAKEN_KEY = "cmr_taken", NOTDUP_KEY = "cmr_notdup";
  const load = (k) => { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch (e) { return new Set(); } };
  const save = (k, s) => localStorage.setItem(k, JSON.stringify([...s]));
  let fav = load(FAV_KEY), taken = load(TAKEN_KEY), notdup = load(NOTDUP_KEY);

  // --- duplicate grouping: collapse each group to its top-scoring member ---
  function applyGroups() {
    const byGroup = {};
    cards.forEach((c) => {
      delete c.dataset.groupHidden;
      const gid = c.dataset.group;
      if (!gid || notdup.has(c.dataset.id)) return;
      (byGroup[gid] = byGroup[gid] || []).push(c);
    });
    Object.values(byGroup).forEach((members) => {
      if (members.length < 2) return;
      const sorted = [...members].sort((a, b) => Number(b.dataset.score) - Number(a.dataset.score));
      const primary = sorted[0];
      sorted.slice(1).forEach((c) => { c.dataset.groupHidden = "1"; });
      const dupHref = `/duplicates/${primary.dataset.group}/`;
      const media = primary.querySelector(".card-media");
      const titleLink = primary.querySelector(".card-area a");
      if (media) media.href = dupHref;
      if (titleLink) titleLink.href = dupHref;
      let badge = primary.querySelector(".dup-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "dup-badge";
        primary.querySelector(".card-body").prepend(badge);
      }
      const extra = sorted.length - 1;
      badge.textContent = `+${extra} similar listing${extra > 1 ? "s" : ""}`;
    });
  }
```

- [ ] **Step 4: Hide grouped-away cards in `refresh()` and call `applyGroups()` once at load**

Find:

```js
  function refresh() {
    let n = 0;
    cards.forEach(c => {
      const id = c.dataset.id;
      const okZone = state.zone === "all" || c.dataset.zone === state.zone;
      const okPrice = Number(c.dataset.price) <= state.price;
      const okBeds = Number(c.dataset.beds) >= state.beds;
      const isTaken = taken.has(id);
      const show = okZone && okPrice && okBeds && (!isTaken || showTaken);
      c.hidden = !show;
      if (show && !isTaken) n++;
      markState(c);
    });
```

Change the `show` line to also respect `groupHidden`:

```js
      const show = okZone && okPrice && okBeds && (!isTaken || showTaken) && !c.dataset.groupHidden;
```

Find the final line of the script, `refresh();`, and change it to:

```js
  applyGroups();
  refresh();
```

- [ ] **Step 5: Add CSS for the new badge and button**

In `chiangmai-rentals/src/assets/style.css`, near the existing `.act-fav.on` / `.act-taken.on` rules (around line 90-92), add:

```css
.dup-badge { display: inline-block; background: #eef1fb; color: #3d4a8a; font-size: .72rem; font-weight: 600; padding: .18rem .5rem; border-radius: 6px; margin-bottom: .4rem; }
.act-notdup.on { background: #eef1fb; border-color: #3d4a8a; color: #3d4a8a; font-weight: 600; }
```

- [ ] **Step 6: Build and manually verify in the browser**

Run:
```bash
cd /home/noah/chiangmai-rentals && npx @11ty/eleventy
```
Expected: build succeeds, `_site/duplicates/<some-group-id>/index.html` exists for at least one group (check with `ls _site/duplicates/`).

Then serve and check by hand (use the `run` skill or):
```bash
npx @11ty/eleventy --serve &
curl -s http://localhost:8080/ | grep -c 'dup-badge' # sanity: badge markup shouldn't appear server-side (it's added by JS), so expect 0 here
```
Open the dev server in a browser (or via the `run`/`browser-automation` skill): confirm on the index that a grouped listing shows a "+N similar listings" badge and its card links to `/duplicates/{groupId}/`; open that page, confirm all members render, click "Not a duplicate" on one, confirm it disappears from the group page immediately; go back to the index and reload, confirm that listing now appears as its own standalone card (not collapsed).

- [ ] **Step 7: Commit**

```bash
cd /home/noah/chiangmai-rentals
git add src/duplicates/group.njk src/index.njk src/assets/style.css
git commit -m "Add duplicate-listing group page and index collapsing UI"
```

---

## Task 8: End-to-end verification and publish

**Files:** none (verification + deploy only)

**Interfaces:** none — this task exercises everything from Tasks 1-7 together.

- [ ] **Step 1: Run the full pipeline once for real**

Run (this re-scrapes; expect several minutes — use `run_in_background` if driving this from an agent):
```bash
cd /home/noah/bot && node sources/pipeline.js all
```
Expected: pipeline completes, log output includes a `group-duplicates: N groups formed across M listings` line with `N > 0` (if it's 0 across 220+ listings, thresholds are likely too strict — revisit Task 4's constants).

- [ ] **Step 2: Rebuild the site**

Run:
```bash
cd /home/noah/chiangmai-rentals && npx @11ty/eleventy
```
Expected: build succeeds with no errors.

- [ ] **Step 3: Spot-check in the browser**

Confirm the dev server (or a fresh `npx @11ty/eleventy --serve`) shows: the index has fewer visible cards than total listings (some collapsed into groups), at least one "+N similar listings" badge is visible, clicking into a group page shows the member cards, and "Not a duplicate" works as in Task 7 Step 6.

- [ ] **Step 4: Commit and push**

```bash
cd /home/noah/chiangmai-rentals
git add -A
git commit -m "Publish duplicate-listing grouping feature"
nohup git push > /tmp/push-dup-feature.log 2>&1 &
```
Then poll: `sleep 15 && cat /tmp/push-dup-feature.log && git log origin/main..HEAD --oneline`
Expected: log shows `<hash>..<hash> main -> main`, and the second command's output is empty (nothing left unpushed).

---

## Self-Review Notes

- **Spec coverage:** cascading match (Task 2+3+4), pipeline wiring (Task 5), data model `groupId`/`groupSize` (Task 4), index collapsing + group page + "Not a duplicate" (Task 7), testing plan (Tasks 4 Step 3, 7 Step 6, 8) — all spec sections have a task.
- **Placeholder scan:** none found; every step has runnable code or an exact command.
- **Type/name consistency checked:** `groupDuplicates` (Task 4) used identically in its own CLI block and nowhere else directly (Task 5 shells out to the file, not the function) — consistent. `cheapMatch`/`textSimilarity` (Task 2) and `phash`/`hashDistance` (Task 3) import names match their `module.exports` exactly in Task 4. `groupId`/`groupSize` field names match across Task 4 (writer), Task 6 (reader), Task 7 (reader, `data-group`/`data-groupsize` attributes). `cmr_notdup` localStorage key name matches across Task 7's `group.njk` and `index.njk` changes.
