# Playlab Sales Hub

Vanilla JS app serving as the Playlab Sales Hub — includes a package builder, pricing reference, quote library, key resources, and a welcome landing page. No build step, no framework. Deployed via GitHub Pages from `main` branch.

## File Structure
- `index.html` — HTML structure, modals, Pricing Sheet tables
- `style.css` — All styles
- `app.js` — All logic (~2,800 lines)

## Cache Busting
After pushing changes, bump the version param in `index.html` for both `app.js?v=` and `style.css?v=` to force browsers to load the new version. GitHub Pages CDN caches aggressively.

## Tabs
- **Welcome** (default) — Landing page linking to other tabs (`#welcomeView`)
- **Builder** — Package builder for service quotes (`.builder`)
- **Pricing Sheet** — Reference pricing tables (`#pricingView`)
- **Key Resources** — Embedded Google Docs/Sheets/Slides (`#resourcesView`)

## Auth
Passphrase gate using SHA-256 hash stored in `app.js`. Persists for the browser session via `sessionStorage`.

## Rules & Pricing Source of Truth

All pricing, business rules, and requirements are maintained in this Google Doc:

**[Playlab Sales Hub — Rules & Pricing](https://docs.google.com/document/d/1oNTf-jdb5tAlrg2kVbXAa5AJ0jrCKz3Hj3YQrNLjk-8/edit)**

> Doc ID: `1oNTf-jdb5tAlrg2kVbXAa5AJ0jrCKz3Hj3YQrNLjk-8`

Read this doc at the start of every conversation before making changes to the app. Use the gdrive MCP to fetch the latest version.

## Key Architecture Notes
- All prices derive from 3 base rates (LP $250, Dev $200, Travel $125) via `getBlockPrice()`
- Package components are static (defined in `PACKAGES`); support items (Launch Meeting, Office Hours, Check-ins, Reflection) are auto-included by `confirmAddPackage()` via `getSupportDefaults()`
- Software tiers defined in `SOFTWARE_TIERS` array
- Quote state is serialized to URL hash (base64 JSON) for shareable links
- Multi-tab quotes persist in `localStorage`
- State hydration is centralized in `hydrateState()` — used by both URL loading and tab switching

## Quote Library
Team-shared quote library backed by the private repo `nkelloggplaylab/playlab-quotes` via GitHub Contents API.

- **Single directory**: All quotes live in `quotes/`. No file moves for archive/restore.
- **Index**: `quotes/index.json` stores metadata for all quotes. Each entry has `partnerName`, `savedAt`, `savedBy`, and `status` (`active` or `archived`).
- **Archive/restore**: Flips the `status` field in the index (2 API calls). Quote files never move.
- **Index updates**: `patchIndex(fn)` applies a mutation function with 409 conflict handling (read-merge-retry).
- **Listing**: `listQuotesByStatus()` reads `index.json` (1 API call). Auto-rebuilds if index is missing.
- **Auth**: Fine-grained GitHub PAT stored in `localStorage`. Username fetched from `/user` on setup for `savedBy` attribution.
- **UI**: Library button pinned left of tab bar. Modal with Active/Archived tabs. Repair button triggers `rebuildIndex()`.
- **Key functions**: `saveQuoteToLibrary`, `loadQuoteFromLibrary`, `archiveQuote`, `restoreQuote`, `patchIndex`, `readIndex`, `rebuildIndex`, `listQuotesByStatus`
