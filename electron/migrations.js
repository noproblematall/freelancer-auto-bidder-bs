// Applies backend/prisma/migrations to the app's SQLite database without the
// Prisma CLI. Shared by electron/main.js (better-sqlite3) and the upgrade
// tests (node:sqlite): anything with prepare/get/run/exec works.
const fs = require('fs')
const path = require('path')

// Split a migration file into statements. A ';' ends a statement only outside
// string literals ('...' with '' escapes) and quoted identifiers ("..."), and
// '--' comments are dropped only outside them, so seeded text that contains a
// semicolon or a double dash is left intact.
function splitStatements(sql) {
  const out = []
  let cur = ''
  let quote = null
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    if (quote) {
      cur += c
      if (c === quote) {
        if (sql[i + 1] === quote) { cur += quote; i++ } // escaped quote ('' or "")
        else quote = null
      }
    } else if (c === "'" || c === '"') {
      quote = c
      cur += c
    } else if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      i = end < 0 ? sql.length : end - 1
    } else if (c === ';') {
      if (cur.trim()) out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

// Oldest first. Folder names start with a number: the early ones are 0_, 1_,
// 2_, 3_ and the rest a 14-digit timestamp. A plain string sort puts "2_..."
// after "2026...", which would run the timestamped migrations before the
// columns they depend on exist, so order by the numeric prefix instead.
function orderMigrations(folders) {
  const prefix = (name) => { const m = name.match(/^\d+/); return m ? Number(m[0]) : Number.POSITIVE_INFINITY }
  return [...folders].sort((a, b) => prefix(a) - prefix(b) || a.localeCompare(b))
}

// Runs every migration folder not yet recorded in _migrations, in order.
// Returns the names applied this time.
function applyMigrations(db, migrationsDir) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    ran_at INTEGER NOT NULL
  )`)
  if (!fs.existsSync(migrationsDir)) return []

  const folders = orderMigrations(
    fs.readdirSync(migrationsDir).filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
  )
  const applied = []
  for (const folder of folders) {
    if (db.prepare('SELECT 1 FROM _migrations WHERE name = ?').get(folder)) continue

    const sqlPath = path.join(migrationsDir, folder, 'migration.sql')
    if (fs.existsSync(sqlPath)) {
      for (const stmt of splitStatements(fs.readFileSync(sqlPath, 'utf8'))) {
        try { db.exec(stmt) } catch (e) {
          // Ignore idempotent re-runs: "already exists" (CREATE TABLE/INDEX) and
          // "duplicate column name" (ALTER TABLE ADD COLUMN re-applied after a
          // crash between a statement and the _migrations bookkeeping insert).
          if (!/already exists|duplicate column/i.test(e.message)) {
            throw new Error(`Migration ${folder} failed: ${e.message}\n${stmt.slice(0, 200)}`)
          }
        }
      }
    }
    db.prepare('INSERT INTO _migrations VALUES (?, ?)').run(folder, Date.now())
    applied.push(folder)
  }
  return applied
}

module.exports = { splitStatements, orderMigrations, applyMigrations }
