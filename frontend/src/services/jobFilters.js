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
