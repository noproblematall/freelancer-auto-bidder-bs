import api from './api'

export async function getClients() {
  const { data } = await api.get('/clients')
  return data
}

export async function getFollowUps() {
  const { data } = await api.get('/clients/follow-ups')
  return data
}

export async function updateNotes(id, notes) {
  const { data } = await api.patch(`/clients/${id}/notes`, { notes })
  return data
}

export async function backfillClients() {
  const { data } = await api.post('/clients/backfill')
  return data
}
