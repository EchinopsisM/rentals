#!/usr/bin/env node
// Background daemon: runs cron-scrape every 5 minutes. Start with: `nohup node daemon.js &`
const { spawn } = require("child_process");
const fs = require("fs");

const LOG = "/home/noah/bot/daemon.log";
const INTERVAL = 5 * 60 * 1000; // 5 minutes

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG, line);
}

log("daemon started");
let running = false;

setInterval(() => {
  if (running) {
    log("previous cycle still running, skipping...");
    return;
  }
  running = true;
  log("spawning cron-scrape...");
  const proc = spawn("node", ["/home/noah/bot/cron-scrape.js"], {
    detached: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  proc.stdout.on("data", (d) => log(d.toString().trim()));
  proc.stderr.on("data", (d) => log(`ERR: ${d.toString().trim()}`));
  proc.on("close", (code) => {
    log(`cron-scrape exited ${code}`);
    running = false;
  });
}, INTERVAL);

process.on("SIGTERM", () => {
  log("SIGTERM received, exiting...");
  process.exit(0);
});
