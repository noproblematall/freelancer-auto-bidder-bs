import api from './api'

// Settings backup as a JSON document (Settings → Backup & Restore)
export async function exportSettings({ secrets = true } = {}) {
  const { data } = await api.get('/backup/export', { params: { secrets: secrets ? 1 : 0 } })
  return data
}

export async function importSettings(backup, { profiles = 'merge' } = {}) {
  const { data } = await api.post('/backup/import', { backup, profiles }, { timeout: 60000 })
  return data
}
