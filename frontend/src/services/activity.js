import api from './api'

export async function getActivityLogs(params = {}) {
  const { data } = await api.get('/activity', { params })
  return data
}

export async function getActivityStats() {
  const { data } = await api.get('/activity/stats')
  return data
}
