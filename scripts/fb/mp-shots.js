const { chromium } = require("playwright");
const path = require("path");
const PROFILE = path.join(__dirname, "profile");
const IDS = ["1742519273591287","1466688592169370","2189155061929149","1357327619659417","2020888235201322","986059964184439","1055748890469935","1556543416011139","3404996946348562","997559016473810"];
(async()=>{
  const ctx=await chromium.launchPersistentContext(PROFILE,{headless:true,viewport:{width:1200,height:1100},args:["--password-store=basic","--use-mock-keychain","--no-first-run","--disable-dev-shm-usage","--disable-gpu","--no-sandbox"]});
  const page=ctx.pages()[0]||(await ctx.newPage());
  for(let i=0;i<IDS.length;i++){
    try{
      await page.goto("https://www.facebook.com/marketplace/item/"+IDS[i],{waitUntil:"domcontentloaded",timeout:45000});
      await page.waitForTimeout(3500);
      // click any "See more" to expand description
      try{const b=await page.$('div[role="button"]:has-text("See more"), div[role="button"]:has-text("ดูเพิ่มเติม")'); if(b)await b.click().catch(()=>{});}catch{}
      await page.waitForTimeout(800);
      await page.screenshot({path:path.join(__dirname,"shot-"+(i+1)+".png")});
      process.stderr.write((i+1)+" ");
    }catch(e){process.stderr.write("x"+(i+1)+" ");}
  }
  process.stderr.write("\nDONE\n");
  await ctx.close();
})();
