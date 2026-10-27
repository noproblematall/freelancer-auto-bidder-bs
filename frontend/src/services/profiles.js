import api from './api'

export async function getProfiles() {
  const { data } = await api.get('/profiles')
  return data
}

export async function getProfile(id) {
  const { data } = await api.get(`/profiles/${id}`)
  return data
}

export async function createProfile(profileData) {
  const { data } = await api.post('/profiles', profileData)
  return data
}

export async function updateProfile(id, profileData) {
  const { data } = await api.put(`/profiles/${id}`, profileData)
  return data
}

export async function deleteProfile(id) {
  const { data } = await api.delete(`/profiles/${id}`)
  return data
}

export async function duplicateProfile(id) {
  const { data } = await api.post(`/profiles/${id}/duplicate`)
  return data
}

export async function activateProfile(id) {
  const { data } = await api.post(`/profiles/${id}/activate`)
  return data
}

export async function deactivateProfile(id) {
  const { data } = await api.post(`/profiles/${id}/deactivate`)
  return data
}

export async function getSharedProfile() {
  const { data } = await api.get('/profiles/shared')
  return data
}

export async function updateSharedProfile(shared) {
  const { data } = await api.put('/profiles/shared', shared)
  return data
}
