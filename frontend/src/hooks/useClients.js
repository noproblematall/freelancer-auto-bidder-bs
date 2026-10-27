import { useState, useCallback } from 'react'
import * as clientsApi from '../services/clients'

export function useClients() {
  const [clients, setClients] = useState([])
  const [followUps, setFollowUps] = useState({ waitingOnMe: [], noResponse: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchClients = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await clientsApi.getClients()
      setClients(data.clients)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchFollowUps = useCallback(async () => {
    try {
      const data = await clientsApi.getFollowUps()
      setFollowUps(data)
    } catch {
      // silent fail
    }
  }, [])

  const saveNotes = useCallback(async (id, notes) => {
    const data = await clientsApi.updateNotes(id, notes)
    setClients(prev => prev.map(c => c.id === id ? { ...c, notes } : c))
    return data
  }, [])

  return { clients, followUps, loading, error, fetchClients, fetchFollowUps, saveNotes }
}
