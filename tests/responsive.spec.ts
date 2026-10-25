import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Responsive UI/UX', () => {
  test('Desktop view - sidebar fixed, content offset', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL + '#/about');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('.sidebar');
    const main = page.locator('.main');

    // Sidebar should be fixed position
    const sidebarPosition = await sidebar.evaluate(el => getComputedStyle(el).position);
    expect(sidebarPosition).toBe('fixed');

    // Main should have left margin
    const mainMarginLeft = await main.evaluate(el => getComputedStyle(el).marginLeft);
    expect(mainMarginLeft).toBe('240px');

    // Sidebar should not scroll with page
    await page.evaluate(() => window.scrollTo(0, 500));
    const sidebarTop = await sidebar.evaluate(el => el.getBoundingClientRect().top);
    expect(sidebarTop).toBe(0);

    // Take screenshot for visual verification
    await page.screenshot({ path: 'tests/screenshots/desktop-view.png', fullPage: true });
  });

  test('Mobile view - sidebar slide-in drawer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(BASE_URL + '#/about');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('.sidebar');
    const menuBtn = page.locator('.menu-btn');

    // Sidebar should be fixed but transformed off-screen
    const sidebarPosition = await sidebar.evaluate(el => getComputedStyle(el).position);
    expect(sidebarPosition).toBe('fixed');

    const sidebarTransform = await sidebar.evaluate(el => getComputedStyle(el).transform);
    expect(sidebarTransform).not.toBe('none');

    // Menu button should be visible
    await expect(menuBtn).toBeVisible();

    // Click menu button to open sidebar
    await menuBtn.click();
    await page.waitForTimeout(200);

    const sidebarTransformOpen = await sidebar.evaluate(el => getComputedStyle(el).transform);
    expect(sidebarTransformOpen).toBe('matrix(1, 0, 0, 1, 0, 0)');

    await page.screenshot({ path: 'tests/screenshots/mobile-view-open.png', fullPage: true });
  });

  test('Tablet view - responsive layout (below 860px breakpoint)', async ({ page }) => {
    // 860px is the breakpoint, so test at 850px
    await page.setViewportSize({ width: 850, height: 1024 });
    await page.goto(BASE_URL + '#/about');
    await page.waitForLoadState('networkidle');

    const shell = page.locator('.shell');
    const gridTemplate = await shell.evaluate(el => getComputedStyle(el).gridTemplateColumns);
    expect(gridTemplate).toBe('1fr');

    // Sidebar should be fixed but off-screen
    const sidebar = page.locator('.sidebar');
    const sidebarPosition = await sidebar.evaluate(el => getComputedStyle(el).position);
    expect(sidebarPosition).toBe('fixed');

    await page.screenshot({ path: 'tests/screenshots/tablet-view.png', fullPage: true });
  });

  test('Desktop view at 860px+ uses sidebar layout', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto(BASE_URL + '#/about');
    await page.waitForLoadState('networkidle');

    const shell = page.locator('.shell');
    const gridTemplate = await shell.evaluate(el => getComputedStyle(el).gridTemplateColumns);
    expect(gridTemplate).toContain('240px');

    await page.screenshot({ path: 'tests/screenshots/desktop-900px.png', fullPage: true });
  });

  test('Navigation links work across breakpoints', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL + '#/about');
    await page.waitForLoadState('networkidle');

    // Test navigation to different sections
    const navLinks = [
      { href: '#/weeks', text: 'All weeks' },
      { href: '#/grammar', text: 'Grammar' },
      { href: '#/vocab', text: 'Vocabulary' },
      { href: '#/questions', text: 'Practice questions' },
      { href: '#/resources', text: 'Study Resources' },
    ];

    for (const link of navLinks) {
      await page.click(`a[data-nav="${link.href.replace('#', '')}"]`);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('h1')).toContainText(link.text, { timeout: 5000 });
    }
  });

  test('Content readability - no horizontal overflow', async ({ page }) => {
    const viewports = [
      { width: 1280, height: 800, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(BASE_URL + '#/about');
      await page.waitForLoadState('networkidle');

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });

      expect(hasHorizontalOverflow).toBe(false);

      await page.screenshot({ path: `tests/screenshots/${vp.name}-no-overflow.png`, fullPage: true });
    }
  });

  test('Sidebar scroll works independently', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(BASE_URL + '#/about');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('.sidebar');
    
    // Check if sidebar is scrollable
    const sidebarScrollHeight = await sidebar.evaluate(el => el.scrollHeight);
    const sidebarClientHeight = await sidebar.evaluate(el => el.clientHeight);
    const isScrollable = sidebarScrollHeight > sidebarClientHeight;
    
    if (isScrollable) {
      // Scroll sidebar content
      await sidebar.evaluate(el => el.scrollTop = 200);
      await page.waitForTimeout(100);
      
      const sidebarScrollTop = await sidebar.evaluate(el => el.scrollTop);
      expect(sidebarScrollTop).toBeGreaterThan(100);
    } else {
      // Sidebar content fits, verify no scroll needed
      expect(sidebarScrollHeight).toBeLessThanOrEqual(sidebarClientHeight);
    }

    // Page scroll should not affect sidebar position
    await page.evaluate(() => window.scrollTo(0, 500));
    const sidebarTop = await sidebar.evaluate(el => el.getBoundingClientRect().top);
    expect(sidebarTop).toBe(0);
  });
});