module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/img": "img" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Zone display metadata
  const ZONES = {
    "target":      { label: "Target zone",  rank: 0, color: "#1f8a4c" },
    "target-edge": { label: "Suthep edge",  rank: 1, color: "#3f9d62" },
    "fallback":    { label: "Fallback",     rank: 2, color: "#c98a1a" },
    "backup":      { label: "Backup",       rank: 3, color: "#7b7b8a" },
    "out":         { label: "Out of zone",  rank: 4, color: "#b14b4b" },
    "reject-type": { label: "Rejected",     rank: 5, color: "#9a9a9a" },
    "other":       { label: "Other",        rank: 6, color: "#9a9a9a" }
  };
  eleventyConfig.addFilter("zoneMeta", (z) => ZONES[z] || ZONES.other);
  eleventyConfig.addFilter("zoneRank", (z) => (ZONES[z] || ZONES.other).rank);

  // --- "Get in touch": pull a Thai mobile from the post text and build a
  //     WhatsApp deep-link pre-filled with a bilingual "is it still available?" message.
  function extractPhone(...texts) {
    let t = texts.filter(Boolean).join("  ");
    if (!t) return null;
    t = t.replace(/([0-9])️?⃣/g, "$1");                         // emoji keycap digits -> ascii
    t = t.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)); // fullwidth -> ascii
    let prev;                                                             // join digit groups split by space/dash/dot
    do { prev = t; t = t.replace(/(\d)[ \-.](\d)/g, "$1$2"); } while (t !== prev);
    const m = t.match(/(?:\+?66|0)[689]\d{8}/);                          // Thai mobile (0 or +66 form)
    if (!m) return null;
    const raw = m[0].replace(/^\+/, "");
    const intl = raw.startsWith("0") ? "66" + raw.slice(1) : raw;
    const local = "0" + intl.slice(2);
    return { intl, pretty: local.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") };
  }
  eleventyConfig.addFilter("getInTouch", (l) => {
    if (!l) return null;
    const p = extractPhone(l.description, l.contact, l.seller_name, l.title);
    if (!p) return null;
    const beds = l.beds ? `${l.beds}-bedroom ` : "";
    const bedsTh = l.beds ? `${l.beds} ห้องนอน ` : "";
    const msg =
      `สวัสดีค่ะ/ครับ 🙏 สนใจที่พักให้เช่านี้ (${bedsTh}฿${l.price}/เดือน) ยังว่างอยู่ไหมคะ/ครับ? ` +
      `ถ้ายังว่างอยู่ ขอเข้าชมโดยเร็วที่สุดเลยค่ะ/ครับ ขอบคุณค่ะ/ครับ\n\n` +
      `Hello! I'm interested in this ${beds}rental (฿${l.price}/mo). Is it still available? ` +
      `If so, I'd love to come and view it as soon as possible. Thank you!`;
    const enc = encodeURIComponent(msg);
    return { phone: p.pretty, wa: `https://wa.me/${p.intl}?text=${enc}`, sms: `sms:+${p.intl}?&body=${enc}`, tel: `tel:+${p.intl}` };
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
