import api from './api'

export async function getAnalyticsOverview(period = '30d') {
  const { data } = await api.get('/analytics/overview', { params: { period } })
  return data
}

export async function getAiAnalytics() {
  const { data } = await api.get('/analytics/ai')
  return data
}

// The review calls OpenAI with the whole analytics picture; allow it time.
export async function runAiAnalytics(period = '30d') {
  const { data } = await api.post('/analytics/ai', {}, { params: { period }, timeout: 180000 })
  return data
}
