# Chiang Mai Rentals — CMU / Suthep Shortlist

A static [Eleventy](https://www.11ty.dev/) site presenting a shortlist of Chiang Mai rental listings
near CMU / Suthep / Canal Road / Doi Suthep foothills (≤ ฿20k, 2+ rooms), scraped from Facebook
Marketplace on 2026-06-20.

## Local preview

```bash
npm install
npm start        # serves at http://localhost:8080 with live reload
```

Build only:

```bash
npm run build    # outputs static site to _site/
```

## Deploy to Netlify

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import from Git**, pick the repo.
3. Netlify reads `netlify.toml` automatically (build: `npm run build`, publish: `_site`). Just click Deploy.

## Structure

```
src/
  _data/listings.json   # the listing data (title, price, area, zone, contact, image paths…)
  _data/site.json       # site title / tagline / updated date
  _includes/layout.njk  # base HTML shell
  index.njk             # filterable card grid (zone / price / beds)
  listings/listing.njk  # per-listing detail page (paginated over listings.json)
  assets/style.css
  img/<id>/*.jpg        # locally cached listing photos
```

## Editing data

All listings live in `src/_data/listings.json`. Each record:

| field | meaning |
|---|---|
| `area`, `zone` | location + zone bucket (`target`, `target-edge`, `fallback`, `backup`, `out`, `reject-type`) |
| `price`, `priceNum`, `beds`, `beds_baths` | pricing & layout |
| `listed`, `move_in_date` | posting date & availability |
| `description` | original post text |
| `url`, `source_site`, `seller_name`, `seller_profile`, `contact` | source & contact |
| `images`, `imgCount` | local image paths |

Photos are cached locally (the original Facebook CDN URLs are signed and expire), so the site stays
self-contained. Verify price/availability on each `url` before contacting — listings go stale fast.
