<div align="center">

[![Logo](https://nptel.german-study-desk.workers.dev/favicon.svg)](https://nptel.german-study-desk.workers.dev/)

# German I Study Desk

A student-built study companion for NPTEL German I course resources and revision planning.

[![Live Website](https://img.shields.io/badge/Live%20Website-Open-blue?style=for-the-badge)](https://nptel.german-study-desk.workers.dev/)

[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![npm](https://img.shields.io/badge/npm-CB3837?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/)

</div>

---

> **⚠️ This is an independent student project and is not an official NPTEL or SWAYAM website. Always verify answers against your official course materials.**

---

## About

German I Study Desk is a Vite + TypeScript single-page application organizing course metadata, a 12-week syllabus, lesson titles, video links, assignments, external resources, and a revision checklist into a searchable interface.

## Features

- 12-week syllabus and course overview
- Lesson index with public video links
- 149 external study resources
- 7-day revision checklist
- Full-text search
- Responsive mobile/tablet/desktop layout
- Visitor counter (Cloudflare Durable Objects)
- About page with content rights information

## Public vs. Private Edition

| Edition        | Command                        | Output         | Contents                             |
| -------------- | ------------------------------ | -------------- | ------------------------------------ |
| Public-safe    | `npm run build`                | `dist-public/` | Metadata, links, revision plan       |
| Public offline | `npm run build:public:offline` | `dist-public/` | Uses committed `public/data-public/` |
| Private local  | `npm run build:local`          | `dist/`        | Full corpus + all features           |

**Public edition excludes:** lesson bodies, transcripts, answer keys, mock tests, vocabulary lists, downloaded media.

**Private local features:** grammar hub, vocabulary practice, question bank, mock tests, document readers, weightage charts, progress tracking.

## Course Details

| Field      | Value                                              |
| ---------- | -------------------------------------------------- |
| Course     | German - I                                         |
| Code       | `noc26_hs174`                                      |
| Instructor | Prof. Milind Brahme                                |
| Textbook   | NETZWERK Deutsch als Fremdsprache A1 (Goyal, 2015) |

**Exam:** 25 October 2026 — _verify against official NPTEL notice_  
**Scoring:** 25% assignments (best 8/12) + 75% exam  
**Certificate thresholds:** ≥10/25 assignment, ≥30/75 exam

## Tech Stack

- **Framework:** Vite + TypeScript
- **Testing:** Vitest, Playwright
- **Deployment:** Cloudflare Workers, Durable Objects
- **Utilities:** DOMPurify, Marked

## Getting Started

```bash
git clone <YOUR_REPOSITORY_URL>
cd german-i-study-desk
npm ci
npm run dev
```

Validate:

```bash
npm run typecheck && npm test && npm run build
```

## npm Scripts

**Development:** `dev`, `preview`, `preview:public`  
**Build:** `build`, `build:local`, `build:public:offline`  
**Data:** `import-data`, `import-resources`, `prepare-data`, `validate-data`  
**Testing:** `test`, `test:worker`, `test:all`  
**Other:** `make-branding`, `typecheck`, `typecheck:worker`

## Deployment

```bash
npm run build
npx wrangler deploy --dry-run
npx wrangler deploy
```

Configuration via `wrangler.toml` targeting `dist-public/`. Requires Cloudflare account setup.

## Validation Results

| Check             | Result                          |
| ----------------- | ------------------------------- |
| Typecheck         | ✅ Passed                       |
| Unit tests        | ✅ 131 passed                   |
| Worker tests      | ✅ 12 passed                    |
| Clean-clone tests | ✅ 108 passed, 23 skipped       |
| Public build      | ✅ Passed (~305 KB, 8 files)    |
| npm audit         | ⚠️ 5 vulnerabilities (dev deps) |

## Data & Privacy

- Progress stored in `localStorage` under `german-i-study-desk:v1`
- Course data not sent to external APIs/
- HTML sanitized with DOMPurify
- Visitor counter sends UUIDs to `/api/visitor/heartbeat`
- External links use `rel="noopener noreferrer"`

Original third-party materials remain the property of their respective owners. Only content with confirmed redistribution rights is published here; lesson bodies, transcripts, questions, answer keys, mock tests, vocabulary, and downloaded media stay in the private local edition.

## Limitations

- Not an official NPTEL/SWAYAM resource
- Public edition intentionally limited
- Verify exam date and scoring with official NPTEL notice
- Resource categories may be inferred
- 5 npm audit findings in dev dependencies pending review

## Author

**[Jayesh Jadhav](https://jayeshjadhav.com)** — Student-made project for convenient course navigation and study planning.

---

**Last updated:** October 2026
