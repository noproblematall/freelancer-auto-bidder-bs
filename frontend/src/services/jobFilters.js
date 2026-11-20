import api from './api'

// Account-wide project search filters (countries, regions, currencies, languages)
export async function getJobFilters() {
  const { data } = await api.get('/job-filters')
  return data
}

export async function updateJobFilters(filters) {
  const { data } = await api.put('/job-filters', filters)
  return data
}

// Skills on the Freelancer profile and skills the account has been hired for
export async function getJobFilterSuggestions() {
  const { data } = await api.get('/job-filters/suggestions')
  return data
}
