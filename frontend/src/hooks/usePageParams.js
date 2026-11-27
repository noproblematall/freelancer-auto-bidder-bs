// Page number and page size of a list, kept in the address (?page=3&size=20)
// so a reload, a shared link or coming back from a detail page shows the same
// rows. Page 1 and the default size are left out of the address. `page` is
// 0-based here; the address shows it 1-based.
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export const PAGE_SIZES = [10, 20, 50, 100]
export const DEFAULT_PAGE_SIZE = 10

export function usePageParams(defaultSize = DEFAULT_PAGE_SIZE) {
  const [params, setParams] = useSearchParams()
  const rawSize = parseInt(params.get('size'), 10)
  const size = PAGE_SIZES.includes(rawSize) ? rawSize : defaultSize
  const rawPage = parseInt(params.get('page'), 10)
  const page = Number.isInteger(rawPage) && rawPage > 1 ? rawPage - 1 : 0

  // Other query parameters (filters, tabs) are kept as they are.
  const update = useCallback((changes) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined) next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace: true })
  }, [setParams])

  const setPage = useCallback((p) => update({ page: p > 0 ? String(p + 1) : null }), [update])
  const setSize = useCallback((s) => update({ size: s !== defaultSize ? String(s) : null, page: null }), [update, defaultSize])

  return { page, size, offset: page * size, setPage, setSize }
}
