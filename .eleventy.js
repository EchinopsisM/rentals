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

  // --- Contact options: detect every channel in the post (phone / Line / WhatsApp /
  //     WeChat / email / FB) and pre-fill a bilingual "is it still available?" message
  //     wherever the channel supports it. The template lists them all to choose from.
  function normalizeDigits(s) {
    return (s || "")
      .replace(/([0-9])️?⃣/g, "$1")                                  // emoji keycap digits
      .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0)); // fullwidth
  }
  function extractPhones(text) {
    let t = normalizeDigits(text);
    let prev; do { prev = t; t = t.replace(/(\d)[ \-.](\d)/g, "$1$2"); } while (t !== prev);
    const out = [];
    const re = /(?:\+?66|0)[689]\d{8}/g; let m;
    while ((m = re.exec(t))) {
      const raw = m[0].replace(/^\+/, "");
      const intl = raw.startsWith("0") ? "66" + raw.slice(1) : raw;
      if (!out.find((o) => o.intl === intl)) out.push({ intl, pretty: ("0" + intl.slice(2)).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3") });
    }
    return out.slice(0, 3);
  }
  eleventyConfig.addFilter("contacts", (l) => {
    if (!l) return null;
    const blob = [l.description, l.contact, l.seller_name].filter(Boolean).join("  ");
    const beds = l.beds ? `${l.beds}-bedroom ` : "";
    const bedsTh = l.beds ? `${l.beds} ห้องนอน ` : "";
    const msg =
      `สวัสดีค่ะ/ครับ 🙏 สนใจที่พักให้เช่านี้ (${bedsTh}฿${l.price}/เดือน) ยังว่างอยู่ไหมคะ/ครับ? ` +
      `ถ้ายังว่างอยู่ ขอเข้าชมโดยเร็วที่สุดเลยค่ะ/ครับ ขอบคุณค่ะ/ครับ\n\n` +
      `Hello! I'm interested in this ${beds}rental (฿${l.price}/mo). Is it still available? ` +
      `If so, I'd love to come and view it as soon as possible. Thank you!`;
    const enc = encodeURIComponent(msg);
    const opts = [];

    // phones -> WhatsApp (pre-filled), SMS (pre-filled), call
    const phones = extractPhones(blob);
    phones.forEach((p) => {
      opts.push({ type: "WhatsApp", label: `WhatsApp ${p.pretty}`, href: `https://wa.me/${p.intl}?text=${enc}`, prefilled: true });
      opts.push({ type: "SMS", label: `SMS ${p.pretty}`, href: `sms:+${p.intl}?&body=${enc}`, prefilled: true });
      opts.push({ type: "Call", label: `Call ${p.pretty}`, href: `tel:+${p.intl}` });
    });

    // explicit Line — line.me URL, or "Line[:] <id>" / "@handle"
    const lines = new Set();
    (blob.match(/line\.me\/[^\s"'<)]+/gi) || []).forEach((u) => lines.add("https://" + u.replace(/^https?:\/\//, "")));
    let lm; const lre = /(?:line\s*id|line|ไลน์)\s*[:：]?\s*(@?[a-z0-9._\-]{2,})/gi;
    while ((lm = lre.exec(blob))) {
      let id = lm[1].replace(/[.,)]+$/, "");
      if (/^(id|me)$/i.test(id)) continue;
      lines.add(id[0] === "@" ? `https://line.me/R/ti/p/${id}` : `https://line.me/ti/p/~${id}`);
    }
    [...lines].slice(0, 3).forEach((href) => {
      const id = decodeURIComponent(href.split(/[~/]/).pop());
      opts.push({ type: "Line", label: `Line${id && id.length < 24 ? " " + id : ""}`, href, prefilled: false });
    });

    // WeChat (no URL pre-fill — copy the id)
    const wc = blob.match(/(?:wechat|weixin|微信)\s*[:：]?\s*([a-z][a-z0-9._\-]{3,})/i);
    if (wc) opts.push({ type: "WeChat", label: `WeChat ${wc[1]}`, copy: wc[1], prefilled: false });

    // email
    const em = blob.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i);
    if (em) opts.push({ type: "Email", label: em[0], href: `mailto:${em[0]}?subject=${encodeURIComponent("Rental enquiry")}&body=${enc}`, prefilled: true });

    // Facebook profile / original post (always)
    if (l.seller_profile) opts.push({ type: "Facebook", label: "Message poster on Facebook", href: l.seller_profile, prefilled: false });
    if (l.url) opts.push({ type: "Facebook", label: "Open original post", href: l.url, prefilled: false });

    return { message: msg, options: opts, hasDirect: phones.length > 0 || lines.size > 0 || !!wc || !!em };
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
