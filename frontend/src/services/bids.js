import api from './api'

export async function getBids(params = {}) {
  const { data } = await api.get('/bids', { params })
  return data
}

export async function getBid(id) {
  const { data } = await api.get(`/bids/${id}`)
  return data
}

export async function placeBid(bidData) {
  const { data } = await api.post('/bids', bidData)
  return data
}

export async function cancelBid(id) {
  const { data } = await api.patch(`/bids/${id}/cancel`)
  return data
}

export async function updateBid(id, fields) {
  const { data } = await api.patch(`/bids/${id}`, fields)
  return data
}

export async function retractBid(id) {
  const { data } = await api.put(`/bids/${id}/retract`)
  return data
}

export async function retryBid(id) {
  const { data } = await api.post(`/bids/${id}/retry`)
  return data
}

export async function placeNowBid(id) {
  const { data } = await api.post(`/bids/${id}/place-now`)
  return data
}

export async function getBidStats(period) {
  const { data } = await api.get('/bids/stats', { params: period ? { period } : {} })
  return data
}

export async function getBidHistory(period = '7d') {
  const { data } = await api.get('/bids/history', { params: { period } })
  return data
}
