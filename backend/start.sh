#!/bin/sh
set -e

# Handle migration from the old multi-file history to the new 0_init baseline.
#
# On existing installs: _prisma_migrations has old entries; 0_init is not there.
# migrate deploy would try to run 0_init and fail (tables already exist).
# So we mark it as applied first. The || true means these are safe no-ops on
# new installs (no DB yet) and on installs that already have 0_init applied.
npx prisma migrate resolve --rolled-back "0_init" 2>/dev/null || true
npx prisma migrate resolve --applied  "0_init" 2>/dev/null || true

# Run any remaining pending migrations, then start the app
npx prisma migrate deploy
exec node src/index.js
