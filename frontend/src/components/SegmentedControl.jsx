/**
 * A choice between a few mutually exclusive options, shown as a row of cards.
 *
 * options: [{ value, label, description? }]
 * Behaves as a radio group: click or use the arrow keys to change the value.
 */
export default function SegmentedControl({ value, options, onChange, label, className = '' }) {
  function onKeyDown(e) {
    const idx = options.findIndex(o => o.value === value)
    if (idx < 0) return
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = options[(idx + 1) % options.length]
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = options[(idx - 1 + options.length) % options.length]
    if (next) {
      e.preventDefault()
      onChange(next.value)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`grid gap-2 ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`text-left rounded-lg border px-3.5 py-3 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500/30 ${
              active
                ? 'border-navy-800 dark:border-emerald-400 bg-navy-50 dark:bg-emerald-400/10'
                : 'border-slate-200 dark:border-white/10 bg-white dark:bg-navy-900 hover:border-slate-300 dark:hover:border-white/20'
            }`}
          >
            <span className="flex items-start justify-between gap-2">
              <span className={`text-sm font-semibold ${active ? 'text-navy-950 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
                {option.label}
              </span>
              <span
                aria-hidden="true"
                className={`mt-0.5 w-4 h-4 shrink-0 rounded-full border flex items-center justify-center ${
                  active ? 'border-navy-800 dark:border-emerald-400 bg-navy-800 dark:bg-emerald-400' : 'border-slate-300 dark:border-slate-600'
                }`}
              >
                {active && (
                  <svg className="w-2.5 h-2.5 text-white dark:text-navy-950" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 6.5 5 9l4.5-5" />
                  </svg>
                )}
              </span>
            </span>
            {option.description && (
              <span className={`block text-xs mt-1 leading-snug ${active ? 'text-navy-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                {option.description}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
