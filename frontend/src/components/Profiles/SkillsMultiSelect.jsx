import { useState, useRef, useEffect } from 'react'
import api from '../../services/api'

// Picker for Freelancer skills ("jobs"): type to search the full Freelancer
// skills list, click to add; chips show what is selected. `value` and
// `onChange` work with [{ id, name }].
let jobsCache = null
async function loadJobs() {
  if (jobsCache) return jobsCache
  const { data } = await api.get('/projects/jobs')
  jobsCache = (data.jobs || []).map(j => ({ id: j.id, name: j.name })).filter(j => j.id && j.name)
  return jobsCache
}

export default function SkillsMultiSelect({ value = [], onChange, placeholder = 'Search Freelancer skills (React, Shopify, Laravel…)' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState(jobsCache || [])
  const [loadError, setLoadError] = useState(null)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    loadJobs().then(setJobs).catch(err => setLoadError(err.response?.data?.error || 'Could not load the skills list (is Freelancer connected?)'))
  }, [])

  useEffect(() => {
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = new Set(value.map(j => j.id))
  const q = query.trim().toLowerCase()
  const filtered = q.length >= 1
    ? jobs.filter(j => !selected.has(j.id) && j.name.toLowerCase().includes(q))
        .sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1) || a.name.localeCompare(b.name))
        .slice(0, 30)
    : []

  function add(job) {
    onChange([...value, { id: job.id, name: job.name }])
    setQuery('')
    inputRef.current?.focus()
  }

  function remove(id) {
    onChange(value.filter(j => j.id !== id))
  }

  return (
    <div ref={containerRef} className="relative">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(j => (
            <span key={j.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs bg-navy-50 dark:bg-navy-700 text-navy-700 dark:text-navy-200 border border-navy-200 dark:border-white/10 rounded-full">
              <span>{j.name}</span>
              <button type="button" onClick={() => remove(j.id)} className="ml-0.5 text-navy-400 hover:text-red-500 dark:hover:text-red-400 rounded-full p-0.5" aria-label={`Remove ${j.name}`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 dark:border-white/10 rounded-lg bg-white dark:bg-navy-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 placeholder:text-slate-400 dark:placeholder:text-slate-600"
        />
      </div>
      {loadError && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{loadError}</p>}
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl max-h-52 overflow-y-auto">
          {filtered.map(j => (
            <button key={j.id} type="button" onMouseDown={e => { e.preventDefault(); add(j) }} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
              <span className="flex-1 text-slate-800 dark:text-slate-100">{j.name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">#{j.id}</span>
            </button>
          ))}
        </div>
      )}
      {open && q.length >= 1 && filtered.length === 0 && jobs.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No Freelancer skill matches "{query}"</div>
      )}
    </div>
  )
}
