const { chromium } = require("playwright");
const path = require("path"); const fs = require("fs");
const PROFILE = path.join(__dirname, "profile");
const urls = fs.readFileSync(path.join(__dirname,"mp-urls.txt"),"utf8").trim().split("\n").filter(Boolean);
(async()=>{
  const ctx=await chromium.launchPersistentContext(PROFILE,{headless:true,viewport:{width:1100,height:900},args:["--password-store=basic","--use-mock-keychain","--no-first-run","--disable-dev-shm-usage","--disable-gpu","--no-sandbox"]});
  const page=ctx.pages()[0]||(await ctx.newPage());
  const out=[];
  for(const u of urls){
    try{
      await page.goto(u,{waitUntil:"domcontentloaded",timeout:45000});
      await page.waitForTimeout(2500);
      const d=await page.evaluate(()=>{
        const title=(document.querySelector('meta[property="og:title"]')||{}).content||document.title;
        // location: link to maps or text near "Location"
        let loc="";
        const body=document.body.innerText;
        const m=body.match(/(?:Location|ตั้งอยู่|พิกัด)[^\n]{0,60}/i);
        if(m) loc=m[0];
        // description: og:description
        const desc=(document.querySelector('meta[property="og:description"]')||{}).content||"";
        // any subdistrict/tambon mention
        return {title, loc, desc:desc.slice(0,400), bodyHint:body.slice(0,1200)};
      });
      out.push({url:u,...d});
      process.stderr.write(".");
    }catch(e){out.push({url:u,err:String(e)});process.stderr.write("x");}
    fs.writeFileSync(path.join(__dirname,"mp-details.json"),JSON.stringify(out,null,2));
  }
  process.stderr.write("\nDONE "+out.length+"\n");
  await ctx.close();
})();
