import api from './api'

const LONG = { timeout: 180000 }

// Winning bids on projects we bid on
export async function getWinningBids(period = '90d') {
  const { data } = await api.get('/insights/winning-bids', { params: { period } })
  return data
}
export async function syncWinningBids() {
  const { data } = await api.post('/insights/winning-bids/sync', null, { timeout: 120000 })
  return data
}
export async function getWinningBidStudy() {
  const { data } = await api.get('/insights/winning-bids/study')
  return data
}
export async function runWinningBidStudy(period = '90d') {
  const { data } = await api.post('/insights/winning-bids/study', null, { params: { period }, ...LONG })
  return data
}

// Client explorer
export async function getTopClients(period = '90d') {
  const { data } = await api.get('/insights/clients', { params: { period } })
  return data
}
export async function getClientHistory(ownerId) {
  const { data } = await api.get(`/insights/clients/${ownerId}/history`, { timeout: 60000 })
  return data
}
export async function getClientProjectBids(ownerId, projectId) {
  const { data } = await api.get(`/insights/clients/${ownerId}/projects/${projectId}/bids`, { timeout: 60000 })
  return data
}
export async function getClientStudy(ownerId) {
  const { data } = await api.get(`/insights/clients/${ownerId}/study`)
  return data
}
export async function runClientStudy(ownerId) {
  const { data } = await api.post(`/insights/clients/${ownerId}/study`, null, LONG)
  return data
}
