const fs=require("fs"); const d=require("./mp.json");
// card text like "฿12,000 | 2 bed 2 bath ... | Chiang Mai, ..."
const BEDS=/(\d)\s*(bed|br|ห้องนอน|นอน)/i;
const PRICE=/฿?\s*([\d][\d,]{2,})/;
function beds(t){const m=t.match(BEDS);return m?+m[1]:null;}
function price(t){const m=t.match(PRICE);return m?+m[1].replace(/,/g,''):null;}
const rows=d.map(x=>({...x,beds:beds(x.text),price:price(x.text)}));
// 2BR+ and price <=20000 (price parse is rough; keep if beds>=2)
const cand=rows.filter(x=>x.beds&&x.beds>=2&&x.beds<=5);
cand.sort((a,b)=>(a.price||99999)-(b.price||99999));
let lines=[`MP 2BR+ candidates: ${cand.length} / ${d.length} items\n`];
cand.forEach((x,i)=>{lines.push(`\n[${i+1}] beds:${x.beds} price~:${x.price||'?'} q:"${x.q}"\n${x.url}\n${x.text.slice(0,200)}`);});
fs.writeFileSync("mp-eval.txt",lines.join("\n"));
console.log(`MP 2BR+ candidates: ${cand.length} / ${d.length}`);
