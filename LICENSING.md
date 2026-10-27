# Growlance — Custom Licensing System

> Design + setup reference for the node-locked ("one license per device") licensing
> layer. Build is phased; see **Status** at the bottom.

## Goal & threat model

- **One active device per license.** A buyer who shares their key with a friend
  should find the friend's device rejected at activation.
- **Realistic bar:** deter *casual sharing*. No local desktop app can be made
  uncrackable — a determined attacker can patch any binary. We make casual key
  sharing fail, which covers the overwhelming majority of revenue leakage.
- **Good UX for honest buyers:** offline-friendly (works without constant
  internet), and self-service device transfer (new laptop / reinstall) so
  hardware changes don't generate support tickets.

## Why a server is required

"One device" can only be enforced if something central records *"key X is now
on device Y"* and refuses a second device. The desktop app is 100% local, so we
add a small hosted **license server**. A purely-offline signed key can prove a
license is genuine but cannot stop it being used on many machines.

## Architecture

```
                      ┌──────────────────────────────────────────┐
  Buyer pays (Plisio) │  Public web (Vercel, growlance.app)       │
        │             │                                          │
        ▼             │  /api/checkout         → create invoice  │
  Plisio Status URL ─▶│  /api/license/webhook  → verify paid via │
                      │                          Plisio API,     │
                      │                          issue key, EMAIL │
   Desktop app  ─────▶│  /api/license/activate   (device-lock)   │
   (Electron)    ◀────│  /api/license/validate   (periodic)      │
                      │  /api/license/deactivate (self transfer) │
                      │             │                            │
                      │             ▼                            │
                      │        Postgres (Neon)                   │
                      │   licenses ── devices                    │
                      └──────────────────────────────────────────┘
```

Three parts:

1. **License server** — serverless functions under `marketing/api/license/*`
   backed by Postgres. Issues keys, enforces the device limit, signs offline
   validation tokens. Lives in the existing Vercel project (one deploy, public
   domain). Could be split into its own service later.
2. **Desktop client (Electron)** — on first launch, gates the app behind an
   activation screen: user pastes the key, the app fingerprints the device and
   calls `/activate`. Stores a signed token, verifies it **offline** on each
   launch, and re-validates online periodically.
3. **Issuance** — Plisio's **Status URL (IPN)** hits `/webhook`, which
   independently re-verifies the payment via the Plisio API (we never trust the
   webhook body), then creates the license and **emails the key + download link**.

## Data model (Postgres)

```sql
licenses (
  id            uuid primary key,
  key_hash      text unique not null,   -- sha256 of the normalized key (raw key only in the buyer's email)
  email         text not null,
  plan          text not null default 'lifetime',
  status        text not null default 'active',  -- active | revoked | refunded
  machine_limit int  not null default 1,
  order_ref     text unique,            -- Plisio order_number, for idempotent issuance
  created_at    timestamptz default now()
)

devices (
  id           uuid primary key,
  license_id   uuid references licenses(id) on delete cascade,
  fingerprint  text not null,
  name         text,
  activated_at timestamptz default now(),
  last_seen_at timestamptz default now(),
  unique (license_id, fingerprint)
)
```

## License key format

`GROW-XXXXX-XXXXX-XXXXX-XXXXX` — 20 random Crockford-base32 chars (no ambiguous
`I L O U`). The server stores only the **sha256 hash**; the raw key exists only
in the buyer's email (a DB leak can't reveal usable keys).

## Crypto: online activation + offline re-validation

- The server holds an **Ed25519 private key** (`LICENSE_SIGNING_PRIVATE_KEY`).
- The app **embeds the matching public key**.
- On `/activate`, the server returns a **signed token**:
  `base64url(payload) + "." + base64url(ed25519-signature)` where payload is
  `{ lid, f: fingerprint, plan, iat, exp }` (exp ≈ 14 days).
- The app verifies the signature offline each launch, checks `f` matches *this*
  device and `exp` is in the future. When the token nears/passes expiry it calls
  `/validate` to refresh — so a revoked/refunded license stops working within
  the token window even though it's offline-capable in between.

## Endpoints (`marketing/api/license/`)

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/license/activate` | `{ key, fingerprint, name? }` | Validate key, enforce device limit, record device, return signed token |
| POST | `/api/license/trial` | `{ fingerprint, name? }` | Issue a 7-day trial locked to this device (one per fingerprint, forever — `order_ref = 'trial:<fingerprint>'` is unique) |
| POST | `/api/license/validate` | `{ key, fingerprint }` | Re-check (still active + this device known); return fresh token |
| POST | `/api/license/deactivate` | `{ key, fingerprint }` | Remove this device (self-service transfer) |
| POST | `/api/license/webhook` | Plisio IPN | Verify payment via Plisio API → issue license (reliable async trigger) |
| GET/POST | `/api/license/claim` | `?order=...` | Success page: verify payment, return the issued key + download link |

Error codes the client handles: `invalid_key` (404), `license_revoked` /
`license_refunded` / `license_expired` / `trial_used` (403),
`device_limit_reached` (409).

### Trials

Trial licenses are ordinary `licenses` rows with `plan = 'trial'` and
`expires_at = created_at + 7 days` (paid licenses have `expires_at = null`).
Their signed tokens expire exactly at trial end (never the normal 14-day TTL),
and the app's offline-outage grace does **not** apply to trials — so blocking
the license server does not extend a trial. `activate`/`validate` reject any
license past `expires_at` with `license_expired`, which the app treats as fatal
(relock → activation screen, where the user can buy).

## Device-limit UX

`machine_limit = 1` by default, but the buyer can **deactivate** their old
device themselves (from the app, or a future web portal) to free the slot for a
new machine. This avoids "I bought it but it won't activate on my new laptop"
support load. Refunds/chargebacks → set `status = 'refunded'` to kill the
license at the next `/validate`.

## Free / manual licenses (for yourself & friends)

A manually-created license is just a row in `licenses` with `status='active'` —
it activates exactly like a paid one, no payment involved.

**Web admin (easiest):** open `https://growlance.app/admin.html`, sign in with
the `ADMIN_TOKEN` you set in Vercel, then create / list / revoke / reset-devices
from the browser. The page is `noindex` and every action is gated by the token
(checked server-side in `api/admin/license.js`). Set a long random `ADMIN_TOKEN`.

**CLI (alternative):** same operations from a terminal —

```bash
cd marketing
# copy DATABASE_URL + LICENSE_KEY_ENC_SECRET from Vercel into marketing/.env first
node --env-file=.env scripts/license.mjs create --email "me" --devices 3
node --env-file=.env scripts/license.mjs create --email "Sam (friend)"
node --env-file=.env scripts/license.mjs list --keys
node --env-file=.env scripts/license.mjs revoke GROW-XXXXX-XXXXX-XXXXX-XXXXX
```

`--devices N` sets how many devices that key can run on (default 1; bump it for
your own multi-machine use). The printed key is what you/your friend enters in
Growlance to activate.

## Environment variables (Vercel)

| Var | Where | Notes |
|---|---|---|
| `DATABASE_URL` | license fns | Neon Postgres connection string |
| `LICENSE_SIGNING_PRIVATE_KEY` | license fns | base64 of the Ed25519 private PEM (from the keygen script) |
| `PLISIO_SECRET_KEY` | webhook + checkout | already set (used to verify payment via Plisio API) |
| `LICENSE_KEY_ENC_SECRET` | license fns | base64 32-byte AES key — encrypts stored license keys (from keygen script) |
| `DOWNLOAD_URL` | claim | installer/download link shown on the success page |
| `BASE_URL` | checkout | public origin for Plisio success/callback URLs (optional; defaults to growlance.app) |

The app embeds the **public** key (committed) — never the private key.

## Setup steps (one-time)

1. **Provision Postgres** — create a free Neon project, copy the connection
   string → set `DATABASE_URL` in Vercel. Run `marketing/api/license/schema.sql`.
2. **Generate the signing keypair** — `node marketing/scripts/gen-license-keypair.mjs`.
   Put the printed **private** value in `LICENSE_SIGNING_PRIVATE_KEY` (Vercel);
   paste the **public** value into the app's embedded constant.
3. **Email** — set the `SMTP_*` vars to your Zoho mailbox creds.
4. **Plisio** — set the store **Status URL** to
   `https://growlance.app/api/license/webhook`.
5. **Redeploy** Vercel so the env vars apply.

## Status

- [x] **Phase 1 — Core server**: schema, DB client, Ed25519 crypto, keygen,
      `activate` / `validate` / `deactivate`. Done.
- [x] **Phase 2 — Issuance & delivery (success page, no email)**: Plisio
      `webhook` + `claim` (both verify via Plisio API), AES-encrypted key storage,
      checkout passes success/callback URLs, thank-you page displays the key +
      download. Done. *Needs one live test to confirm Plisio's operations
      endpoint/response shape (isolated in `lib/license/plisio.js`).*
- [x] **Phase 3 — Electron gate**: main-process gate (`electron/license.js`)
      verifies the signed token offline at boot and, if unlicensed, shows the
      standalone activation window (`electron/activation.html`) WITHOUT starting
      the backend. Device fingerprint via `node-machine-id`. Activation/validate/
      deactivate go through IPC → main → server (no CORS, can't be bypassed from
      the renderer). License stored in `userData/.license` (0o600). Server-sign /
      app-verify contract unit-tested. *Pending: embed the real public key in
      `electron/license-public-key.js`, plus an in-app "transfer device" button
      (optional UX — deactivate is already wired via IPC).*
- [ ] **Phase 4 — Deploy & verify**: provision Postgres + run schema, set env
      vars, generate keypair → embed public key in the app + private key on
      Vercel, set Plisio Status URL, then one live test payment + a real
      activation on two devices to confirm the device-lock end-to-end.

## Honest limitations

- Not unbreakable — a skilled attacker can patch the local check. This stops
  casual key sharing, which is the realistic goal.
- Requires the buyer to be online **once** to activate (and briefly every ~14
  days to re-validate). Fully-offline customers need a manual offline-activation
  path (future enhancement).
- The license server must stay up for activations — it's now infrastructure you
  maintain (serverless keeps this minimal).
