// Facebook group scraper — captures the page's own GraphQL JSON (which is NOT
// DOM-obfuscated) while scrolling each group's chronological feed, then parses
// each story's post text + permalink (wwwURL) + images. Feed is newest-first,
// so capture order ≈ recency. The model evaluates the dumped posts afterward.
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const PROFILE = path.join(__dirname, "profile");
const OUT = path.join(__dirname, "out.json");

const GROUPS = [
  // CMU / Suthep specific
  ["251125079442673", "หาหอ มช. (CMU room-finding)"],
  ["898379905639923", "หาหอพัก อพาร์ทเมนท์ ใกล้ มช."],
  ["1101758433954576", "เช่าคอนโดสวนดอก (Suan Dok/Suthep)"],
  // Thai general CM rental
  ["homerentcm", "บ้านเช่าเชียงใหม่ (foundation, owner-direct)"],
  ["1472146056424210", "บ้านเช่า คอนโด หอพัก ห้องเช่า เชียงใหม่"],
  ["338468247792825", "คอนโดเชียงใหม่ อันดับ 1 By Realestate9"],
  ["426467944402414", "บ้านเช่า คอนโด ห้องพัก รายวัน-รายเดือน"],
  ["210530250041021", "คอนโดเช่า บ้านเช่า ซื้อ-ขายเชียงใหม่"],
  ["959424411557852", "บ้านเช่าเชียงใหม่ รับสัตว์เลี้ยง (pet-friendly)"],
  // English / mixed CM rental
  ["realestatechiangmai", "REAL ESTATE CHIANG MAI (buy/sell/rent)"],
  ["ChiangMaiRealEstateby66", "Chiang Mai Real Estate by 66Property"],
  ["596670275854317", "CONDO & HOUSE Short/Long term RENT CM"],
  ["142702946428033", "CHIANG MAI - Rent House/Condo/Studio"],
  ["cnxcondo", "Chiang Mai condos for sale & rent"],
  ["287921528585220", "House & Condo for rent in CHIANG MAI"],
  ["chiang.mai.rental.properties", "Chiang Mai Rental Properties"],
  ["3875314899412831", "Chiang Mai Houses & Condos for Rent Under 15k"],
];

const SCROLLS = Number(process.argv[2] || 12);

// Parse a blob of concatenated GraphQL responses into posts.
function parsePosts(blob) {
  // Index every post permalink (wwwURL) so we can attach the nearest one.
  const links = [];
  const lre = /"wwwURL":"(https:\\?\/\\?\/www\.facebook\.com\\?\/groups\\?\/[^"]*?(?:permalink|posts)\\?\/\d+\\?\/?)"/g;
  let lm;
  while ((lm = lre.exec(blob))) links.push({ idx: lm.index, url: lm[1].replace(/\\\//g, "/").replace(/\\/g, "").split("?")[0] });

  const re = /"message":\{"text":"((?:[^"\\]|\\.)*)"/g;
  const out = [];
  let m, order = 0;
  while ((m = re.exec(blob))) {
    let text;
    try { text = JSON.parse('"' + m[1] + '"'); } catch { continue; }
    if (!text || text.length < 15) continue;

    // nearest following permalink (within the same story node)
    let url = "";
    for (const l of links) { if (l.idx > m.index) { url = l.url; break; } }

    const win = blob.slice(m.index, m.index + 6000);
    const imgs = [...win.matchAll(/"(https:\\?\/\\?\/[^"]*scontent[^"]*?)"/g)]
      .map((x) => x[1].replace(/\\\//g, "/").replace(/\\u0025/g, "%"))
      .filter((u) => /\.(jpg|jpeg|png|webp)/i.test(u));

    out.push({ order: order++, text, url, images: [...new Set(imgs)].slice(0, 8) });
  }
  // dedup by leading text
  const seen = new Set();
  return out.filter((p) => { const k = p.text.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; });
}

async function scrapeGroup(page, id) {
  const buf = [];
  const handler = async (resp) => {
    const u = resp.url();
    if (u.includes("/api/graphql/") || u.includes("/graphql")) {
      try { buf.push(await resp.text()); } catch {}
    }
  };
  page.on("response", handler);

  await page.goto(`https://www.facebook.com/groups/${id}?sorting_setting=CHRONOLOGICAL`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  for (let i = 0; i < SCROLLS; i++) { await page.mouse.wheel(0, 2600); await page.waitForTimeout(2800); }

  page.off("response", handler);
  return parsePosts(buf.join("\n"));
}

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: ["--password-store=basic", "--use-mock-keychain", "--no-first-run",
           "--disable-dev-shm-usage", "--disable-gpu", "--no-sandbox"],
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  const cookies = await ctx.cookies("https://www.facebook.com");
  if (!cookies.some((c) => c.name === "c_user")) {
    console.error("NOT LOGGED IN — run: node fb-login.js");
    await ctx.close();
    process.exit(2);
  }

  const result = {};
  for (const [id, label] of GROUPS) {
    process.stderr.write(`scraping ${label} ... `);
    try {
      const posts = await scrapeGroup(page, id);
      result[id] = { label, count: posts.length, posts };
      process.stderr.write(`${posts.length} posts\n`);
    } catch (e) {
      result[id] = { label, error: String(e) };
      process.stderr.write(`ERROR ${e}\n`);
    }
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  }

  await ctx.close();
  console.error("DONE ->", OUT);
  process.exit(0);
})();
