// One-time Facebook login. Opens a real Chromium window (rendered by WSLg on
// your Windows desktop). Log in normally; the session persists to ./profile so
// every later scrape run is already authenticated. Re-run anytime to refresh.
const { chromium } = require("playwright");
const path = require("path");

const PROFILE = path.join(__dirname, "profile");

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--password-store=basic", "--use-mock-keychain", "--no-first-run"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

  console.log("\n>>> A Chromium window should now be open on your desktop.");
  console.log(">>> Log into Facebook in that window. I'll detect it automatically.\n");

  // Poll for the c_user cookie — set only once you're authenticated.
  const start = Date.now();
  const TIMEOUT = 30 * 60 * 1000; // 30 minutes to log in
  while (Date.now() - start < TIMEOUT) {
    const cookies = await ctx.cookies("https://www.facebook.com");
    if (cookies.some((c) => c.name === "c_user" && c.value)) {
      console.log("LOGIN OK — session saved to", PROFILE);
      await page.waitForTimeout(1500); // let cookies flush to disk
      await ctx.close();
      process.exit(0);
    }
    await page.waitForTimeout(2000);
  }
  console.log("TIMED OUT waiting for login (5 min). Re-run when ready.");
  await ctx.close();
  process.exit(1);
})();
