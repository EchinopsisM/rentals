// Synthesize a target-zone shortlist from group posts (out.json) + marketplace
// (mp.json). Keep 2BR+ rentals <=20k that mention a CMU/Suthep/Nimman-area zone.
const fs = require("fs");
const groups = require("./out.json");
const mp = require("./mp.json");

// IN-BAND: western strip, south of CM Zoo / north of Wat Umong.
const ZONE = /(สุเทพ|suthep|มช\b|ม\.ช|มหาวิทยาลัยเชียงใหม่|cmu|chiang mai university|นิมมาน|nimman|สวนดอก|suan ?dok|มหาราช|maharaj|ห้วยแก้ว|huay ?kaew|huai ?kaew|คลองชลประทาน|คลองชล|canal ?road|คันคลอง|อุโมงค์|umong|ต้นพยอม|ton ?payom|เมญ่า|maya|ศิริมังคลาจารย์|sirimangkala|หลังมอ|หลัง ?มช|วัดอุโมงค์|ผาลาด|โพธาราม)/i;
// OUT-OF-BAND: north of the zoo / east / suburbs — exclude even if a zone word appears.
const OUTZONE = /(ช้างเผือก|chang ?phueak|โชตนา|chotana|ป่าตัน|pa ?tan|บ้านท่อ|สันติธรรม|santitham|เจ็ดยอด|jed ?yod|หนองหอย|nong ?hoi|หางดง|hang ?dong|สันกำแพง|san ?kamphaeng|สารภี|saraphi|ดอยสะเก็ด|doi ?saket|สันทราย|san ?sai|แม่โจ้|mae ?jo|รวมโชค|ruamchok|ฟ้าฮ่าม|fa ?ham|แม่เหียะ|mae ?hia|ไนท์ซาฟารี|night ?safari)/i;
const RENT = /(ให้เช่า|ปล่อยเช่า|ค่าเช่า|for rent|เช่า\s|\/เดือน|\/month|บาท\/เดือน|thb\/)/i;
const SALE_ONLY = /(ขาย|sale|sell|ล้านบาท|million|ผ่อน|โอน)/i;
const SPAM = /(ขนย้าย|ขนส่ง|รับย้าย|ทำความสะอาด|บิ๊กคลีน|สินเชื่อ|นายหน้าคอม)/i;
const BTS = /(bts|mrt|sukhumvit|สุขุมวิท|พระราม|กรุงเทพ|bangkok|thong ?lo|ทองหล่อ|phrom|อโศก|เกษตร|นวมินทร์)/i;
const BEDS = /(\d)\s*(ห้องนอน|นอน\b|bed|br\b|bedroom)/i;

function beds(t){const m=t.match(BEDS);return m?+m[1]:null;}
function rentPrice(t){
  // prefer explicit rent price
  let m=t.match(/(?:ค่าเช่า|เช่า|rent)[^\d]{0,8}([\d][\d,]{2,})/i)||t.match(/([\d][\d,]{2,})\s*(?:บาท|thb|฿)?\s*\/\s*(?:เดือน|month|มด|ด\b)/i)||t.match(/฿\s*([\d][\d,]{2,})/);
  return m?+m[1].replace(/,/g,''):null;
}

const out=[];
// --- groups ---
for(const [id,g] of Object.entries(groups)){
  for(const p of (g.posts||[])){
    const t=p.text||"";
    if(!ZONE.test(t)) continue;
    if(OUTZONE.test(t)) continue;        // drop north-of-zoo / suburbs
    if(!RENT.test(t)) continue;
    if(SPAM.test(t)) continue;
    if(BTS.test(t)) continue;            // drop Bangkok
    const b=beds(t); if(!(b>=2&&b<=5)) continue;
    const pr=rentPrice(t);
    if(pr&&pr>20000) continue;           // over budget (when parseable)
    if(SALE_ONLY.test(t)&&!RENT.test(t)) continue;
    out.push({src:g.label,beds:b,price:pr,url:p.url,text:t.replace(/\n+/g,' | ').slice(0,260)});
  }
}
// --- marketplace (cards lack neighborhood; keep Suthep-query + 2BR<=20k) ---
for(const x of mp){
  const t=x.text||"";
  const b=beds(t); if(!(b>=2&&b<=5)) continue;
  if(OUTZONE.test(t)) continue;
  const sutQ = (x.q||"").includes("สุเทพ");
  const zoneHit = ZONE.test(t);
  if(!sutQ && !zoneHit) continue;       // only keep zone-relevant MP cards
  out.push({src:"Marketplace ("+x.q+")",beds:b,price:(t.match(/฿\s*([\d,]+)/)||[])[1],url:x.url,text:t.slice(0,200)});
}

// dedup by url
const seen=new Set();
const uniq=out.filter(x=>{if(seen.has(x.url))return false;seen.add(x.url);return true;});

let lines=[`TARGET-ZONE shortlist: ${uniq.length}\n`];
uniq.forEach((x,i)=>{lines.push(`\n[${i+1}] ${x.src} | beds:${x.beds} | ฿${x.price||'?'}\n${x.url}\n${x.text}`);});
fs.writeFileSync("target.txt",lines.join("\n"));
console.log("target-zone shortlist:",uniq.length);
