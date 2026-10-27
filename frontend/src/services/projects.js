import api from './api'

export async function searchProjects(filters = {}) {
  const { data } = await api.post('/projects/search', filters)
  return data
}

export async function getProjects(params = {}) {
  const { data } = await api.get('/projects', { params })
  return data
}

export async function getProjectDetail(id) {
  const { data } = await api.get(`/projects/${id}/detail`)
  return data
}

export async function getJobs(jobIds = null) {
  const params = jobIds ? { jobIds: jobIds.join(',') } : {}
  const { data } = await api.get('/projects/jobs', { params })
  return data
}

export async function analyzeProject(id, profileId = null) {
  const body = profileId ? { profileId } : {}
  const { data } = await api.post(`/projects/${id}/analyze`, body)
  return data
}

export async function generateProposal(id, profileId = null) {
  const body = profileId ? { profileId } : {}
  const { data } = await api.post(`/projects/${id}/generate-proposal`, body)
  return data
}
