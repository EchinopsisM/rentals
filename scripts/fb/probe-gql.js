const { chromium } = require("playwright");
const path = require("path"); const fs = require("fs");
const PROFILE = path.join(__dirname, "profile");
(async()=>{
  const ctx=await chromium.launchPersistentContext(PROFILE,{headless:true,viewport:{width:1280,height:900},args:["--password-store=basic","--use-mock-keychain","--no-first-run","--disable-dev-shm-usage","--disable-gpu","--no-sandbox"]});
  const page=ctx.pages()[0]||(await ctx.newPage());
  const bodies=[];
  page.on("response", async (resp)=>{
    const u=resp.url();
    if(u.includes("/api/graphql/")||u.includes("/graphql")){
      try{const b=await resp.text(); bodies.push(b);}catch{}
    }
  });
  await page.goto("https://www.facebook.com/groups/251125079442673?sorting_setting=CHRONOLOGICAL",{waitUntil:"domcontentloaded"});
  await page.waitForTimeout(5000);
  for(let i=0;i<6;i++){await page.mouse.wheel(0,2600);await page.waitForTimeout(2800);}
  const all=bodies.join("\n");
  fs.writeFileSync(path.join(__dirname,"gql-dump.txt"), all);
  console.log("graphql responses captured:",bodies.length,"total bytes:",all.length);
  // probe for message text markers
  for(const marker of ['"message":{"text"','"message":','"text":"','"creation_time"','"story":','permalink','wwwURL','สนใจ','ห้องนอน','บาท']){
    const c=(all.split(marker).length-1);
    console.log("  marker",JSON.stringify(marker),"->",c);
  }
  await ctx.close();
})();
