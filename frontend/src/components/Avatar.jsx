// A user's picture, or their initials when there is none (or it fails to load).
import { useState } from 'react'

export default function Avatar({ src, name, size = 'w-10 h-10' }) {
  const [broken, setBroken] = useState(false)
  const initials = String(name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  if (src && !broken && !/unknown\.png$/.test(src)) {
    return <img src={src} alt="" onError={() => setBroken(true)} className={`${size} rounded-full object-cover shrink-0 bg-slate-200 dark:bg-navy-700`} />
  }
  return <div className={`${size} rounded-full shrink-0 flex items-center justify-center text-xs font-semibold bg-slate-200 dark:bg-navy-700 text-slate-600 dark:text-slate-300`}>{initials}</div>
}
