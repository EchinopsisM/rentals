// Diagnose why few posts are captured: dump page state for one group.
const { chromium } = require("playwright");
const path = require("path");
const PROFILE = path.join(__dirname, "profile");
const GID = process.argv[2] || "251125079442673";

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ["--password-store=basic", "--use-mock-keychain", "--no-first-run",
           "--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const url = `https://www.facebook.com/groups/${GID}?sorting_setting=CHRONOLOGICAL`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 3000); await page.waitForTimeout(2500); }

  const info = await page.evaluate(() => {
    const txt = (s) => document.body.innerText.includes(s);
    return {
      url: location.href,
      title: document.title,
      articles: document.querySelectorAll('div[role="article"]').length,
      joinWall: txt("Join group") || txt("เข้าร่วมกลุ่ม") || txt("Join Group"),
      visitorPreview: txt("Preview") || txt("About this group") || txt("เกี่ยวกับกลุ่มนี้"),
      bodyStart: document.body.innerText.slice(0, 600),
      // candidate post containers by common FB patterns
      feedDivs: document.querySelectorAll('div[role="feed"]').length,
      articlesUnderFeed: document.querySelectorAll('div[role="feed"] div[role="article"]').length,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: path.join(__dirname, "debug.png"), fullPage: false });
  console.log("screenshot -> debug.png");
  await ctx.close();
})();
