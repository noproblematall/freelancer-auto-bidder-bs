// Page navigation under a list: first / previous, the page numbers with "…"
// for the gaps (1 2 3 … 121 122 123, or 1 … 9 10 11 … 123 around the current
// page), next / last, and "Showing 21–40 of 2,431" on the left.
// `page` is 0-based; `onPage` receives the 0-based page to show. With
// `onPageSize`, a "Rows per page" select is shown too.
import { useEffect } from 'react'
import { PAGE_SIZES } from '../hooks/usePageParams'

// Page numbers (1-based) and 'gap' markers. Always 7 slots once there are
// more than 7 pages, so the bar does not jump in width while paging.
function pageItems(current, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, 'gap', pages]
  if (current >= pages - 3) return [1, 'gap', pages - 4, pages - 3, pages - 2, pages - 1, pages]
  return [1, 'gap', current - 1, current, current + 1, 'gap', pages]
}

const ICONS = {
  first: 'm18.75 4.5-7.5 7.5 7.5 7.5m-6-15L5.25 12l7.5 7.5',
  prev: 'M15.75 19.5 8.25 12l7.5-7.5',
  next: 'm8.25 4.5 7.5 7.5-7.5 7.5',
  last: 'm5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5',
}

const BASE = 'inline-flex items-center justify-center h-9 min-w-9 px-2 rounded-lg text-sm font-medium tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50'
const IDLE = 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-navy-950 dark:hover:text-white'
const ACTIVE = 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30 cursor-default'
const DISABLED = 'text-slate-300 dark:text-slate-600 cursor-not-allowed'

function IconButton({ icon, label, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`${BASE} ${disabled ? DISABLED : IDLE}`}>
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
      </svg>
    </button>
  )
}

export default function Pagination({ page, pageSize, total, onPage, onPageSize, className = '' }) {
  const pages = total ? Math.ceil(total / pageSize) : 0
  // A page number from the address that is past the end (the list shrank since):
  // go to the last page instead of showing an empty one.
  useEffect(() => {
    if (pages > 0 && page > pages - 1) onPage(pages - 1)
  }, [page, pages, onPage])

  // Shown while there is more than the smallest page size, so the size can
  // still be changed back once everything fits on one page.
  if (!total || total <= PAGE_SIZES[0]) return null
  const current = Math.min(Math.max(page, 0), pages - 1) + 1 // 1-based
  const go = (p) => { if (p >= 1 && p <= pages && p !== current) onPage(p - 1) }
  const from = (current - 1) * pageSize + 1
  const to = Math.min(current * pageSize, total)
  const fmt = (v) => v.toLocaleString()

  return (
    <nav aria-label="Pagination" className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Showing <span className="font-medium text-navy-950 dark:text-white">{fmt(from)}–{fmt(to)}</span> of <span className="font-medium text-navy-950 dark:text-white">{fmt(total)}</span>
        </p>
        {onPageSize && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            Rows per page
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="h-9 pl-2.5 pr-7 rounded-lg text-sm font-medium text-navy-950 dark:text-white bg-white dark:bg-navy-900 border border-slate-300 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer"
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <IconButton icon="first" label="First page" disabled={current === 1} onClick={() => go(1)} />
        <IconButton icon="prev" label="Previous page" disabled={current === 1} onClick={() => go(current - 1)} />
        {/* Narrow screens: "3 / 38" between the arrows instead of the number row */}
        <span className="sm:hidden px-2 text-sm font-medium tabular-nums text-navy-950 dark:text-white whitespace-nowrap">{current} / {pages}</span>
        <div className="hidden sm:flex items-center gap-1">
          {pageItems(current, pages).map((item, i) => item === 'gap' ? (
            <span key={`gap-${i}`} className="inline-flex items-center justify-center h-9 w-7 text-sm text-slate-400 dark:text-slate-500 select-none" aria-hidden="true">…</span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => go(item)}
              aria-label={`Page ${item}`}
              aria-current={item === current ? 'page' : undefined}
              className={`${BASE} ${item === current ? ACTIVE : IDLE}`}
            >
              {item}
            </button>
          ))}
        </div>
        <IconButton icon="next" label="Next page" disabled={current === pages} onClick={() => go(current + 1)} />
        <IconButton icon="last" label="Last page" disabled={current === pages} onClick={() => go(pages)} />
      </div>
    </nav>
  )
}
