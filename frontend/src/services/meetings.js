import api from './api'

export async function getMeetings(year, month) {
  const { data } = await api.get('/meetings', { params: { year, month } })
  return data
}

export async function createMeeting(data) {
  const { data: res } = await api.post('/meetings', data)
  return res
}

export async function updateMeeting(id, data) {
  const { data: res } = await api.patch(`/meetings/${id}`, data)
  return res
}

export async function deleteMeeting(id) {
  const { data } = await api.delete(`/meetings/${id}`)
  return data
}
