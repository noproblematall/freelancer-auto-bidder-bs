import { useState, useRef, useEffect } from 'react'

// Comprehensive country list (ISO 3166-1 alpha-2)
const ALL_CODES = [
  'AF','AL','DZ','AD','AO','AG','AR','AM','AU','AT','AZ','BS','BH','BD','BB','BY','BE','BZ','BJ',
  'BT','BO','BA','BW','BR','BN','BG','BF','BI','CV','KH','CM','CA','CF','TD','CL','CN','CO','KM',
  'CD','CG','CR','HR','CU','CY','CZ','DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET',
  'FJ','FI','FR','GA','GM','GE','DE','GH','GR','GD','GT','GN','GW','GY','HT','HN','HU','IS','IN',
  'ID','IR','IQ','IE','IL','IT','JM','JP','JO','KZ','KE','KI','KW','KG','LA','LV','LB','LS','LR',
  'LY','LI','LT','LU','MG','MW','MY','MV','ML','MT','MH','MR','MU','MX','FM','MD','MC','MN','ME',
  'MA','MZ','MM','NA','NR','NP','NL','NZ','NI','NE','NG','NO','OM','PK','PW','PS','PA','PG','PY',
  'PE','PH','PL','PT','QA','RO','RU','RW','KN','LC','VC','WS','SM','ST','SA','SN','RS','SC','SL',
  'SG','SK','SI','SB','SO','ZA','SS','ES','LK','SD','SR','SE','CH','SY','TW','TJ','TZ','TH','TL',
  'TG','TO','TT','TN','TR','TM','TV','UG','UA','AE','GB','US','UY','UZ','VU','VE','VN','YE','ZM',
  'ZW','HK','MO','XK','PR','GL','BM','GF','MQ','GP','CW','AW','SX','BQ','AI','TC','VG','VI','KY',
]

const _regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function getFlag(code) {
  return String.fromCodePoint(
    0x1F1E6 - 65 + code.charCodeAt(0),
    0x1F1E6 - 65 + code.charCodeAt(1),
  )
}

function getCountryName(code) {
  try { return _regionNames.of(code) || code } catch { return code }
}

const COUNTRIES = ALL_CODES.map(code => ({
  code,
  name: getCountryName(code),
  flag: getFlag(code),
})).sort((a, b) => a.name.localeCompare(b.name))

export default function CountryMultiSelect({ value = [], onChange, placeholder = 'Add country...' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selectedSet = new Set(value.map(c => c.toUpperCase()))

  const filtered = query.length >= 1
    ? COUNTRIES.filter(c =>
        !selectedSet.has(c.code) &&
        (c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 30)
    : []

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function add(code) {
    onChange([...value, code])
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function remove(code) {
    onChange(value.filter(c => c.toUpperCase() !== code.toUpperCase()))
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(code => {
            const upper = code.toUpperCase()
            const name = getCountryName(upper)
            const flag = getFlag(upper)
            return (
              <span
                key={upper}
                className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 text-xs bg-navy-50 dark:bg-navy-700 text-navy-700 dark:text-navy-200 border border-navy-200 dark:border-white/10 rounded-full"
              >
                <span className="text-sm leading-none">{flag}</span>
                <span>{name}</span>
                <button
                  type="button"
                  onClick={() => remove(code)}
                  className="ml-0.5 text-navy-400 dark:text-navy-400 hover:text-red-500 dark:hover:text-red-400 rounded-full p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 placeholder:text-slate-400 dark:placeholder:text-slate-600"
        />
      </div>

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.code}
              type="button"
              onMouseDown={e => { e.preventDefault(); add(c.code) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
            >
              <span className="text-lg leading-none shrink-0">{c.flag}</span>
              <span className="flex-1 text-slate-800 dark:text-slate-100">{c.name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{c.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
