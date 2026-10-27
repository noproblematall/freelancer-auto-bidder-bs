# Growlance — Future Enhancements Review

> Codebase review for future reference. Generated 2026-06-06.
> Scope: full review of the Electron + Express + React + Prisma/SQLite app
> across four subsystems — bidding/scheduler, AI/messaging, frontend, and
> Electron/build/security.
>
> **Caveat:** Line numbers and some specifics come from exploratory analysis
> and are accurate enough to navigate by, but should be confirmed before
> editing. Not every claim has been independently re-verified at the code level.

---

## The big picture

Growlance is a well-built **single-user desktop app** (Electron + in-process
Express + React + Prisma/SQLite) for automating Freelancer.com bidding. The code
is mature for its scope — good security fundamentals, clean separation, and
thoughtful error handling in many places.

Enhancement opportunities cluster into six themes, ordered below by how much
they affect the ability to **ship and sell this safely**.

---

## 1. 🔴 Compliance & product risk (address first — this is being sold)

The single most important area — it determines whether the product is sellable
at all.

- **No manual-review mode.** `COMPLIANCE.md` flags that fully-automatic bidding
  violates Freelancer.com's Code of Conduct ("only bid on projects I plan to
  complete"). For a sold product this is both a policy risk for users (account
  bans) and a vendor liability.
  - **Enhancement:** add an opt-in approval queue — engine saves bids as
    `pending_review`, user approves in a "Pending Bids" page before placement.
    The `Bid` model already has a `status` field to support this.
- **Hardcoded proposal identity.** Proposals open with a fixed line and sign-off
  (hardcoded name in the prompt). If sold to many users, every customer sends
  near-identical proposals — a detectable pattern that hurts them and the
  product's reputation.
  - **Enhancement:** make name/opening/templates per-profile and rotate phrasing.
- **First-run responsibility acknowledgment** ("you are responsible for automated
  bids") protects the vendor legally.

## 2. 🟠 Robustness & resilience (the engine that earns money)

The bidding pipeline is the core value and has single points of failure.

- **One fatal-looking error deactivates ALL profiles**
  (`backend/src/services/bidding/scheduler.js`). A transient network blip that
  matches a fatal-error string silently stops the user's entire automation.
  Add transient-vs-fatal classification + a grace period.
- **OpenAI failure cascades** — a single analysis failure can skip remaining
  projects in a run (`backend/src/services/bidding/engine.js`). Add per-project
  retry with backoff and a deterministic keyword-matching fallback when OpenAI
  is down.
- **Sequential profile processing** — N profiles run one-after-another; one slow
  profile stalls the whole cycle. Add per-profile timeouts and bounded
  parallelism (`Promise.allSettled` + a small semaphore).
- **POST bids aren't retried and have no idempotency key**
  (`backend/src/services/freelancer/client.js`,
  `backend/src/services/freelancer/bids.js`) — a 5xx on placement is terminal
  even when the bid may have succeeded. Add idempotency keys so retries are safe.
- **Message poller loses messages after >30 min downtime**
  (`backend/src/services/messaging/messagePoller.js`, `MAX_LOOKBACK_MS`).
  Extend the catch-up window on first poll after restart.
- **No persistent retry queue for Telegram**
  (`backend/src/services/notifications/telegram.js`) — failed notifications are
  lost. A small DB-backed retry queue fixes this.

## 3. 🟠 Build, release & distribution (required to actually sell it)

For a paid desktop product these are blockers, not nice-to-haves.

- **No code signing or notarization** (`electron-builder.yml`,
  `.github/workflows/build.yml` — `sign: false`,
  `CSC_IDENTITY_AUTO_DISCOVERY: false`). Users currently see "damaged app"
  (macOS) and "Unknown publisher" (Windows) warnings — a trust-killer for paying
  customers. Needs an Apple Developer ID + a Windows code-signing cert.
- **No auto-update mechanism** (no `electron-updater`). Selling software means
  shipping fixes; without auto-update, field patching of the compliance/
  robustness issues above is impossible. High leverage.
- **No Electron fuses** applied (`@electron/fuses` is a devDependency but unused
  in `electron/afterPack.js`). Disable `RunAsNode`, enable cookie encryption,
  etc. — cheap hardening.
- **CI doesn't run tests or lint** before building releases.

## 4. 🟡 Test coverage (currently the weakest area)

- **Backend: one test file** (`backend/tests/utils/tokenManager.test.js`). The
  bidding engine, scheduler, schedule-checker, auth middleware, and all routes
  are untested — despite mocks for Freelancer/OpenAI already existing in
  `backend/tests/mocks/`.
- **Frontend: zero tests** (config and a `renderWithAuth` helper exist, but no
  specs).
- Highest-value first tests: the bidding engine's filter/pricing logic,
  `scheduleChecker` (timezone/DST edge cases), and auth. These are where a silent
  regression costs real money.

## 5. 🟡 Frontend UX & quality

- **Silent failures** in several pages (Dashboard, Projects, Settings catch
  errors and discard them) — users don't know why data is stale or missing. A
  global toast/notification system would surface these.
- **Large components**: `SettingsPage.jsx` (~1,160 lines), `DashboardPage.jsx`
  (~690), `BidsPage.jsx` (~650). Splitting improves performance and testability.
- **Duplication**: country-code→flag and status-color maps are copy-pasted across
  4–5 files; polling logic is reimplemented per page. Extract
  `utils/countryUtils.js`, `utils/statusColors.js`, and a `usePolling` hook
  (with visibility-awareness — `frontend/src/components/Layout/Header.jsx`
  already does this well; other pages poll in background tabs).
- **Accessibility**: modals lack focus traps and `role="alertdialog"`; status is
  conveyed by color alone. Worth a pass for broad appeal.
- **URL state**: filters on Bids/Projects pages are lost on refresh — move to
  `useSearchParams`.

## 6. 🟢 Cost, security hardening & polish

- **OpenAI cost control**: no per-user token budgeting or analysis caching
  (`backend/src/services/openai/analyzer.js`). Re-analyzing the same project,
  oversized-proposal regeneration (3× cost when 1 char over the limit in
  `backend/src/services/openai/proposalGenerator.js`), and the silent
  gpt-4o→gpt-4o-mini fallback all cost money/quality with no visibility. Add
  caching + a daily token cap + a user-facing alert on model downgrade.
- **Token encryption** (`backend/src/utils/tokenManager.js`): AES-256-CBC with no
  HMAC (no tamper detection) and a single static key. Add HMAC integrity and a
  versioned format for future key rotation.
- **Disabled middleware**: `requestLogger` and `performanceMetrics` are commented
  out in `backend/src/index.js` (lines ~34-35) "to reduce log noise" — make them
  `LOG_LEVEL`-conditional rather than dead code.
- **Multi-user note**: several services use `findFirst()` assuming one user —
  correct for the standalone desktop model, but it bounds the app to
  single-user-per-install. Worth a conscious decision before any hosted/SaaS tier.

---

## Detailed findings by file

### Backend — bidding subsystem

- **`engine.js`** — Core pipeline (search → filter → AI analyze → proposal →
  price → place). Limitations: single-threaded per profile; max 50 projects per
  search with no pagination; rate-limiting counts only placed bids (not API
  calls); OpenAI failure can cascade; jitter only on delay, not amounts/timing;
  bid params (amount/period/proposal length) not validated before the Freelancer
  call.
- **`scheduler.js`** — Cron orchestration. Single global `isRunning` flag (one
  hung profile skips the whole cycle); fatal-error detection deactivates all
  profiles with no grace period; stall detection is coarse and throttled to once
  per hour; activity-log bloat (logs every check, even when idle); stale-pending
  cleanup tied to the largest `bidDelaySeconds`.
- **`scheduleChecker.js`** — Timezone-aware windows. No explicit DST handling;
  `scheduleDays` encoding undocumented (off-by-one risk); fail-OPEN on timezone
  parse errors (silently ignores the schedule). Consider fail-closed +
  validation at profile save time + a DST-aware library (`date-fns-tz`).
- **`freelancer/client.js`** — Axios wrapper; retry never applies to POST;
  hardcoded `[1s,2s,4s]` backoff; no circuit breaker; no idempotency.
- **`freelancer/bids.js`** — Uses an undocumented `?action=seal` endpoint with
  fragile fallback verification; generic error messages (can't distinguish
  "already bid" vs "insufficient funds" vs "suspended"); retract response unused.
- **`freelancer/projects.js`** — No pagination; `total_count` fetched but not
  returned to caller (engine can't tell first-page from all results).
- **`tokenManager.js`** — AES-256-CBC, single static key, no HMAC, no versioning.
- **`botFilterDetector.js`** — Regex phrase detection; first-match-wins; no
  validation of the extracted phrase; possible duplicate prepending.
- **`regions.js`, `freelancer/users.js`** — Well-scoped, no notable gaps.

### Backend — AI, messaging, notifications, meetings

- **`openai/analyzer.js`** — No caching of analyses; full description + profile
  sent every call; only `relevance_score` validated; crude JSON-parse failure
  with no recovery/retry.
- **`openai/client.js`** — Retry + billing-error detection + silent fallback to
  `gpt-4o-mini`. Gaps: silent quality downgrade with no user alert; no circuit
  breaker; `isBillingError()` lacks null-safety; aggressive 429 retry timing.
- **`openai/meetingDetector.js`** — Keyword + OpenAI extraction; English-only
  signals; high false-positive rate on common words → wasted calls; no fallback
  regex extraction; timezone not validated.
- **`openai/proposalGenerator.js`** — Oversized-proposal regeneration costs ~3×;
  re-generation drops the original system prompt; no length re-validation after
  retry; bot-filter prepend logic fragile.
- **`openai/promptLoader.js`** — Fragile path resolution across
  Electron/Docker/dev; no hot-reload; silent empty-string fallback on missing
  file.
- **`messaging/messagePoller.js`** — `isPolling` guard skips (not queues)
  overlapping runs; `MAX_LOOKBACK_MS` 30-min gap after downtime; sequential
  Telegram sends; non-atomic client upserts; no content-based meeting dedup.
- **`messaging/telegramCommandPoller.js`** — In-memory offsets lost on restart;
  10s polling is heavy; per-user `getUpdates` doesn't batch.
- **`notifications/telegram.js`** — No retry/queue; custom HTML escaping misses
  quotes/newlines; `formatTime()` hardcodes UTC instead of user timezone.
- **`meetings/meetingReminder.js`** — Fixed 25–35 min window; "any-success"
  marking means partial failures never retry; 1-min polling is excessive.
- **`freelancer/messages.js`** — Hardcoded limits (20 threads / 5 messages); no
  pagination; no retry; no response-structure validation.
- **`utils/chatUtils.js`** — Trivial parse; no chat-ID format validation.

### Frontend (React + Vite + Tailwind)

- **Architecture** — Context API (Auth, Theme) + custom hooks + local state; no
  error boundary; no global toast system; polling logic duplicated across pages.
- **Error handling** — Several fail-silent `catch` blocks (DashboardPage,
  ProjectsPage, SettingsPage); no retry affordances; inconsistent loading
  skeletons.
- **Accessibility** — Missing ARIA on dialogs/modals; no focus traps;
  color-only status indicators; no skip link.
- **Performance** — Background-tab polling on some pages (Header does it right);
  no `AbortController` on unmount; missing `useMemo`/`useCallback`; large pages
  re-render whole lists; no list virtualization.
- **Code quality** — country→flag duplicated ~5×; status-color maps ~3×; magic
  numbers for intervals; `ThemeContext` applies theme twice.
- **Testing** — Zero frontend tests despite Vitest + Testing Library configured.

### Electron / build / security

- **Electron shell** — Good fundamentals: single-instance lock,
  `contextIsolation: true`, `nodeIntegration: false`, minimal preload, external
  links via `shell.openExternal`, hostname-based navigation guard. Backend runs
  in-process; SQLite in WAL mode; migrations at startup; secrets auto-generated
  with `0o600` (no effect on Windows).
- **Missing**: Electron fuses; code signing; notarization; auto-update.
- **CI** (`.github/workflows/build.yml`) — Multi-platform matrix is solid, but
  no test/lint/audit steps; `--publish never`; unsigned artifacts.
- **Security** — Strong basics (JWT, bcrypt, AES token encryption, Joi
  validation, Helmet, mongo-sanitize, correlation IDs, Prisma parameterization).
  Gaps: CSP disabled in Helmet; request/performance logging disabled; in-memory
  rate limiter (single-instance only); no key rotation.

---

## Suggested sequencing

| Phase | Focus | Why first |
|-------|-------|-----------|
| **1** | Manual-review mode + responsibility ack; code signing + auto-update | Makes it legally/practically sellable and patchable |
| **2** | Engine resilience (fatal-error classification, retries, idempotency, parallelism) | Protects the revenue-generating core and users' accounts |
| **3** | Test suite for engine/scheduler/auth; CI runs tests | Lets phase-1/2 fixes ship with confidence |
| **4** | Frontend toasts, component splits, dedup; OpenAI cost controls | Quality, cost, and UX polish |

---

## Priority matrix

**Must have (ship blockers)**
1. Manual review mode — compliance violation
2. Code signing & notarization — distribution requirement
3. Core test suite — quality gate

**Should have (pre-release)**
4. Re-enable request logging (conditional on `LOG_LEVEL`)
5. Electron fuses hardening
6. CI linting & `npm audit`
7. User compliance agreement on first run

**Nice to have (post-release roadmap)**
8. Auto-update mechanism
9. Proposal personalization (per-profile identity, rotated templates)
10. Quality monitoring dashboard (response/award/rejection rates, auto-pause)
11. OpenAI cost controls (caching, daily token cap, fallback alert)
12. Token-encryption HMAC + versioned format for key rotation
