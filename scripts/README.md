# Scraper scripts

All the scrapers that feed this site. Two families: **portal scrapers** (`sources/`)
and **Facebook scrapers** (`fb/`). Nothing here contains credentials — the Facebook
scripts reuse a persistent Chromium profile you log into once (the profile dir lives
outside the repo and is never committed).

## fb/ — Facebook groups + Marketplace

Runs a real Chromium with a saved login profile (WSLg-friendly, no CDP bridge).
FB obfuscates rendered DOM text, so the group scraper captures the page's own
**GraphQL JSON** (clean, unobfuscated) instead of scraping the DOM.

| Script | What it does |
|--------|--------------|
| `fb-login.js` | One-time: opens a headed Chromium, you log into Facebook, session saved to `./profile`. |
| `fb-mygroups.js` | Lists every group you're a member of (`my-groups.json`). |
| `fb-scrape.js` | Scrapes recent posts from the configured rental groups via GraphQL capture → `out.json`. |
| `mp-scrape.js` | Marketplace search per query (≤20k, newest-first) → `mp.json`. |
| `mp-detail.js` / `mp-coords.js` / `mp-shots.js` | Attempt to resolve Marketplace item location (FB hides the precise pin — see notes). |
| `eval-prep.js` / `mp-prep.js` / `target-filter.js` | Filter scraped posts to 2BR+ ≤20k rentals; `target-filter.js` restricts to the Zoo→Wat Umong band. |
| `parse-gql.js` / `probe-gql.js` / `fb-debug.js` / `dump.js` | Dev/debug helpers for the GraphQL parsing. |

Usage:
```
cd fb
node fb-login.js          # once
node fb-scrape.js 10       # 10 scroll passes/group
node mp-scrape.js          # marketplace
node target-filter.js      # band-restricted shortlist -> target.txt
```

## sources/ — property portals

Pluggable adapter pipeline (BaanFinder, BahtSold, LivingInsider, PropertyHub,
Hipflat, Thailand-Property, Craigslist). `pipeline.js` does filter → dedup →
zone-classify → image dedup → score; `merge.js` folds results into the site data.

## daemon (root)

`cron-scrape.js` runs one refresh cycle (scrape → rebuild 11ty → commit → trigger
Netlify); `daemon.js` runs it every 5 min. Set the Netlify build hook via
`NETLIFY_HOOK` env var (redacted from this copy).
