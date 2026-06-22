// Classify a listing's location text into the site's zone buckets.
// Matches English + Thai keywords against area / title / rental_location text.
// Zones (best -> worst) mirror .eleventy.js: target, target-edge, fallback, backup, out.

const RULES = [
  // CMU / Suthep core — the bullseye
  ["target", [
    /suthep/i, /สุเทพ/, /\bcmu\b/i, /chiang ?mai university/i, /มหาวิทยาลัยเชียงใหม่/, /มช\.?/,
    /ang ?kaew/i, /อ่างแก้ว/, /wat ?umong/i, /วัดอุโมงค์/, /chang ?khian/i, /ช่างเคี่ยน/, /ม\.?เชียงใหม่/,
    /canal ?road/i, /khlong ?chon/i, /คลองชลประทาน/, /ชลประทาน/, /doi ?suthep/i, /ดอยสุเทพ/,
  ]],
  // Suthep edge — south Suthep / airport side / foothills fringe
  ["target-edge", [
    /wat ?chang ?thong/i, /วัดช้างทอง/, /\bairport\b/i, /สนามบิน/, /tambon ?suthep/i,
    /suthep.*(south|airport|edge)/i,
  ]],
  // Close-but-not-core: Nimman / Huay Kaew / Santitham / Chang Phueak
  ["fallback", [
    /nimman/i, /นิมมาน/, /huay ?kaew/i, /ห้วยแก้ว/, /santitham/i, /สันติธรรม/,
    /chang ?phueak/i, /ช้างเผือก/, /maya/i, /เมญ่า/, /สันผีเสื้อ/,
  ]],
  // Wider city, still commutable: Old City / inner Mueang / Tha Phae / Nong Hoi
  ["backup", [
    /old ?city/i, /เมืองเก่า/, /tha ?phae/i, /ท่าแพ/, /nong ?hoi/i, /หนองหอย/,
    /chang ?khlan/i, /ช้างคลาน/, /night ?bazaar/i, /wat ?ket/i, /watgate/i, /\bmueang\b/i, /ในเมือง/,
    /central ?(chiang ?mai|festival)/i, /\bnimmana?hae?min\b/i,
  ]],
  // Out of zone: suburbs / districts well away from CMU
  ["out", [
    /hang ?dong/i, /หางดง/, /san ?sai/i, /สันทราย/, /pa ?daet/i, /ป่าแดด/,
    /doi ?saket/i, /ดอยสะเก็ด/, /mae ?rim/i, /แม่ริม/, /saraphi/i, /สารภี/, /สันกำแพง/, /san ?kamphaeng/i,
    /faham/i, /ฟ้าฮ่าม/, /nam ?phrae/i, /น้ำแพร่/, /mae ?hia/i, /แม่เหียะ/, /\bvelaa\b/i,
  ]],
];

function classifyZone(...texts) {
  const hay = texts.filter(Boolean).join(" — ");
  for (const [zone, pats] of RULES) {
    if (pats.some((re) => re.test(hay))) return zone;
  }
  return null; // unknown -> caller decides (treated as "backup"/keep-with-low-score)
}

module.exports = { classifyZone };
