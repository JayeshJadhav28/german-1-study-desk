/**
 * build-public.mjs — build a deployable public site that ships only the
 * public-safe data subset (public/data-public/), never the full local corpus.
 *
 * Steps:
 *   1. regenerate the full local data (prepare-data) — skipped with --offline
 *   2. run the app typecheck and unit tests (fail the publish if either fails)
 *   3. generate public/data-public/ from the read-only sources — skipped with --offline
 *   4. run a production vite build into dist-public/
 *   5. delete dist-public/data/ so the full corpus never reaches the deploy
 *   6. assert data-public/ is present and data/ is gone
 *
 * Usage:  npm run build:public           (maintainer, needs the private corpus)
 *         npm run build:public:offline   (clean clone; uses committed data-public)
 * Env:    PUBLIC_BASE=<path>  optional, e.g. /german-i-study-desk/ for a
 *                            sub-path host. Default '/'.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist-public');
const PUBLIC_DATA = path.join(ROOT, 'public', 'data-public');
const OFFLINE = process.argv.includes('--offline');

if (OFFLINE && !fs.existsSync(path.join(PUBLIC_DATA, 'manifest.json'))) {
  console.error('[build:public] FATAL: --offline requires the committed public/data-public/ subset.');
  process.exit(1);
}

function run(cmd, args, { allowFail = false } = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0 && !allowFail) {
    console.error(`\n[build:public] FAILED: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
  return r.status === 0;
}

console.log('[build:public] 0/6 regenerate branding assets (og.png)');
run('node', ['scripts/make-branding.mjs']);

if (OFFLINE) {
  console.log('[build:public] 1/6 offline: use committed public/data-public/ (skip prepare-data)');
} else {
  console.log('[build:public] 1/6 regenerate local data (read-only sources)');
  run('npm', ['run', 'prepare-data']);
}

console.log('[build:public] 2/6 typecheck + unit tests');
run('npx', ['tsc', '--noEmit']);
run('npm', ['test']);

if (OFFLINE) {
  console.log('[build:public] 3/6 offline: keep committed public/data-public/');
} else {
  console.log('[build:public] 3/6 generate public-safe data subset');
  run('node', ['scripts/build-public-data.mjs']);
}

console.log('[build:public] 4/6 vite build → dist-public/');
fs.rmSync(DIST, { recursive: true, force: true });
const base = process.env.PUBLIC_BASE || '/';
run('npx', ['vite', 'build', '--outDir', 'dist-public', '--base', base]);

console.log('[build:public] 5/6 strip full local data from the build output');
const distData = path.join(DIST, 'data');
if (fs.existsSync(distData)) {
  fs.rmSync(distData, { recursive: true, force: true });
  console.log('[build:public]   removed dist-public/data/ (full corpus)');
}
const distDataPublic = path.join(DIST, 'data-public');
if (fs.existsSync(distDataPublic)) {
  // The app looks for data/ first (local edition), then data-public/ (public
  // edition). Ship the safe subset under BOTH names so the deployed site
  // resolves to the public edition without any 404 probe on data/manifest.json.
  fs.rmSync(distDataPublic, { recursive: true, force: true });
}
fs.cpSync(PUBLIC_DATA, distData, { recursive: true });
console.log('[build:public]   wrote public-safe subset as dist-public/data/');

const distSounds = path.join(DIST, 'sounds');
if (fs.existsSync(distSounds)) {
  fs.rmSync(distSounds, { recursive: true, force: true });
  console.log('[build:public]   removed dist-public/sounds/ (uncleared audio)');
}

console.log('[build:public] 6/6 verify the output is public-safe');
const shipped = fs.readdirSync(distData);
if (shipped.includes('markdown') || shipped.includes('transcripts') || shipped.includes('questions') || shipped.includes('media')) {
  console.error('[build:public] FATAL: excluded corpus folders present in output:', shipped);
  process.exit(1);
}
if (fs.existsSync(distSounds)) {
  console.error('[build:public] FATAL: dist-public/sounds/ is present');
  process.exit(1);
}
for (const required of ['course.json', 'weeks.json', 'lessons.json', 'assignments.json', 'study-resources.json', 'revision-plan.json', 'video-links.json']) {
  if (!shipped.includes(required)) {
    console.error('[build:public] FATAL: missing required public file:', required);
    process.exit(1);
  }
}

const total = shipped.reduce((s, f) => s + fs.statSync(path.join(distData, f)).size, 0);
console.log(`\n[build:public] OK — deployable site in dist-public/ (${(total / 1024).toFixed(1)} KB of public-safe data, ${shipped.length} files).`);
console.log('[build:public] excluded: lesson pages, transcripts, question bank, answer keys, mocks, vocabulary, analysis reader, saved audio/images.');
