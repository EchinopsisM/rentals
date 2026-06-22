// Probe: can a script-launched browser load a target site? Usage: node probe.js <url>
const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

(async () => {
  const url = process.argv[2];
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/home/noah/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--password-store=basic', '--use-mock-keychain'],
  });
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1366, height: 900 }, locale: 'th-TH' });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    const info = await page.evaluate(() => {
      const links = [...document.querySelectorAll('a')].map(a => a.href);
      const txt = (document.body.innerText || '').slice(0, 400);
      const blocked = /just a moment|cloudflare|captcha|verify you are human|enable javascript|access denied/i.test(txt);
      return {
        title: document.title,
        bodyLen: (document.body.innerText || '').length,
        linkCount: links.length,
        blocked,
        sample: txt,
      };
    });
    console.log('HTTP', resp && resp.status());
    console.log('TITLE', info.title);
    console.log('BODYLEN', info.bodyLen, '| LINKS', info.linkCount, '| BLOCKED', info.blocked);
    console.log('SAMPLE:\n', info.sample.replace(/\n+/g, ' ').slice(0, 300));
    await page.screenshot({ path: 'sources/probe.png', fullPage: false });
    console.log('shot -> sources/probe.png');
  } catch (e) {
    console.log('ERROR', e.message.slice(0, 120));
  }
  await browser.close();
})();
