const { chromium } = require("playwright");
const path=require("path");const fs=require("fs");
const PROFILE=path.join(__dirname,"profile");
const IDS=["1742519273591287","1466688592169370","2189155061929149","1357327619659417","2020888235201322","986059964184439","1055748890469935","1556543416011139","3404996946348562","997559016473810"];
(async()=>{
  const ctx=await chromium.launchPersistentContext(PROFILE,{headless:true,viewport:{width:1200,height:1100},args:["--password-store=basic","--use-mock-keychain","--no-first-run","--disable-dev-shm-usage","--disable-gpu","--no-sandbox"]});
  const page=ctx.pages()[0]||(await ctx.newPage());
  const res=[];
  for(const id of IDS){
    let lat=null,lng=null,raw="";
    try{
      const buf=[];
      const h=async r=>{const u=r.url(); if(/staticmap|maps|latitude|graphql/.test(u)){ try{ if(/latitude|longitude/.test(u)) raw+=u+"\n"; }catch{} }};
      await page.goto("https://www.facebook.com/marketplace/item/"+id,{waitUntil:"domcontentloaded",timeout:45000});
      await page.waitForTimeout(3500);
      // find map image src + any lat/long in page html
      const info=await page.evaluate(()=>{
        let map="";
        document.querySelectorAll('img').forEach(im=>{const s=im.src||"";if(/staticmap|map.*marker|tile/i.test(s)&&!map)map=s;});
        // search inline scripts/html for latitude/longitude
        const html=document.documentElement.innerHTML;
        const la=html.match(/"latitude":\s*(1[78]\.\d+)/);
        const lo=html.match(/"longitude":\s*(9[89]\.\d+)/);
        return {map, lat: la?la[1]:null, lng: lo?lo[1]:null};
      });
      lat=info.lat;lng=info.lng;raw=info.map;
      // also parse center= from map url
      if((!lat||!lng)&&info.map){const m=info.map.match(/(1[78]\.\d{3,})[%2C,]+\s*(9[89]\.\d{3,})/);if(m){lat=m[1];lng=m[2];}}
    }catch(e){raw="ERR "+e;}
    res.push({id,lat,lng,map:(raw||"").slice(0,120)});
    process.stderr.write(".");
  }
  fs.writeFileSync("mp-coords.json",JSON.stringify(res,null,2));
  process.stderr.write("\n");
  // band check
  const ZN={latS:18.784,latN:18.812,lngW:98.935,lngE:98.962};
  res.forEach(r=>{
    let v="?";
    if(r.lat&&r.lng){const la=+r.lat,lo=+r.lng;v=(la>=ZN.latS&&la<=ZN.latN&&lo>=ZN.lngW&&lo<=ZN.lngE)?"IN-BAND":"out";}
    console.log(r.id, r.lat||"-", r.lng||"-", v);
  });
  await ctx.close();
})();
