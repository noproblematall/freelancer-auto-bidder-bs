# Growlance — Homepage Feature Inventory

> **Purpose.** A living inventory of every user-facing feature in Growlance, written in
> marketing-ready language and grouped for the future homepage. Whenever a feature ships,
> append/update the relevant section here so the homepage copy never drifts from reality.
>
> **Maintenance rules.**
> - Each feature has a **headline** (homepage section), a **one-line tagline**, a **what it does**
>   blurb, and **source refs** (file:line) so claims stay verifiable.
> - When you add or change a feature, update both the section and the changelog at the bottom.
> - Bump the "Last reviewed" date when doing a full pass.

**App version when last reviewed:** 1.1.4
**Last reviewed:** 2026-04-07

---

## The Pitch

**Growlance is a desktop AI co-pilot for Freelancer.com that finds the right projects, writes the proposal, places the bid, and keeps the conversation going — all from a private app on your own machine.**

It runs locally, stores nothing in the cloud, uses your own API keys, and gives you full control over targeting, pricing, schedule, and rate limits. Built for freelancers who want to spend more time delivering work and less time scanning job feeds.

**Tagline candidates**
- *Your AI bidding co-pilot. Local, private, on your terms.*
- *Stop refreshing the project feed. Start delivering work.*
- *AI proposals, smart targeting, real CRM — without the SaaS lock-in.*

---

## Hero Bullets (homepage above-the-fold)

- **AI-written proposals** that match each project's tone and scope
- **Smart targeting** by budget, type, country, language, and skills
- **Local-first & private** — your data, your machine, your API keys
- **Built-in CRM** — track every client you've worked with
- **Telegram alerts** for new messages, bids, and meetings
- **Cross-platform desktop** for macOS, Windows, and Linux

---

## Feature Sections

### 1. Automated Bidding Engine

**Tagline:** *Set your rules. Let Growlance bid while you build.*

A scheduled engine evaluates new Freelancer projects against your active profiles, asks GPT to score relevance, generates a custom proposal, and places the bid — within the rate limits and working hours you set.

- 5-minute scheduler cron with hourly + daily caps per profile
- Round-robin distribution across multiple active profiles
- Bid delay with ±25% jitter to avoid bot-like timing
- Won't bid twice on the same project; respects manual bids placed during the delay window
- Auto token refresh inside the 5-minute pre-expiry buffer

**Source:** [scheduler.js](backend/src/services/bidding/scheduler.js), [engine.js](backend/src/services/bidding/engine.js)

---

### 2. AI Proposal Generation

**Tagline:** *Human-quality proposals in milliseconds, every single time.*

OpenAI generates a fully customized proposal for each bid, respecting Freelancer's 1400-character limit. Auto-regenerates if the first draft is too long, and auto-injects bot-filter phrases when the project description requires them.

- Per-profile prompt template with sensible default
- Personalised with your skills, experience, and portfolio summary
- Detects six+ bot-filter phrasing patterns and prepends the required text
- Cached project analyses so the same project is never paid for twice

**Source:** [proposalGenerator.js](backend/src/services/openai/proposalGenerator.js), [botFilterDetector.js](backend/src/utils/botFilterDetector.js)

---

### 3. AI Relevance Scoring

**Tagline:** *Spend tokens on the projects that actually fit.*

Every candidate project is scored 0–100 by GPT for relevance to your profile. Below your per-profile threshold, it's silently skipped. Past clients automatically get a +15 boost.

- Configurable minimum threshold per profile (default 70)
- Detects red flags (vague scope, unrealistic budget, suspicious clients)
- Estimates project complexity (low/medium/high)
- Caches analysis per project — re-views are free

**Source:** [analyzer.js](backend/src/services/openai/analyzer.js)

---

### 4. Bid Profiles & Targeting

**Tagline:** *One profile per niche. Stack as many as you want.*

Build independent bidding profiles for each niche, technology, or budget tier. Run them all in parallel with fair project distribution.

- Per-profile keywords, job IDs, and search queries
- Separate budget bands for fixed-price and hourly projects
- Country whitelists, blacklists, regional exclusions, and per-country exceptions
- **Currency exclusions** — block projects denominated in specific currencies (catches INR/PKR/etc. listings posted from countries you'd otherwise allow)
- Language filters
- One-click activate/deactivate, duplicate, edit, delete

**Source:** [schema.prisma](backend/prisma/schema.prisma#L71-L117), [profiles.routes.js](backend/src/routes/profiles.routes.js)

---

### 5. Flexible Bid Pricing

**Tagline:** *Fixed, percentage, or AI-calculated — your call.*

Choose how each profile sets bid amount and timeline. Mix-and-match per profile.

**Bid amount strategies**
- **Auto (AI)** — GPT proposes a number based on budget and complexity
- **Fixed** — always your set amount
- **Percentage** — auto-percent of project budget (default 80%)

**Timeline strategies**
- **Fixed** — your default days
- **AI Formula** — `budget / (8 × hourly_rate)`, blended 90/10 with AI suggestion, clamped to your bounds

**Milestone payments** — per-profile percentage (default 100% upfront)

**Source:** [engine.js:504-561](backend/src/services/bidding/engine.js#L504-L561)

---

### 6. Working Hours & Rate Limits

**Tagline:** *Bid like a human. Not like a script.*

Set a master working window in your timezone and let Growlance pause itself outside of it. Layer per-profile hourly and daily caps on top.

- Timezone-aware schedule with start/end time and day-of-week selector
- Per-profile hourly limit (default 5/h) and daily limit (default 20/day)
- Most-restrictive limit always wins
- Tracks only `placed` bids — failed attempts don't count against quota
- Visual schedule preview in Settings

**Source:** [scheduleChecker.js](backend/src/services/bidding/scheduleChecker.js), [engine.js:34-62](backend/src/services/bidding/engine.js#L34-L62)

---

### 7. Client CRM

**Tagline:** *Every client you've ever won, in one place.*

Growlance automatically builds a client database from every converted bid. See who you've worked with, how much they've spent, and when you last shipped for them.

- Auto-tracked from converted bids (one row per Freelancer client)
- Total contract value, project count, last project date
- Editable per-client notes
- Country and username
- Backfill button to import historical clients via the Freelancer API

**Source:** [clients.routes.js](backend/src/routes/clients.routes.js), [schema.prisma:180-198](backend/prisma/schema.prisma#L180-L198)

---

### 8. Follow-Up Inbox

**Tagline:** *Never forget to reply to a paying client again.*

A focused view that surfaces threads where the client messaged you and you haven't replied in 12 hours, or where you messaged 24–48 hours ago and got no answer.

- Built from polled message threads
- Direct deep-links to each Freelancer conversation
- Helps prioritize the few replies that actually move the needle

**Source:** [clients.routes.js:44-100](backend/src/routes/clients.routes.js#L44-L100)

---

### 9. Message Polling & Meeting Detection

**Tagline:** *Growlance reads your inbox so you don't have to refresh it.*

Polls Freelancer messages every 2 minutes and uses GPT to detect when a client is asking to schedule a call.

- Recognizes Zoom, Skype, Google Meet, MS Teams, Webex, and more
- Two-tier detection: strong platform mentions OR scheduling phrases + time clues
- Extracts title, start time (UTC), end time, notes
- Auto-creates meetings on the calendar with project context

**Source:** [messagePoller.js](backend/src/services/messaging/messagePoller.js), [meetingDetector.js](backend/src/services/openai/meetingDetector.js)

---

### 10. Calendar & Meeting Reminders

**Tagline:** *Discover, edit, and never miss a client call.*

A built-in monthly calendar of every meeting Growlance has detected or you've added manually, with automatic reminders before each one.

- Month view grouped by date with project links
- Manual create/edit/delete with title, time, notes
- Telegram reminder fires 25–35 minutes before each meeting
- Reminders are sent only once per meeting
- Reminder flag auto-resets when you reschedule

**Source:** [meetings.routes.js](backend/src/routes/meetings.routes.js), [meetingReminder.js](backend/src/services/meetings/meetingReminder.js)

---

### 11. Telegram Notifications

**Tagline:** *Real-time push to your phone, with zero new accounts.*

Hook up your own Telegram bot once and Growlance pushes you every event that matters.

- **New client message** — sender name, project link, message preview
- **Bid placed** — project, amount, profile used, deep link
- **Bid failed** — error reason and project context
- **Meeting reminder** — title, project, exact start time
- **Test button** — verify connection in one click
- **Multiple chat IDs** — comma-separated for team or multi-device delivery

**Source:** [telegram.js](backend/src/services/notifications/telegram.js), [notifications.routes.js](backend/src/routes/notifications.routes.js)

---

### 12. Dashboard & Analytics

**Tagline:** *Every metric you'd build a spreadsheet for, already on screen.*

Open the app and see exactly how you're doing.

- Active profile count, projects found, bids placed (total / 7-day / 24-hour), conversion rate
- Bid history line chart with 7d / 30d / 90d toggle
- Status distribution chart (placed, converted, rejected, retracted, errored)
- Recent bids and recent scheduler activity feeds
- Schedule window indicator (bidding allowed / paused)

**Source:** [DashboardPage.jsx](frontend/src/pages/DashboardPage.jsx), [bids.routes.js](backend/src/routes/bids.routes.js)

---

### 13. Activity Logs / Audit Trail

**Tagline:** *Every decision Growlance makes, on the record.*

Every bid placed, profile change, scheduler run, token refresh, and credential update is appended to a tamper-evident log you can filter and search.

- Filter by category (scheduler, bids, profiles, credentials, etc.)
- Pagination with stats: total, last 24h, last 7d
- JSON detail expansion for each row
- Distinct labels and colours for each action type

**Source:** [activity.routes.js](backend/src/routes/activity.routes.js), [ActivityLogsPage.jsx](frontend/src/pages/ActivityLogsPage.jsx)

---

### 14. Project Discovery

**Tagline:** *A Freelancer search interface that doesn't fight you.*

Search and browse Freelancer projects with the same filters the engine uses, save them locally, and act on them manually if you want.

- Full-text search by title or description
- Budget, type, status, sort, and pagination
- Local cache of every discovered project
- One-click "analyse" for ad-hoc AI scoring
- Manual bid placement from the project detail modal

**Source:** [projects.routes.js](backend/src/routes/projects.routes.js), [ProjectsPage.jsx](frontend/src/pages/ProjectsPage.jsx)

---

### 15. Bid History & Manual Control

**Tagline:** *Drill into any bid you've ever placed.*

A complete bid log with status, amount, proposal text, and project link, plus the ability to manually retract a placed bid before the client responds.

- Filter by `placed`, `converted`, `rejected`, `retracted`, `pending`, `error`
- Search by project title
- Sort by date, amount, status
- Manual retract / re-place from the UI

**Source:** [bids.routes.js](backend/src/routes/bids.routes.js), [BidsPage.jsx](frontend/src/pages/BidsPage.jsx)

---

### 16. AI Model Selection & Auto-Fallback

**Tagline:** *Use the model you want — never get stuck when billing fails.*

Pick `gpt-4o-mini` for cost or `gpt-4o` for quality. If your premium model hits a billing or quota error, Growlance automatically falls back to `gpt-4o-mini` so bidding never silently stops.

- Per-user model selection in Settings
- Auto-fallback on `insufficient_quota` / `hard_limit_reached`
- Fallback events surfaced in the Activity feed so you know to top up

**Source:** [openai/client.js](backend/src/services/openai/client.js)

---

### 17. Privacy & Local-First Architecture

**Tagline:** *No cloud account. No telemetry. No vendor lock-in.*

Growlance is a desktop app. Everything runs on your machine.

- **SQLite** database stored in your OS user-data directory
- **No cloud sync, no telemetry** — nothing leaves your computer except direct API calls to Freelancer, OpenAI, and Telegram (using your own keys)
- **AES-256-CBC encryption** for all stored secrets (tokens, API keys, bot tokens)
- **Encryption key** auto-generated per install in a `0o600` secrets file
- **Per-user Freelancer API credentials** — each user registers their own Freelancer developer app, so OAuth and refresh run under their account, not the vendor's
- **No subscription** — buy once, run forever

**Source:** [tokenManager.js](backend/src/utils/tokenManager.js), [main.js](electron/main.js), [schema.prisma](backend/prisma/schema.prisma)

---

### 18. Cross-Platform Desktop App

**Tagline:** *Native installers for every major OS.*

- **macOS** — Apple Silicon and Intel x64 (`.dmg` + `.zip`)
- **Windows** — x64 NSIS installer
- **Linux** — x64 AppImage
- Built and signed by GitHub Actions on tag pushes
- Auto-runs DB migrations on launch via embedded `better-sqlite3`
- Launches an embedded Express backend on `localhost:3741` so the UI works offline (after auth)

**Source:** [electron-builder.yml](electron-builder.yml), [.github/workflows/build.yml](.github/workflows/build.yml), [main.js](electron/main.js)

---

## Marketing-Ready Differentiators

| | Growlance | Typical SaaS Bidder |
|---|---|---|
| Where your data lives | Your machine | Vendor cloud |
| Who pays for AI | You (your OpenAI key) | Vendor markup |
| Freelancer API credentials | Yours | Shared (TOS risk) |
| Subscription | None | Monthly |
| Telemetry | None | Usually yes |
| Source code | Open repo | Closed |

---

## Compliance Note (for honest copy)

Growlance includes a **manual review mode** path: turn off the scheduler and use the project list, AI scoring, and proposal generator as a research and drafting assistant. This is the recommended posture for users who want to bid only on projects they personally intend to deliver, in line with Freelancer.com's Code of Conduct.

The fully-automated mode is available, intentional, and disclosed — but the homepage should never imply spam-style usage. See `COMPLIANCE.md` in the repo for the long version.

---

## Changelog

Track every meaningful feature shipped, in reverse chronological order. Date in `YYYY-MM-DD`.

- **2026-04-07** — Per-profile excluded-currency filter — drops projects denominated in user-blocked currencies (e.g. INR, PKR) regardless of the listed client country
- **2026-04-06** — Per-user Freelancer API credentials (TOS compliance), version pill in Settings header, login resilience to status hydration failures, prisma client auto-regen on `npm run dist:*`
- **2026-04-06** — Calendar page with manual meeting CRUD, Telegram meeting reminders, message thread backfill, client country code normalisation
- **2026-03-28** — Client CRM (auto-tracking from converted bids, follow-up inbox), MessageThread model
- **2026-03-24** — Meeting model + AI meeting detection from polled messages
- **2026-03-20** — Renamed bid status `awarded` → `converted` across the codebase
- _Earlier versions: see git log_

---

## How to update this file when shipping a feature

1. Add or update the relevant section above with: tagline, what it does, source refs.
2. Append a one-line entry to the **Changelog** with the date.
3. If the feature is hero-worthy, add it to **Hero Bullets**.
4. If the feature changes the privacy/architecture story, update **Privacy & Local-First** and the **Differentiators** table.
5. Bump **Last reviewed** if you've done a full pass.
