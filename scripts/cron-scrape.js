#!/usr/bin/env node
// Background scraper: runs every 5min, dedupes stale listings, pushes to GitHub, triggers Netlify.
const { execFileSync } = require("child_process");
const fs = require("fs");
const https = require("https");

const RES = "/home/noah/bot/results.json";
const LST = "/home/noah/chiangmai-rentals/src/_data/listings.json";
const SITE = "/home/noah/chiangmai-rentals";
// Set your Netlify build hook via env: NETLIFY_HOOK=https://api.netlify.com/build_hooks/XXXX
const NETLIFY_HOOK = process.env.NETLIFY_HOOK || "";
const STALE_DAYS = 21; // drop listings >3 weeks old

try {
  // Run one scraper cycle (rotate adapters to spread load)
  const adapters = ["baanfinder", "bahtsold", "livinginsider", "propertyhub", "hipflat"];
  const cycleIdx = Math.floor(Date.now() / 300000) % adapters.length; // rotate every 5min cycle
  const adapter = adapters[cycleIdx];

  console.log(`[cron-scrape] ${new Date().toISOString()} running ${adapter}...`);
  try {
    execFileSync("node", ["/home/noah/bot/sources/pipeline.js", adapter], {
      timeout: 120000,
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (e) {
    // pipeline might timeout or fail; that's ok, continue with cleanup
    console.log(`[cron-scrape] ${adapter} failed (timeout/error), continuing with cleanup...`);
  }

  // Drop stale listings (>STALE_DAYS old)
  if (fs.existsSync(RES) && fs.existsSync(LST)) {
    const results = JSON.parse(fs.readFileSync(RES, "utf8"));
    const listings = JSON.parse(fs.readFileSync(LST, "utf8"));
    const keepResults = results.filter((r) => {
      const list = listings.find((l) => l.id === r.id);
      if (!list || !list.listed) return true; // no date = keep
      const m = list.listed.match(/(\d+)\s*days?\s*ago/i);
      if (!m) return true; // can't parse = keep
      const daysAgo = +m[1];
      return daysAgo <= STALE_DAYS; // keep if <=STALE_DAYS
    });
    const keepListings = listings.filter((l) => {
      const m = l.listed ? l.listed.match(/(\d+)\s*days?\s*ago/i) : null;
      if (!m) return true;
      const daysAgo = +m[1];
      return daysAgo <= STALE_DAYS;
    });
    const dropped = results.length - keepResults.length;
    if (dropped > 0) {
      fs.writeFileSync(RES, JSON.stringify(keepResults, null, 1));
      fs.writeFileSync(LST, JSON.stringify(keepListings, null, 2));
      console.log(`[cron-scrape] dropped ${dropped} stale listings`);
      // re-score
      execFileSync("node", [`${SITE}/score.js`], { stdio: "pipe" });
    }
  }

  // Rebuild site
  console.log(`[cron-scrape] rebuilding site...`);
  execFileSync("npx", ["@11ty/eleventy"], { cwd: SITE, stdio: "pipe", timeout: 30000 });

  // Git push
  console.log(`[cron-scrape] committing...`);
  execFileSync("git", ["add", "-A"], { cwd: SITE, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", `auto: scrape ${adapter} + cleanup`, "--allow-empty"], { cwd: SITE, stdio: "pipe" });
  execFileSync("git", ["push", "origin", "main"], { cwd: SITE, stdio: "pipe", timeout: 30000 });

  // Trigger Netlify build
  console.log(`[cron-scrape] triggering Netlify...`);
  https.post(NETLIFY_HOOK, {}, (res) => {
    console.log(`[cron-scrape] Netlify responded ${res.statusCode}`);
    if (res.statusCode === 200 || res.statusCode === 201) console.log("[cron-scrape] OK");
  });

  console.log(`[cron-scrape] cycle complete`);
} catch (e) {
  console.error(`[cron-scrape] error: ${e.message}`);
  process.exit(1);
}
