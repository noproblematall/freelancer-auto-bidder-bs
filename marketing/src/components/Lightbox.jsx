import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons.jsx'

// Full-screen image viewer. Modal with focus trap + restore, Esc / click-outside
// to close, ←/→ to navigate.
export function Lightbox({ shots, index, onIndex, onClose }) {
  const n = shots.length
  const multi = n > 1
  const go = (d) => onIndex((index + d + n) % n)
  const ref = useRef(null)

  // Mount only: move focus into the dialog, lock scroll, restore focus on close.
  useEffect(() => {
    const prevFocused = document.activeElement
    ref.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
      if (prevFocused && prevFocused.focus) prevFocused.focus()
    }
  }, [])

  // Keyboard: Esc, arrows, and a Tab focus-trap (rebinds when nav target changes).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose()
      if (e.key === 'ArrowRight' && multi) go(1)
      else if (e.key === 'ArrowLeft' && multi) go(-1)
      else if (e.key === 'Tab') {
        const f = ref.current?.querySelectorAll('button:not([disabled]), a[href]')
        if (!f || !f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, multi])

  const round =
    'flex items-center justify-center rounded-full bg-navy-900/80 text-slate-200 ring-1 ring-navy-700 transition hover:bg-navy-800 hover:text-white'

  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 outline-none backdrop-blur-sm sm:p-10 animate-fadeUp"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${shots[index].label} screenshot`}
    >
      <div className="absolute left-1/2 top-5 -translate-x-1/2 text-sm font-medium text-slate-300">
        {shots[index].label}
        {multi && <span className="ml-2 text-slate-400">{index + 1} / {n}</span>}
      </div>

      <button onClick={onClose} aria-label="Close" className={`${round} absolute right-4 top-4 h-10 w-10`}>
        <Icon.X width={20} height={20} />
      </button>

      <img
        src={shots[index].src}
        alt={`Growlance — ${shots[index].label}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-lg shadow-2xl ring-1 ring-navy-700/60"
      />

      {multi && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); go(-1) }}
            aria-label="Previous"
            className={`${round} absolute left-4 top-1/2 h-11 w-11 -translate-y-1/2`}
          >
            <Icon.Arrow width={20} height={20} className="rotate-180" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); go(1) }}
            aria-label="Next"
            className={`${round} absolute right-4 top-1/2 h-11 w-11 -translate-y-1/2`}
          >
            <Icon.Arrow width={20} height={20} />
          </button>

          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2" onClick={(e) => e.stopPropagation()}>
            {shots.map((s, idx) => (
              <button
                key={s.src}
                onClick={() => onIndex(idx)}
                aria-label={`Show ${s.label}`}
                className={`h-2 rounded-full transition-all ${
                  idx === index ? 'w-6 bg-accent-400' : 'w-2 bg-navy-600 hover:bg-navy-500'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>,
    document.body
  )
}
