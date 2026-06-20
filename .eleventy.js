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

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
