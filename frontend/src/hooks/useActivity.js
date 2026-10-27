import { useState, useCallback } from 'react'
import * as activityApi from '../services/activity'

export function useActivity() {
  const [logs, setLogs] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchLogs = useCallback(async (params = {}) => {
    setLoading(true)
    setError(null)
    try {
      const data = await activityApi.getActivityLogs(params)
      setLogs(data.logs)
      setTotalCount(data.totalCount)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load activity logs')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const data = await activityApi.getActivityStats()
      setStats(data)
    } catch {
      // silent fail for stats
    }
  }, [])

  return { logs, totalCount, stats, loading, error, fetchLogs, fetchStats }
}
