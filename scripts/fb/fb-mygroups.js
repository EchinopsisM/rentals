// Discover all Facebook groups the logged-in user is a member of.
// Reads the "Your groups" / joins page, scrolls, and extracts {id, name}
// from the sidebar group links (link text is not DOM-obfuscated).
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const PROFILE = path.join(__dirname, "profile");

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1280, height: 1000 },
    args: ["--password-store=basic", "--use-mock-keychain", "--no-first-run",
           "--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  const cookies = await ctx.cookies("https://www.facebook.com");
  if (!cookies.some((c) => c.name === "c_user")) { console.error("NOT LOGGED IN"); await ctx.close(); process.exit(2); }

  await page.goto("https://www.facebook.com/groups/joins/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, 3000); await page.waitForTimeout(1500); }

  const groups = await page.evaluate(() => {
    const map = {};
    document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
      const m = (a.getAttribute("href") || "").match(/\/groups\/([0-9a-zA-Z._-]+)\/?/);
      if (!m) return;
      const id = m[1];
      if (["joins", "discover", "feed", "search", "create"].includes(id)) return;
      const name = (a.innerText || "").trim().split("\n")[0];
      if (name && name.length > 1 && !map[id]) map[id] = name;
    });
    return map;
  });

  const list = Object.entries(groups).map(([id, name]) => ({ id, name }));
  fs.writeFileSync(path.join(__dirname, "my-groups.json"), JSON.stringify(list, null, 2));
  console.log("joined groups found:", list.length);
  list.forEach((g) => console.log(`${g.id}\t${g.name}`));
  await ctx.close();
})();
