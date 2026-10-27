-- Growlance license server schema (Postgres / Neon).
-- Run once against your DATABASE_URL:  psql "$DATABASE_URL" -f schema.sql
-- (or paste into the Neon SQL editor).

create extension if not exists "pgcrypto";

create table if not exists licenses (
  id            uuid primary key default gen_random_uuid(),
  key_hash      text unique not null,            -- sha256 of the normalized key (for activation lookup)
  key_enc       text not null,                   -- AES-GCM encrypted key (so the success page can re-display it)
  email         text,                            -- buyer email if Plisio captured one (nullable)
  plan          text not null default 'lifetime',-- lifetime | trial
  status        text not null default 'active',  -- active | revoked | refunded
  machine_limit int  not null default 1,
  order_ref     text unique,                     -- Plisio txn_id, or 'trial:<fingerprint>' (idempotent issuance / one trial per device)
  expires_at    timestamptz,                     -- null = perpetual; trials get created_at + 7 days
  created_at    timestamptz not null default now()
);

-- Migration for databases created before trials existed (safe to re-run):
alter table licenses add column if not exists expires_at timestamptz;

create table if not exists devices (
  id           uuid primary key default gen_random_uuid(),
  license_id   uuid not null references licenses(id) on delete cascade,
  fingerprint  text not null,
  name         text,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (license_id, fingerprint)
);

create index if not exists idx_devices_license on devices(license_id);
