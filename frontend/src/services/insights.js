import api from './api'

const LONG = { timeout: 180000 }

// Winning bids on projects we bid on
export async function getWinningBids(period = '30d') {
  const { data } = await api.get('/insights/winning-bids', { params: { period } })
  return data
}
export async function syncWinningBids() {
  // The first fetch reads the whole Freelancer bid history (thousands of bids): give it time.
  const { data } = await api.post('/insights/winning-bids/sync', {}, { timeout: 600000 })
  return data
}
export async function getWinningBidStudy() {
  const { data } = await api.get('/insights/winning-bids/study')
  return data
}
export async function runWinningBidStudy(period = '30d') {
  const { data } = await api.post('/insights/winning-bids/study', {}, { params: { period }, ...LONG })
  return data
}

// Client explorer
export async function getTopClients(period = '30d') {
  const { data } = await api.get('/insights/clients', { params: { period } })
  return data
}
// ownerId is the anonymous client key (text with the city in it): encode it.
const clientPath = (ownerId) => `/insights/clients/${encodeURIComponent(ownerId)}`
export async function getClientHistory(ownerId) {
  const { data } = await api.get(`${clientPath(ownerId)}/history`, { timeout: 60000 })
  return data
}
export async function getClientProjectBids(ownerId, projectId) {
  const { data } = await api.get(`${clientPath(ownerId)}/projects/${projectId}/bids`, { timeout: 60000 })
  return data
}
export async function getClientStudy(ownerId) {
  const { data } = await api.get(`${clientPath(ownerId)}/study`)
  return data
}
export async function runClientStudy(ownerId) {
  const { data } = await api.post(`${clientPath(ownerId)}/study`, {}, LONG)
  return data
}
