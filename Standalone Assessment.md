# Auto-Bidder: Standalone Application Assessment

**Date**: February 14, 2026
**Scope**: Can this project be packaged as a standalone desktop application executable on Windows and macOS without any external backend or developer tooling?

---

## Executive Summary

**Yes — this project is a strong candidate for standalone packaging.**

The architecture is inherently favorable: the database is already SQLite (file-based), the backend is Node.js (bundleable), and the frontend is a React SPA (compiles to static files). The only unavoidable internet dependencies are **Freelancer.com** and **OpenAI**, which are external *services* — not backends — and will always require a live internet connection regardless of how the app is packaged.

---

## Current Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│              Frontend (React + Vite)                 │
│              Served via Nginx on port 8080           │
└───────────────────────┬─────────────────────────────┘
                        │ REST API (/api/*)
┌───────────────────────▼─────────────────────────────┐
│           Backend (Node.js + Express)                │
│           Running on port 3001                       │
│                                                      │
│  Auth │ Scheduler (node-cron) │ Bidding Engine       │
│  Freelancer API Client │ OpenAI API Client           │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│         Database (SQLite — file-based)               │
│         prisma/dev.db or prisma/prod.db              │
└─────────────────────────────────────────────────────┘
```

**Deployed today via**: Docker + docker-compose
**Target**: Single installable binary/app for Windows and macOS

---

## Factors Working in Favor of Standalone

| Factor | Current State | Standalone Impact |
|---|---|---|
| Database | SQLite (file-based) | No external DB server needed |
| Backend language | Node.js | Easily bundleable with Electron or `pkg` |
| Frontend | React SPA | Compiles to static files |
| External services | Freelancer.com + OpenAI only | Internet required — unavoidable |
| State management | React Context only | No Redis, no message queues |
| Background jobs | node-cron (in-process) | Works without modification |
| File storage | None | No S3 or disk complications |

---

## What Will Always Require Internet

These two integrations cannot be embedded — they are third-party services:

1. **Freelancer.com API** — Project search, bid placement, OAuth authentication
2. **OpenAI API** — Project analysis, proposal generation

The app will need internet connectivity to function, but it does **not** need any cloud-hosted backend, VPS, or server infrastructure.

---

## Two Viable Approaches

---

### Option A — Electron Desktop App ✅ Recommended

Package the entire app as a native desktop application. The Electron **main process** runs the Express backend; the Electron **renderer window** loads the React frontend.

**What the end user gets:**
- A standard `.exe` installer on Windows / `.dmg` on macOS
- A native app window — no browser required, no Node.js installation needed
- Optional system tray icon with minimize-to-tray
- Optional auto-start on login
- App data stored in the OS user data directory (AppData on Windows, Application Support on macOS)

**High-level architecture in Electron:**

```
Electron Main Process
├── Starts Express backend (Node.js, port 3001)
├── Runs Prisma migrations on first launch
├── Manages app lifecycle (quit, tray, auto-launch)
└── Opens BrowserWindow → loads http://localhost:3001 or built React assets

Electron Renderer (BrowserWindow)
└── React SPA (same frontend, no changes required)

SQLite Database
└── Stored in app.getPath('userData') — OS-managed app data directory
    Windows: C:\Users\{user}\AppData\Roaming\AutoBidder\
    macOS:   ~/Library/Application Support/AutoBidder/
```

---

#### Challenges & How to Solve Them

**1. Prisma Native Binaries** *(Medium complexity)*

Prisma uses platform-specific compiled query engine binaries to interface with SQLite. These binaries must be included in the packaged app for each target OS.

- Set `PRISMA_QUERY_ENGINE_TYPE=binary` in the Prisma generator
- Use `electron-rebuild` to recompile native addons for the Electron version
- Configure `electron-builder` to include the correct binary for each platform target
- The `prisma.schema` already uses SQLite, so no provider changes are needed

**2. Freelancer OAuth Redirect** *(Medium complexity)*

The OAuth flow redirects users to Freelancer.com, which then redirects back to `http://localhost:3001/api/auth/freelancer/callback`. In a packaged Electron app, the Express server is running locally, so this redirect will work — but the flow opens a browser tab.

Two options:
- **Keep localhost redirect** — Express handles the callback as normal; the user sees a browser tab open and close. Simple, requires no code change to the OAuth logic.
- **Custom protocol (deep link)** — Register `autobidder://oauth` as a system protocol. Freelancer redirects to `autobidder://oauth/callback?code=...`, Electron intercepts it in the main process and exchanges the code. Cleaner UX but more implementation work.

**3. Database Path** *(Low complexity)*

Currently the database path is controlled by `DATABASE_URL` env var, defaulting to `file:./dev.db`. In a packaged app, the working directory is not writable.

- At startup, detect if running in Electron and set `DATABASE_URL` to `app.getPath('userData') + '/autobidder.db'`
- This is a small change to [backend/src/config/env.js](backend/src/config/env.js)

**4. Database Migrations on First Launch** *(Low complexity)*

Currently migrations are run manually via `npm run db:migrate`. In the packaged app:

- Bundle migration SQL files with the app
- On startup, call `prisma.migrate.deploy()` programmatically before starting the Express server
- This ensures the schema is always up to date after an app update

**5. Environment Variables / Configuration** *(Low complexity)*

There is no `.env` file in a packaged Electron app. The config layer needs to:

- Generate `JWT_SECRET` and `ENCRYPTION_KEY` on first launch and persist them to `userData`
- Load these from `userData` on subsequent launches
- `FREELANCER_CLIENT_ID`, `FREELANCER_CLIENT_SECRET`, and API keys are already stored by users in the Settings UI, so they don't need to be env vars

**6. Bundle Size** *(Informational)*

Electron bundles Chromium and Node.js. Expect:
- Windows installer: ~180–280 MB
- macOS `.dmg`: ~200–320 MB

This is normal for Electron apps (VS Code ~100 MB, Slack ~200 MB, Discord ~250 MB). Users install once; updates are incremental.

**7. Code Signing** *(High — required for distribution)*

Without code signing:
- **Windows**: SmartScreen shows "Unknown publisher" warning. Users can bypass via right-click → Run anyway.
- **macOS**: Gatekeeper blocks the app with "unidentified developer". Users can bypass via System Settings → Privacy & Security → Open Anyway.

For personal/internal use, this is acceptable. For distribution to others:
- **macOS**: Requires Apple Developer Program membership (~$99/yr), code signing certificate, and notarization
- **Windows**: Requires an EV Code Signing Certificate (~$300–500/yr from DigiCert, Sectigo, etc.)

---

### Option B — Lightweight Node.js Executable (Simpler, Less App-like)

Compile the backend into a standalone binary using **Node.js Single Executable Applications (SEA)** (built into Node.js 20+) or the `pkg` tool. The built React frontend is served as static files from Express. Users run the binary and open their browser to `http://localhost:3001`.

**What the end user gets:**
- A single `.exe` (Windows) or binary file (macOS) — no installation required
- Runs from the terminal or by double-clicking; opens in default browser
- Much smaller size: ~30–80 MB

**Tradeoffs vs Electron:**

| | Option A (Electron) | Option B (Node.js SEA/pkg) |
|---|---|---|
| UX | Native app window | Browser tab |
| Distribution | Standard installer | Copy binary anywhere |
| Size | ~200–300 MB | ~30–80 MB |
| Prisma compatibility | Good (with electron-rebuild) | Problematic — native binaries break with SEA/pkg |
| System tray / OS integration | Yes | No |
| Effort | Moderate | Low–Moderate (Prisma issues offset the simplicity) |

> **Note on Prisma + pkg**: The Prisma query engine is a native binary that cannot be bundled into a single executable by `pkg`. It must be distributed as a sidecar file alongside the binary. This adds complexity and essentially means you end up distributing 2–3 files rather than one. `better-sqlite3` (a pure JS alternative) could replace Prisma's SQLite driver to avoid this, but that requires schema migration logic to be rewritten.

---

## Recommended Approach: Electron

Given the existing architecture, Electron is the best fit because:

1. The backend is already Node.js — Electron's main process *is* Node.js
2. The frontend is already a React SPA — no changes needed
3. SQLite is already the database — Prisma + Electron is a well-documented combination
4. The scheduler (node-cron) runs in-process — works without modification
5. The result is a professional, distributable desktop application

---

## Files That Need Changes for Electron

| File | Change Required |
|---|---|
| [backend/src/index.js](backend/src/index.js) | Export the Express app; don't call `app.listen()` directly — let Electron main process start it |
| [backend/src/config/env.js](backend/src/config/env.js) | Make `DATABASE_URL`, `JWT_SECRET`, and `ENCRYPTION_KEY` runtime-configurable, falling back to `userData` directory |
| [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | Add `binaryTargets` to the generator block for Windows + macOS (x64 and arm64) |
| [frontend/src/services/api.js](frontend/src/services/api.js) | Set API base URL to `http://localhost:3001/api` explicitly (remove Vite proxy dependency) |
| **New**: `electron/main.js` | Electron entry point — starts Express, opens BrowserWindow, handles tray, lifecycle |
| **New**: `electron-builder.yml` | Packaging configuration (targets, icons, signing, publish) |
| **New**: `electron/preload.js` | Minimal preload script for contextBridge (if needed) |

---

## New Files Required

### `electron/main.js` (responsibilities)
- Start the Express backend on a free port
- Run Prisma migrations programmatically on first launch
- Create the main `BrowserWindow` pointing to `http://localhost:{port}`
- Handle the Freelancer OAuth callback (intercept the redirect in a hidden BrowserWindow or via protocol handler)
- Create a system tray icon
- Handle app quit cleanly (stop the scheduler, close DB connection)
- Generate and persist `JWT_SECRET` and `ENCRYPTION_KEY` to `userData` on first run

### `electron-builder.yml` (targets)
```yaml
appId: com.autobidder.app
productName: Auto Bidder
directories:
  output: dist-electron
files:
  - electron/**/*
  - backend/**/*
  - frontend/dist/**/*
  - "!backend/prisma/*.db"        # exclude dev database
  - "!backend/node_modules/.cache"
extraResources:
  - from: backend/prisma/
    to: prisma/
    filter: ["*.prisma", "migrations/**"]
win:
  target: nsis                    # Windows installer (.exe)
  icon: assets/icon.ico
mac:
  target: dmg                     # macOS disk image (.dmg)
  icon: assets/icon.icns
  hardenedRuntime: true           # required for notarization
  entitlements: assets/entitlements.mac.plist
linux:
  target: AppImage
  icon: assets/icon.png
```

---

## Implementation Work Estimate

| Task | Complexity | Notes |
|---|---|---|
| Electron main process (start Express, open window) | Low | ~100–150 lines |
| Move DB path to `userData` | Low | Single config change |
| Programmatic migration on startup | Low | `prisma.$executeRaw` or `migrate deploy` |
| Prisma binary targets + `electron-rebuild` | Medium | Config + build pipeline |
| OAuth redirect in Electron | Medium | Hidden BrowserWindow approach |
| Auto-generate secrets on first run | Low | Write to `userData/config.json` |
| `electron-builder` packaging config | Low | Config file, test both platforms |
| System tray icon | Low | Optional, ~50 lines |
| Code signing (macOS + Windows) | High | Requires paid certificates |
| Auto-updater (`electron-updater`) | Medium | Optional |

**Estimated effort to reach a working, unsigned installable app**: 3–5 focused days.
**Estimated effort to reach a signed, distributable release**: Add 1–2 days for certificate setup.

---

## Platform-Specific Notes

### Windows
- Target: `nsis` installer (`.exe`) — creates Start Menu entries, uninstaller, and Program Files install
- Prisma binary target: `windows` (x64) and optionally `windows-arm64`
- SmartScreen warning without EV certificate — acceptable for personal use
- SQLite DB path: `C:\Users\{user}\AppData\Roaming\AutoBidder\autobidder.db`

### macOS
- Target: `dmg` disk image — drag-to-Applications flow
- Must support both **Intel (x64)** and **Apple Silicon (arm64)** — use `universal` target in electron-builder
- Gatekeeper warning without Apple Developer certificate
- SQLite DB path: `~/Library/Application Support/AutoBidder/autobidder.db`
- For distribution: requires notarization via `electron-notarize`

---

## What Does NOT Change

The following requires **zero modification** for standalone packaging:

- All React frontend components and pages
- All Express API routes and middleware
- The bidding engine and scheduler logic
- The Freelancer API client and OpenAI integration
- The Prisma schema (beyond adding binary targets)
- The authentication system (JWT + bcrypt)
- Token encryption (AES-256-CBC)

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Prisma native binaries fail to bundle | Medium | Use `electron-rebuild`, set `binaryTargets`, test on both platforms early |
| OAuth flow broken in Electron | Low | Use hidden BrowserWindow to capture redirect; well-documented pattern |
| Port conflict (3001 already in use) | Low | Scan for free port at startup using `portfinder` or similar |
| App update breaks existing DB | Low | Always run `migrate deploy` on startup; Prisma handles this safely |
| macOS Gatekeeper blocks app | High (unsigned) | Acceptable for personal use; fix with Apple Developer account for distribution |

---

## Conclusion

The Auto-Bidder project can be converted into a fully standalone desktop application for Windows and macOS. The existing architecture — Node.js backend, React frontend, SQLite database — maps almost directly onto an Electron application with minimal structural changes required.

The core application logic (bidding engine, scheduler, API integrations, authentication) needs **no modification**. The work is primarily in wiring up the Electron shell, adjusting the config/database path handling, and setting up the packaging pipeline.

**Recommended next step**: Implement the Electron main process and validate Prisma binary bundling on both target platforms before investing in code signing and distribution infrastructure.
