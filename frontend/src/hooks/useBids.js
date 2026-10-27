import { useState, useCallback, useRef } from 'react'
import * as bidsApi from '../services/bids'

export function useBids() {
  const [bids, setBids] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Every user mutation bumps this. A background poll snapshot taken BEFORE a
  // mutation must not overwrite state AFTER it — otherwise an approved bid
  // briefly flips back to "needs review" and invites a confusing double-approve.
  const mutationGenRef = useRef(0)

  const fetchBids = useCallback(async (params = {}, options = {}) => {
    const { prependNew = false } = options
    const genAtRequest = mutationGenRef.current

    // Only show loading spinner for full refreshes, not for prepend operations
    if (!prependNew) {
      setLoading(true)
    }

    setError(null)
    try {
      const data = await bidsApi.getBids(params)

      // A mutation resolved while this fetch was in flight — its response is
      // stale. Drop it; the next poll tick will bring fresh data.
      if (prependNew && mutationGenRef.current !== genAtRequest) {
        return
      }

      if (prependNew) {
        // Smart update: prepend new bids AND update status of existing ones in-place
        setBids(prevBids => {
          const fetchedById = new Map(data.bids.map(b => [b.id, b]))
          const existingIds = new Set(prevBids.map(b => b.id))
          const newBids = data.bids.filter(b => !existingIds.has(b.id))

          // Merge status/field updates into existing bids (preserves list order, no layout shift)
          let updated = prevBids.map(b => fetchedById.has(b.id) ? fetchedById.get(b.id) : b)

          // Under a status filter, rows whose status no longer matches (approved/
          // dismissed drafts in the "Needs Review" view) would otherwise pile up
          // forever and contradict the count. Drop them once the server stops
          // returning them.
          if (params.status && params.status !== 'all') {
            updated = updated.filter(b => fetchedById.has(b.id) || b.status === params.status)
          }

          if (newBids.length > 0) {
            return [...newBids, ...updated]
          }
          return updated
        })
      } else {
        // Full replace (for pagination, filter changes, etc.)
        setBids(data.bids)
      }

      setTotalCount(data.totalCount)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load bids')
    } finally {
      if (!prependNew) {
        setLoading(false)
      }
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const data = await bidsApi.getBidStats()
      setStats(data)
    } catch {
      // silent fail for stats
    }
  }, [])

  // All mutations bump the generation in `finally`: even a FAILED place/retry
  // changes server state (the bid may flip to 'error'), so any poll snapshot
  // taken before the attempt is stale either way.
  const retract = useCallback(async (id) => {
    try {
      const data = await bidsApi.retractBid(id)
      setBids(prev => prev.map(b => b.id === id ? { ...b, status: 'retracted' } : b))
      return data
    } finally {
      mutationGenRef.current++
    }
  }, [])

  const retry = useCallback(async (id) => {
    try {
      const data = await bidsApi.retryBid(id)
      setBids(prev => prev.map(b => b.id === id ? data.bid : b))
      return data
    } finally {
      mutationGenRef.current++
    }
  }, [])

  const placeNow = useCallback(async (id) => {
    try {
      const data = await bidsApi.placeNowBid(id)
      setBids(prev => prev.map(b => b.id === id ? data.bid : b))
      return data
    } finally {
      mutationGenRef.current++
    }
  }, [])

  const cancel = useCallback(async (id) => {
    try {
      const data = await bidsApi.cancelBid(id)
      setBids(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
      return data
    } finally {
      mutationGenRef.current++
    }
  }, [])

  const update = useCallback(async (id, fields) => {
    try {
      const data = await bidsApi.updateBid(id, fields)
      setBids(prev => prev.map(b => b.id === id ? data.bid : b))
      return data
    } finally {
      mutationGenRef.current++
    }
  }, [])

  return { bids, totalCount, stats, loading, error, fetchBids, fetchStats, retract, retry, placeNow, cancel, update }
}
