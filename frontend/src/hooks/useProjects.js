import { useState, useCallback } from 'react'
import * as projectsApi from '../services/projects'

export function useProjects() {
  const [projects, setProjects] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState(null)

  const fetchProjects = useCallback(async (params = {}) => {
    setLoading(true)
    setError(null)
    try {
      const data = await projectsApi.getProjects(params)
      setProjects(data.projects)
      setTotalCount(data.totalCount)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  const searchFreelancer = useCallback(async (filters) => {
    setSearching(true)
    setError(null)
    try {
      const data = await projectsApi.searchProjects(filters)
      setProjects(data.projects)
      setTotalCount(data.totalCount)
      return data
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed')
      throw err
    } finally {
      setSearching(false)
    }
  }, [])

  const updateProject = useCallback((updatedProject) => {
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? { ...p, ...updatedProject } : p))
  }, [])

  return { projects, totalCount, loading, searching, error, fetchProjects, searchFreelancer, updateProject }
}
