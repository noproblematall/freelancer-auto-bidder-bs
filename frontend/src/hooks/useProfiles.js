import { useState, useCallback } from 'react'
import * as profilesApi from '../services/profiles'

export function useProfiles() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchProfiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await profilesApi.getProfiles()
      setProfiles(data.profiles)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }, [])

  const create = useCallback(async (profileData) => {
    const data = await profilesApi.createProfile(profileData)
    setProfiles(prev => [data.profile, ...prev])
    return data
  }, [])

  const update = useCallback(async (id, profileData) => {
    const data = await profilesApi.updateProfile(id, profileData)
    setProfiles(prev => prev.map(p => p.id === id ? data.profile : p))
    return data
  }, [])

  const remove = useCallback(async (id) => {
    await profilesApi.deleteProfile(id)
    setProfiles(prev => prev.filter(p => p.id !== id))
  }, [])

  const duplicate = useCallback(async (id) => {
    const data = await profilesApi.duplicateProfile(id)
    setProfiles(prev => [data.profile, ...prev])
    return data
  }, [])

  const activate = useCallback(async (id) => {
    const data = await profilesApi.activateProfile(id)
    setProfiles(prev => prev.map(p => p.id === id ? data.profile : p))
    return data
  }, [])

  const deactivate = useCallback(async (id) => {
    const data = await profilesApi.deactivateProfile(id)
    setProfiles(prev => prev.map(p => p.id === id ? data.profile : p))
    return data
  }, [])

  return { profiles, loading, error, fetchProfiles, create, update, remove, duplicate, activate, deactivate }
}
