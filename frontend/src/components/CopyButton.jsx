// Copy-to-clipboard button: an icon that turns into a check for two seconds.
// With `children` it is a labelled button ("Copy analysis") instead of an icon.
import { useState } from 'react'

const COPY_ICON = 'M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75'
const CHECK_ICON = 'm4.5 12.75 6 6 9-13.5'

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older shells / no permission: the textarea fallback.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch { return false }
  }
}

export default function CopyButton({ text, label = 'text', size = 'sm', className = '', children }) {
  const [done, setDone] = useState(false)
  async function copy() {
    const value = typeof text === 'function' ? text() : text
    if (await writeClipboard(String(value || ''))) {
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    }
  }
  const icon = (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={done ? 2 : 1.5} stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={done ? CHECK_ICON : COPY_ICON} />
    </svg>
  )
  if (children) {
    return (
      <button
        type="button"
        onClick={copy}
        className={`inline-flex items-center gap-1.5 rounded-lg font-semibold border transition-colors ${size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'} ${done ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-200 bg-white dark:bg-navy-900 hover:bg-slate-50 dark:hover:bg-white/5'} ${className}`}
      >
        {icon}{done ? 'Copied' : children}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={done ? 'Copied' : `Copy ${label}`}
      aria-label={`Copy ${label}`}
      className={`shrink-0 p-1.5 rounded-lg transition-colors ${done ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500 hover:text-navy-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'} ${className}`}
    >
      {icon}
    </button>
  )
}
