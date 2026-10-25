import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('creator attribution & branding', () => {
  const html = read('index.html');

  it('site title includes the creator name', () => {
    expect(html).toContain('<title>German I Study Desk | Jayesh Jadhav</title>');
  });

  it('meta description explains what the site helps with', () => {
    expect(html).toMatch(/meta name="description" content="[^"]*lessons[^"]*grammar[^"]*vocabulary[^"]*practice questions[^"]*revision/i);
  });

  it('declares the author', () => {
    expect(html).toContain('<meta name="author" content="Jayesh Jadhav" />');
  });

  it('has Open Graph metadata with title, description, image and type', () => {
    expect(html).toContain('property="og:type" content="website"');
    expect(html).toContain('property="og:title" content="German I Study Desk | Jayesh Jadhav"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:image" content="og.png"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
  });

  it('has Twitter card metadata', () => {
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toContain('name="twitter:image" content="og.png"');
  });

  it('links a favicon', () => {
    expect(html).toContain('rel="icon" type="image/svg+xml" href="favicon.svg"');
  });

  it('footer in main.ts credits the creator with a secure portfolio link', () => {
    const main = read('src/main.ts');
    expect(main).toContain('Designed & built by');
    expect(main).toContain('https://jayeshjadhav.com');
    expect(main).toMatch(/rel: 'noopener noreferrer'/);
    expect(main).toContain("href: '#/about'");
  });

  it('about page credits the creator and links the portfolio prominently', () => {
    const about = read('src/pages/about.ts');
    expect(about).toContain('https://jayeshjadhav.com');
    expect(about).toContain('Jayesh Jadhav');
    expect(about).toContain('noopener noreferrer');
    expect(about).toMatch(/independent/i);
    expect(about).toMatch(/Not an official NPTEL/);
  });

  it('route /about is registered and in the nav', () => {
    const main = read('src/main.ts');
    expect(main).toContain("route('/about', guard(renderAbout))");
    expect(main).toContain("href: '/about'");
  });

  it('per-route titles are set with the branded site title', () => {
    const main = read('src/main.ts');
    expect(main).toContain("const SITE_TITLE = 'German I Study Desk | Jayesh Jadhav'");
    expect(main).toContain('function setTitle(');
  });

  it('branding assets exist and are original (generated, non-trivial)', () => {
    const png = fs.readFileSync(path.join(ROOT, 'public', 'og.png'));
    // PNG magic bytes + 1200x630 IHDR
    expect(png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
    expect(png.length).toBeGreaterThan(1000);
    const svg = read('public/favicon.svg');
    expect(svg).toContain('<svg');
    expect(svg).toContain('German I Study Desk');
  });

  it('no intrusive overlays: no popup/redirect code in attribution paths', () => {
    const main = read('src/main.ts');
    const about = read('src/pages/about.ts');
    for (const src of [main, about]) {
      expect(src).not.toMatch(/alert\s*\(/);
      expect(src).not.toMatch(/window\.open/);
      expect(src).not.toMatch(/location\.reload/);
      expect(src).not.toMatch(/location\.href\s*=/);
    }
  });
});
