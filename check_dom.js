const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  const html = await page.$eval('#root', el => el.innerHTML);
  console.log('ROOT HTML:', html);
  await browser.close();
})();
