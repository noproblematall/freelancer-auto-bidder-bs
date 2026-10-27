import { useState, useRef, useEffect } from 'react'

// Currencies that Freelancer.com actually denominates projects in.
// Code, full name, and ISO country code (for flag).
const ALL_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', country: 'US' },
  { code: 'EUR', name: 'Euro', country: 'EU' },
  { code: 'GBP', name: 'British Pound', country: 'GB' },
  { code: 'AUD', name: 'Australian Dollar', country: 'AU' },
  { code: 'CAD', name: 'Canadian Dollar', country: 'CA' },
  { code: 'NZD', name: 'New Zealand Dollar', country: 'NZ' },
  { code: 'INR', name: 'Indian Rupee', country: 'IN' },
  { code: 'PKR', name: 'Pakistani Rupee', country: 'PK' },
  { code: 'BDT', name: 'Bangladeshi Taka', country: 'BD' },
  { code: 'LKR', name: 'Sri Lankan Rupee', country: 'LK' },
  { code: 'NPR', name: 'Nepalese Rupee', country: 'NP' },
  { code: 'IDR', name: 'Indonesian Rupiah', country: 'ID' },
  { code: 'MYR', name: 'Malaysian Ringgit', country: 'MY' },
  { code: 'PHP', name: 'Philippine Peso', country: 'PH' },
  { code: 'SGD', name: 'Singapore Dollar', country: 'SG' },
  { code: 'HKD', name: 'Hong Kong Dollar', country: 'HK' },
  { code: 'TWD', name: 'Taiwan Dollar', country: 'TW' },
  { code: 'JPY', name: 'Japanese Yen', country: 'JP' },
  { code: 'CNY', name: 'Chinese Yuan', country: 'CN' },
  { code: 'KRW', name: 'South Korean Won', country: 'KR' },
  { code: 'THB', name: 'Thai Baht', country: 'TH' },
  { code: 'VND', name: 'Vietnamese Dong', country: 'VN' },
  { code: 'AED', name: 'UAE Dirham', country: 'AE' },
  { code: 'SAR', name: 'Saudi Riyal', country: 'SA' },
  { code: 'QAR', name: 'Qatari Riyal', country: 'QA' },
  { code: 'KWD', name: 'Kuwaiti Dinar', country: 'KW' },
  { code: 'BHD', name: 'Bahraini Dinar', country: 'BH' },
  { code: 'OMR', name: 'Omani Rial', country: 'OM' },
  { code: 'EGP', name: 'Egyptian Pound', country: 'EG' },
  { code: 'ZAR', name: 'South African Rand', country: 'ZA' },
  { code: 'NGN', name: 'Nigerian Naira', country: 'NG' },
  { code: 'KES', name: 'Kenyan Shilling', country: 'KE' },
  { code: 'GHS', name: 'Ghanaian Cedi', country: 'GH' },
  { code: 'TRY', name: 'Turkish Lira', country: 'TR' },
  { code: 'RUB', name: 'Russian Ruble', country: 'RU' },
  { code: 'UAH', name: 'Ukrainian Hryvnia', country: 'UA' },
  { code: 'PLN', name: 'Polish Zloty', country: 'PL' },
  { code: 'CZK', name: 'Czech Koruna', country: 'CZ' },
  { code: 'HUF', name: 'Hungarian Forint', country: 'HU' },
  { code: 'RON', name: 'Romanian Leu', country: 'RO' },
  { code: 'SEK', name: 'Swedish Krona', country: 'SE' },
  { code: 'NOK', name: 'Norwegian Krone', country: 'NO' },
  { code: 'DKK', name: 'Danish Krone', country: 'DK' },
  { code: 'CHF', name: 'Swiss Franc', country: 'CH' },
  { code: 'ILS', name: 'Israeli Shekel', country: 'IL' },
  { code: 'BRL', name: 'Brazilian Real', country: 'BR' },
  { code: 'MXN', name: 'Mexican Peso', country: 'MX' },
  { code: 'ARS', name: 'Argentine Peso', country: 'AR' },
  { code: 'CLP', name: 'Chilean Peso', country: 'CL' },
  { code: 'COP', name: 'Colombian Peso', country: 'CO' },
  { code: 'PEN', name: 'Peruvian Sol', country: 'PE' },
].sort((a, b) => a.name.localeCompare(b.name))

function getFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2 || countryCode === 'EU') return '💱'
  return String.fromCodePoint(
    0x1F1E6 - 65 + countryCode.charCodeAt(0),
    0x1F1E6 - 65 + countryCode.charCodeAt(1),
  )
}

function getCurrencyMeta(code) {
  return ALL_CURRENCIES.find(c => c.code === code) || { code, name: code, country: null }
}

export default function CurrencyMultiSelect({ value = [], onChange, placeholder = 'Search currencies to block...' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selectedSet = new Set(value.map(c => String(c).toUpperCase()))

  const filtered = query.length >= 1
    ? ALL_CURRENCIES.filter(c =>
        !selectedSet.has(c.code) &&
        (c.name.toLowerCase().includes(query.toLowerCase()) || c.code.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 30)
    : ALL_CURRENCIES.filter(c => !selectedSet.has(c.code)).slice(0, 30)

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
    onChange(value.filter(c => String(c).toUpperCase() !== String(code).toUpperCase()))
  }

  return (
    <div ref={containerRef} className="relative">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(code => {
            const upper = String(code).toUpperCase()
            const meta = getCurrencyMeta(upper)
            return (
              <span
                key={upper}
                className="inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 text-xs bg-navy-50 dark:bg-navy-700 text-navy-700 dark:text-navy-200 border border-navy-200 dark:border-white/10 rounded-full"
              >
                <span className="text-sm leading-none">{getFlag(meta.country)}</span>
                <span>{meta.code} — {meta.name}</span>
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

      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.code}
              type="button"
              onMouseDown={e => { e.preventDefault(); add(c.code) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
            >
              <span className="text-lg leading-none shrink-0">{getFlag(c.country)}</span>
              <span className="flex-1 text-slate-800 dark:text-slate-100">{c.name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">{c.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
