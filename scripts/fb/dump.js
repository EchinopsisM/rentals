const d = require("./out.json");
let n = 0;
for (const [id, g] of Object.entries(d)) {
  if (!(g.posts || []).length) continue;
  console.log("\n=========", g.label, "=========");
  g.posts.forEach((p) => {
    n++;
    console.log(`\n[${n}] ${p.permalink}  (listed: ${p.listed || "?"}, imgs: ${(p.images || []).length})`);
    console.log(p.text.replace(/\n+/g, " | ").slice(0, 600));
  });
}
console.log("\nTOTAL POSTS:", n);
