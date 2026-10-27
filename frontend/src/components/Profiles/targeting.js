// Targeting constants shared by the profile forms and summary cards
export const REGIONS = [
  { group: 'Americas', items: [
    { key: 'north_america', label: 'North America' },
    { key: 'central_america', label: 'Central America' },
    { key: 'caribbean', label: 'Caribbean' },
    { key: 'south_america', label: 'South America' },
  ]},
  { group: 'Europe', items: [
    { key: 'western_europe', label: 'Western Europe' },
    { key: 'northern_europe', label: 'Northern Europe' },
    { key: 'southern_europe', label: 'Southern Europe' },
    { key: 'eastern_europe', label: 'Eastern Europe' },
  ]},
  { group: 'Africa', items: [
    { key: 'north_africa', label: 'North Africa' },
    { key: 'west_africa', label: 'West Africa' },
    { key: 'east_africa', label: 'East Africa' },
    { key: 'central_africa', label: 'Central Africa' },
    { key: 'southern_africa', label: 'Southern Africa' },
  ]},
  { group: 'Asia', items: [
    { key: 'middle_east', label: 'Middle East' },
    { key: 'central_asia', label: 'Central Asia' },
    { key: 'south_asia', label: 'South Asia' },
    { key: 'southeast_asia', label: 'Southeast Asia' },
    { key: 'east_asia', label: 'East Asia' },
  ]},
  { group: 'Oceania', items: [
    { key: 'australia_nz', label: 'Australia & NZ' },
    { key: 'pacific_islands', label: 'Pacific Islands' },
  ]},
]

export const EMPTY_TARGETING = {
  countries: [],
  excludedRegions: [],
  countryExceptions: [],
  excludedCountries: [],
  excludedCurrencies: [],
}
