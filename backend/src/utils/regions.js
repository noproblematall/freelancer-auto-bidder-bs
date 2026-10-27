// Static mapping of geographic regions to ISO 3166-1 alpha-2 country codes
const REGIONS = [
  // ── Americas ──────────────────────────────────────────────────────────────
  {
    key: 'north_america',
    label: 'North America',
    countries: ['US', 'CA', 'MX', 'GL', 'PM', 'BM'],
  },
  {
    key: 'central_america',
    label: 'Central America',
    countries: ['GT', 'BZ', 'HN', 'SV', 'NI', 'CR', 'PA'],
  },
  {
    key: 'caribbean',
    label: 'Caribbean',
    countries: [
      'CU', 'JM', 'HT', 'DO', 'TT', 'BB', 'BS', 'LC', 'VC', 'GD',
      'AG', 'DM', 'KN', 'AI', 'TC', 'VG', 'VI', 'KY', 'AW', 'CW',
      'SX', 'MQ', 'GP', 'BQ', 'PR',
    ],
  },
  {
    key: 'south_america',
    label: 'South America',
    countries: ['BR', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'BO', 'PY', 'UY', 'GY', 'SR', 'GF', 'FK'],
  },
  // ── Europe ────────────────────────────────────────────────────────────────
  {
    key: 'western_europe',
    label: 'Western Europe',
    countries: ['GB', 'IE', 'FR', 'BE', 'NL', 'LU', 'DE', 'AT', 'CH', 'LI', 'MC'],
  },
  {
    key: 'northern_europe',
    label: 'Northern Europe',
    countries: ['NO', 'SE', 'DK', 'FI', 'IS', 'EE', 'LV', 'LT'],
  },
  {
    key: 'southern_europe',
    label: 'Southern Europe',
    countries: [
      'ES', 'PT', 'IT', 'GR', 'MT', 'CY', 'SI', 'HR', 'BA', 'RS',
      'ME', 'MK', 'AL', 'AD', 'SM', 'VA', 'XK',
    ],
  },
  {
    key: 'eastern_europe',
    label: 'Eastern Europe',
    countries: ['PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'UA', 'BY', 'MD', 'RU'],
  },
  // ── Africa ────────────────────────────────────────────────────────────────
  {
    key: 'north_africa',
    label: 'North Africa',
    countries: ['EG', 'LY', 'TN', 'DZ', 'MA', 'SD', 'SS', 'MR'],
  },
  {
    key: 'west_africa',
    label: 'West Africa',
    countries: ['NG', 'GH', 'SN', 'CI', 'BF', 'ML', 'NE', 'GN', 'SL', 'LR', 'TG', 'BJ', 'GW', 'GM', 'CV'],
  },
  {
    key: 'east_africa',
    label: 'East Africa',
    countries: ['ET', 'KE', 'TZ', 'UG', 'RW', 'BI', 'SO', 'DJ', 'ER', 'MG', 'KM', 'MU', 'SC'],
  },
  {
    key: 'central_africa',
    label: 'Central Africa',
    countries: ['CD', 'CG', 'GA', 'GQ', 'CF', 'TD', 'CM', 'AO', 'ST'],
  },
  {
    key: 'southern_africa',
    label: 'Southern Africa',
    countries: ['ZA', 'ZM', 'ZW', 'BW', 'NA', 'MZ', 'MW', 'LS', 'SZ'],
  },
  // ── Asia ──────────────────────────────────────────────────────────────────
  {
    key: 'middle_east',
    label: 'Middle East',
    countries: ['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'IR', 'IQ', 'SY', 'JO', 'LB', 'IL', 'PS', 'TR'],
  },
  {
    key: 'central_asia',
    label: 'Central Asia',
    countries: ['KZ', 'UZ', 'TM', 'TJ', 'KG', 'AF'],
  },
  {
    key: 'south_asia',
    label: 'South Asia',
    countries: ['IN', 'PK', 'BD', 'LK', 'NP', 'BT', 'MV'],
  },
  {
    key: 'southeast_asia',
    label: 'Southeast Asia',
    countries: ['TH', 'VN', 'PH', 'ID', 'MY', 'SG', 'MM', 'KH', 'LA', 'BN', 'TL'],
  },
  {
    key: 'east_asia',
    label: 'East Asia',
    countries: ['CN', 'JP', 'KR', 'TW', 'HK', 'MO', 'MN'],
  },
  // ── Oceania ───────────────────────────────────────────────────────────────
  {
    key: 'australia_nz',
    label: 'Australia & NZ',
    countries: ['AU', 'NZ'],
  },
  {
    key: 'pacific_islands',
    label: 'Pacific Islands',
    countries: ['PG', 'FJ', 'SB', 'VU', 'WS', 'TO', 'KI', 'MH', 'FM', 'PW', 'NR', 'TV', 'CK', 'NU'],
  },
];

// Build a reverse lookup: country code → region key
const COUNTRY_TO_REGION = {};
for (const region of REGIONS) {
  for (const code of region.countries) {
    COUNTRY_TO_REGION[code] = region.key;
  }
}

/**
 * Given a list of excluded region keys and a country code,
 * return true if the country belongs to any of the excluded regions.
 */
function isCountryInExcludedRegion(countryCode, excludedRegionKeys) {
  if (!countryCode || !excludedRegionKeys || excludedRegionKeys.length === 0) return false;
  const regionKey = COUNTRY_TO_REGION[countryCode.toUpperCase()];
  return regionKey ? excludedRegionKeys.includes(regionKey) : false;
}

module.exports = { REGIONS, COUNTRY_TO_REGION, isCountryInExcludedRegion };
