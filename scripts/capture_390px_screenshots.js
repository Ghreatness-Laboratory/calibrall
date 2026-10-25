const { chromium } = require('playwright');

async function capture() {
  console.log('Launching browser to capture 390px screenshots...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  });

  const page = await context.newPage();

  // 1. Fixtures page
  console.log('Navigating to http://localhost:3000/matches...');
  await page.goto('http://localhost:3000/matches', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Check horizontal overflow
  const fixturesOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(`Fixtures page horizontal overflow: ${fixturesOverflow}`);

  await page.screenshot({ path: 'public/fixtures_390px.png', fullPage: false });
  console.log('Saved public/fixtures_390px.png');

  // 2. Picks / Predictions page
  console.log('Navigating to http://localhost:3000/predictions...');
  await page.goto('http://localhost:3000/predictions', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  const picksOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  console.log(`Picks page horizontal overflow: ${picksOverflow}`);

  await page.screenshot({ path: 'public/picks_390px.png', fullPage: false });
  console.log('Saved public/picks_390px.png');

  await browser.close();
  console.log('Screenshot capture complete!');
}

capture().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
