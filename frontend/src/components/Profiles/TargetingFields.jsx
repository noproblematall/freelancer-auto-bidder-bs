import CountryMultiSelect from './CountryMultiSelect'
import CurrencyMultiSelect from './CurrencyMultiSelect'
import { labelClass, hintClass } from './formStyles'
import { REGIONS, EMPTY_TARGETING } from './targeting'

/**
 * Country / region / currency targeting controls, shared by the bid profile
 * form and the shared-settings form.
 *
 * `value` holds the five list fields in EMPTY_TARGETING; `onChange(patch)`
 * receives an object with only the changed field(s).
 */
export default function TargetingFields({ value, onChange }) {
  const v = { ...EMPTY_TARGETING, ...value }

  function toggleRegion(key) {
    const active = v.excludedRegions.includes(key)
    onChange({
      excludedRegions: active
        ? v.excludedRegions.filter(r => r !== key)
        : [...v.excludedRegions, key],
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClass}>Only include countries (allowlist)</label>
        <CountryMultiSelect
          value={v.countries}
          onChange={val => onChange({ countries: val })}
          placeholder="Search countries to include..."
        />
        <p className={hintClass}>Leave empty to allow all countries</p>
      </div>
      <div>
        <label className={labelClass}>Exclude regions</label>
        <div className="space-y-3">
          {REGIONS.map(group => (
            <div key={group.group}>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">{group.group}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map(region => {
                  const active = v.excludedRegions.includes(region.key)
                  return (
                    <button
                      key={region.key}
                      type="button"
                      onClick={() => toggleRegion(region.key)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                        active
                          ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400'
                          : 'bg-white dark:bg-navy-900 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-navy-500'
                      }`}
                    >
                      {region.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {v.excludedRegions.length > 0 && (
        <div>
          <label className={labelClass}>Country exceptions <span className="font-normal text-slate-400">(always allowed even if region is excluded)</span></label>
          <CountryMultiSelect
            value={v.countryExceptions}
            onChange={val => onChange({ countryExceptions: val })}
            placeholder="Search countries to allow..."
          />
        </div>
      )}
      <div>
        <label className={labelClass}>Exclude specific countries</label>
        <CountryMultiSelect
          value={v.excludedCountries}
          onChange={val => onChange({ excludedCountries: val })}
          placeholder="Search countries to block..."
        />
        <p className={hintClass}>Block individual countries in addition to any excluded regions</p>
      </div>
      <div>
        <label className={labelClass}>Exclude project currencies</label>
        <CurrencyMultiSelect
          value={v.excludedCurrencies}
          onChange={val => onChange({ excludedCurrencies: val })}
          placeholder="Search currencies to block..."
        />
        <p className={hintClass}>Useful when a client's billing currency doesn't match their listed country (e.g. INR-denominated projects posted from Canada or the UK)</p>
      </div>
    </div>
  )
}
