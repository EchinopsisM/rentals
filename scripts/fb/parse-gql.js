// Parse captured GraphQL dump into clean posts: text + permalink + time + images.
const fs = require("fs");
const path = require("path");
const all = fs.readFileSync(path.join(__dirname, "gql-dump.txt"), "utf8");

// Grab each "message":{"text":"..."} body, decode JSON escapes, and look at a
// window around it for the story permalink, creation_time, and image URLs.
const re = /"message":\{"text":"((?:[^"\\]|\\.)*)"/g;
const posts = [];
let m;
while ((m = re.exec(all))) {
  let text;
  try { text = JSON.parse('"' + m[1] + '"'); } catch { continue; }
  if (!text || text.length < 15) continue;

  const win = all.slice(Math.max(0, m.index - 4000), m.index + 4000);

  // permalink: a groups story/permalink URL near the message
  let url = "";
  const urlM = win.match(/"(https:\\?\/\\?\/www\.facebook\.com\\?\/groups\\?\/[^"\\]+(?:posts|permalink)[^"]*?)"/);
  if (urlM) url = urlM[1].replace(/\\\//g, "/").split("?")[0];

  // creation_time: nearest unix ts
  let time = "";
  const tM = win.match(/"creation_time":(\d{10})/);
  if (tM) time = new Date(+tM[1] * 1000).toISOString().slice(0, 10);

  // images: scontent uris in the window
  const imgs = [...win.matchAll(/"(https:\\?\/\\?\/[^"]*scontent[^"]*?)"/g)]
    .map((x) => x[1].replace(/\\\//g, "/"))
    .filter((u) => /\.(jpg|jpeg|png|webp)/i.test(u))
    .slice(0, 8);

  posts.push({ text, url, time, images: [...new Set(imgs)] });
}

// Dedup by text
const seen = new Set();
const unique = posts.filter((p) => {
  const k = p.text.slice(0, 80);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

console.log("parsed unique posts:", unique.length, "\n");
unique.slice(0, 6).forEach((p, i) => {
  console.log(`=== [${i + 1}] time:${p.time || "?"} imgs:${p.images.length} ===`);
  console.log("url:", p.url || "(none found)");
  console.log(p.text.replace(/\n+/g, " | ").slice(0, 350));
  console.log("");
});
