/**
 * make-branding.mjs — generate the original branding assets for German I
 * Study Desk from scratch (no external images, no course content):
 *
 *   public/og.png   — 1200x630 Open Graph / social preview image
 *   (public/favicon.svg is hand-maintained and not touched here)
 *
 * The image is drawn programmatically: warm paper background, the site's
 * wine accent, an abstract black/red/gold stripe (a generic German-colour
 * nod — not any official emblem), and short project text rendered with a
 * built-in 5x7 bitmap font. Fully offline; uses only node:zlib + node:fs.
 *
 * Usage:  node scripts/make-branding.mjs
 * Called automatically from scripts/build-public.mjs (step 0).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '..', 'public');

/* ------------------------------------------------------------------ */
/* Minimal PNG encoder (8-bit RGB, no interlace)                       */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/* Canvas helpers                                                      */
/* ------------------------------------------------------------------ */

class Canvas {
  constructor(w, h, bg) {
    this.w = w; this.h = h;
    this.px = Buffer.alloc(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  set(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.px[i] = r; this.px[i + 1] = g; this.px[i + 2] = b;
  }
  fillRect(x, y, w, h, [r, g, b]) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) this.set(xx, yy, [r, g, b]);
    }
  }
  toPng() { return encodePng(this.w, this.h, this.px); }
}

/* ------------------------------------------------------------------ */
/* 5x7 uppercase bitmap font (original glyphs, A–Z 0–9 and a few marks) */
/* ------------------------------------------------------------------ */

const FONT = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01110','10001','10000','10000','10000','10001','01110'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01110'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01110','10001','10000','01110','00001','10001','01110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00110','01000','10000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ',': ['00000','00000','00000','00000','00110','00100','01000'],
  '-': ['00000','00000','00000','01110','00000','00000','00000'],
  '·': ['00000','00000','01100','01100','00000','00000','00000'],
  '&': ['01100','10010','10010','01100','10101','10010','01101'],
  "'": ['00100','00100','01000','00000','00000','00000','00000'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
};

/** Draw uppercase text; returns the advance width in pixels. */
function drawText(cv, text, x, y, scale, [r, g, b]) {
  let cx = x;
  for (const chRaw of text.toUpperCase()) {
    const glyph = FONT[chRaw] ?? FONT[' '];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === '1') {
          cv.fillRect(cx + col * scale, y + row * scale, scale, scale, [r, g, b]);
        }
      }
    }
    cx += 6 * scale; // 5 px glyph + 1 px gap
  }
  return cx - x;
}

function textWidth(text, scale) { return text.length * 6 * scale - scale; }

/* ------------------------------------------------------------------ */
/* Draw the card                                                       */
/* ------------------------------------------------------------------ */

const W = 1200, H = 630;
const PAPER = [246, 244, 239];   // --bg
const SURFACE = [255, 253, 249]; // --surface
const WINE = [122, 46, 46];      // --accent
const WINE_DEEP = [94, 34, 34];  // --accent-strong
const INK = [35, 32, 26];        // --ink
const INK_SOFT = [92, 86, 76];   // --ink-soft
const LINE = [221, 214, 200];    // --line
const BLACK = [26, 26, 26];
const RED = [160, 44, 44];
const GOLD = [217, 165, 33];

const cv = new Canvas(W, H, PAPER);

// Framed surface card
cv.fillRect(60, 60, W - 120, H - 120, SURFACE);
// 2px wine border around the card
for (let i = 0; i < 3; i += 1) {
  cv.fillRect(60, 60 + i, W - 120, 1, WINE);
  cv.fillRect(60, H - 61 - i, W - 120, 1, WINE);
  cv.fillRect(60 + i, 60, 1, H - 120, WINE);
  cv.fillRect(W - 61 - i, 60, 1, H - 120, WINE);
}

// Abstract black/red/gold stripe inside the card (generic colour nod)
cv.fillRect(60, 60, W - 120, 10, BLACK);
cv.fillRect(60, 70, W - 120, 10, RED);
cv.fillRect(60, 80, W - 120, 10, GOLD);

// Small "G1" mark on the left
const markScale = 6;
const markW = textWidth('G1', markScale);
drawText(cv, 'G1', 110, 140, markScale, WINE);
// short rule under the mark
cv.fillRect(110, 140 + 7 * markScale + 14, markW, 4, GOLD);

// Title
const titleScale = 8;
drawText(cv, 'GERMAN I', 110, 280, titleScale, INK);
drawText(cv, 'STUDY DESK', 110, 280 + 7 * titleScale + 22, titleScale, WINE);

// Feature line
const featScale = 3;
drawText(cv, 'LESSONS · GRAMMAR · VOCABULARY', 110, 448, featScale, INK_SOFT);
drawText(cv, 'PRACTICE QUESTIONS · REVISION', 110, 448 + 7 * featScale + 14, featScale, INK_SOFT);

// Creator credit, right-aligned block
const creditScale = 3;
const credit1 = 'DESIGNED & BUILT BY';
const credit2 = 'JAYESH JADHAV';
const c1w = textWidth(credit1, creditScale);
const c2w = textWidth(credit2, creditScale);
const creditX = W - 110 - Math.max(c1w, c2w);
drawText(cv, credit1, creditX, 448, creditScale, INK_SOFT);
drawText(cv, credit2, creditX, 448 + 7 * creditScale + 14, creditScale, WINE_DEEP);

// Footer strip: independence note
const footScale = 2;
const foot = 'AN INDEPENDENT LEARNING PROJECT - NOT AN OFFICIAL NPTEL SITE';
drawText(cv, foot, 110, H - 105, footScale, INK_SOFT);

const out = path.join(PUBLIC, 'og.png');
fs.writeFileSync(out, cv.toPng());
console.log(`[make-branding] wrote ${out} (${W}x${H}, ${fs.statSync(out).size} bytes)`);
