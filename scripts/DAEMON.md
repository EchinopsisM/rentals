# Background Scraper Daemon

Runs every 5 minutes to scrape rental listings, removes stale ones (>3 weeks old), rebuilds the site, pushes to GitHub, and triggers the Netlify build hook.

## Start the daemon

```bash
nohup node /home/noah/bot/daemon.js > /home/noah/bot/daemon.log 2>&1 &
```

Or keep it running in a tmux session:

```bash
tmux new-session -d -s scraper "node /home/noah/bot/daemon.js"
```

View logs:
```bash
tail -f /home/noah/bot/daemon.log
```

## Stop the daemon

Find the PID:
```bash
ps aux | grep "node /home/noah/bot/daemon.js"
```

Kill it:
```bash
kill <PID>
```

Or if running in tmux:
```bash
tmux kill-session -t scraper
```

## How it works

- **Rotates adapters**: Each 5-min cycle runs a different source (BaanFinder → BahtSold → LivingInsider → PropertyHub → Hipflat).
- **Drops stale listings**: Removes listings >21 days old (matching the "posted <3 weeks" brief).
- **Rebuilds & pushes**: Runs `npm run build` and commits to GitHub.
- **Triggers Netlify**: POSTs to the build hook to deploy new changes.

All output logged to `/home/noah/bot/daemon.log`.

## Troubleshooting

If listings aren't updating:
- Check the daemon log: `tail -f /home/noah/bot/daemon.log`
- Verify git credentials: `git -C /home/noah/chiangmai-rentals push origin main` (should work without prompting)
- Test one cycle manually: `node /home/noah/bot/cron-scrape.js`
