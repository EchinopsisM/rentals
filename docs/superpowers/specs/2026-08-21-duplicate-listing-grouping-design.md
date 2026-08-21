# Duplicate listing grouping — design

## Problem

The same physical unit is frequently posted to multiple sources (FB Marketplace, FazWaz, Hipflat, etc.) by the same or different agents, appearing as separate cards on the index and diluting the ranked list. There's no cross-source duplicate detection today — `bot/sources/pipeline.js`'s existing dedup only catches exact same-source-id or same-URL repeats.

## Goal

Detect likely same-unit duplicates across sources, collapse them into one card on the index, and let a group's listing page show all members with a per-card "Not a duplicate" button that pulls a listing back out into its own card, client-side, without a rebuild.

## Matching pipeline

New script `bot/group-duplicates.js`, run as the last step of `bot/sources/pipeline.js` (after normalize/dedup/score, right before `feed.json` is finalized), and independently runnable for tuning.

Cascading match, cheapest signal first:

1. **Cheap filter** — candidate pairs must share: same `beds`, price within ±5%, and same `zone` (or, if lat/lon become available later, proximity within a small radius). This keeps the pairwise comparison space small instead of O(n²) over all 220+ listings.
2. **Confirm** — a candidate pair is grouped if *either*:
   - **Image hash**: perceptual hash (`phash`, via a small pure-JS implementation or lightweight dep) of each listing's first 1–2 images; Hamming distance below a threshold (tune empirically, start ~10/64).
   - **Text similarity**: normalized 5-gram shingle Jaccard overlap of `description` (lowercase, strip whitespace/digit noise) above a threshold (start ~0.5). Catches agents who cross-post identical text with different/re-cropped photos, and vice versa.

Grouping is transitive: if A matches B and B matches C, all three land in one group (union-find over confirmed pairs).

## Data model

Each listing in `feed.json` gets two new optional fields:
- `groupId`: stable string, derived by hashing the sorted list of member listing IDs (so re-running with unchanged membership doesn't reshuffle IDs).
- `groupSize`: member count (omitted/1 for ungrouped listings).

No separate `groups.json` — Eleventy derives groups by filtering `feed.json` on `groupId` at build time.

## Site behavior

Client-side only, following the existing `cmr_fav`/`cmr_taken` localStorage pattern in `src/index.njk` — no backend/API.

- **Index (`src/index.njk`)**: listings sharing a `groupId` collapse to one card — the highest-scoring member — showing a "+N similar listings" badge. Its link goes to `/duplicates/{groupId}/` instead of `/listings/{slug}/`.
- **New page `src/duplicates/group.njk`**: paginated over distinct `groupId`s (Eleventy pagination over a computed groups list, same pattern as `src/listings/listing.njk`'s pagination over `listings`). Renders the existing `.card` markup for every member, plus a **"Not a duplicate"** button per card.
- **"Not a duplicate"** button: adds the listing's ID to a new localStorage set `cmr_notdup`. Both the index and the group page filter group membership through this set at render/refresh time — an excluded listing immediately reappears as its own standalone card (using its existing `/listings/{slug}/` link), no rebuild needed. This mirrors how `taken`/`fav` are applied client-side today.

This mark is per-browser, same as existing fav/taken marks — acceptable since that's the established pattern on this site.

## Testing plan

1. Run `group-duplicates.js` against current `feed.json`, inspect a sample of formed groups by hand for false positives/negatives, tune thresholds.
2. Run `pipeline.js` end-to-end and confirm `feed.json` gets `groupId`/`groupSize` written correctly.
3. Build the site (`npx @11ty/eleventy`), verify: index collapses grouped cards correctly, group page renders all members, "Not a duplicate" button removes a card from the group live in the browser and it appears as a normal standalone card.
4. Push live once verified.

## Out of scope

- Server-side/shared "not duplicate" state (stays per-browser, consistent with existing marks).
- Text-similarity matching *within* a single listing's own description (this spec is only about cross-listing duplicate detection).
- Geo-distance matching (no lat/lon in the current data model) — zone-based proximity is the fallback.
