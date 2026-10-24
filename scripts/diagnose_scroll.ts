import { chromium } from 'playwright';

async function diagnose() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  const routes = ['/', '/matches', '/predictions', '/performance', '/settings', '/creators'];

  for (const route of routes) {
    console.log(`\n=== Diagnosing Route: ${route} ===`);
    await page.goto(`http://localhost:3000${route}`, { waitUntil: 'networkidle' });

    const results = await page.evaluate(() => {
      const htmlStyle = window.getComputedStyle(document.documentElement);
      const bodyStyle = window.getComputedStyle(document.body);
      const topEl = document.elementFromPoint(195, 400);

      return {
        htmlOverflow: htmlStyle.overflow,
        htmlOverflowX: htmlStyle.overflowX,
        htmlOverflowY: htmlStyle.overflowY,
        htmlHeight: htmlStyle.height,
        htmlOverscroll: htmlStyle.overscrollBehavior,
        bodyOverflow: bodyStyle.overflow,
        bodyOverflowX: bodyStyle.overflowX,
        bodyOverflowY: bodyStyle.overflowY,
        bodyHeight: bodyStyle.height,
        bodyMinHeight: bodyStyle.minHeight,
        bodyOverscroll: bodyStyle.overscrollBehavior,
        topElement: topEl ? `${topEl.tagName.toLowerCase()}${topEl.className ? '.' + topEl.className.split(' ').slice(0, 3).join('.') : ''}` : 'null',
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollHeight: document.body.scrollHeight,
        innerHeight: window.innerHeight,
        canScrollWindow: document.documentElement.scrollHeight > window.innerHeight,
      };
    });

    console.log(JSON.stringify(results, null, 2));

    // Test wheel/touch scroll attempt
    const beforeScroll = await page.evaluate(() => ({
      windowY: window.scrollY,
      bodyScrollTop: document.body.scrollTop,
      htmlScrollTop: document.documentElement.scrollTop,
    }));

    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(200);

    const afterScroll = await page.evaluate(() => ({
      windowY: window.scrollY,
      bodyScrollTop: document.body.scrollTop,
      htmlScrollTop: document.documentElement.scrollTop,
    }));

    console.log('Scroll test (wheel 500px):', { before: beforeScroll, after: afterScroll });
  }

  await browser.close();
}

diagnose().catch(err => {
  console.error('Diagnosis error:', err);
  process.exit(1);
});
