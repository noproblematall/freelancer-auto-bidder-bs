import { neon } from '@neondatabase/serverless'

// Lazily-created Neon SQL client. Uses HTTP, so it's safe for serverless (no
// connection pooling headaches). Requires DATABASE_URL.
let _sql

export function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set')
    _sql = neon(process.env.DATABASE_URL)
  }
  return _sql
}
