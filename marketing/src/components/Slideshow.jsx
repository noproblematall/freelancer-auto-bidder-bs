import { useState, useEffect, useRef } from 'react'
import { Icon } from './icons.jsx'
import { Lightbox } from './Lightbox.jsx'

// Screenshot slideshow shown inside the app window frame. Adapts to the number
// of screenshots: 1 = static, 2+ = autoplaying carousel with arrows, dots, and
// pointer/touch drag-to-swipe. Click an image (or the expand button) to open it
// full screen in a lightbox.
export function Slideshow({ shots }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [dx, setDx] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  const drag = useRef({ startX: 0, width: 0 })
  const moved = useRef(false)
  const n = shots.length
  const multi = n > 1

  useEffect(() => {
    if (!multi || paused || dragging || lightbox) return
    // Respect reduced-motion: don't auto-advance (WCAG 2.3.3 / 2.2.2)
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setI((p) => (p + 1) % n), 5000)
    return () => clearInterval(id)
  }, [multi, paused, dragging, lightbox, n])

  const go = (d) => setI((p) => (p + d + n) % n)

  const onDown = (e) => {
    drag.current = { startX: e.clientX, width: e.currentTarget.offsetWidth }
    moved.current = false
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e) => {
    if (!dragging) return
    const d = e.clientX - drag.current.startX
    if (Math.abs(d) > 6) moved.current = true
    setDx(d)
  }
  const onUp = () => {
    if (!dragging) return
    if (moved.current && multi) {
      const threshold = Math.min(80, drag.current.width * 0.15)
      if (dx <= -threshold) go(1)
      else if (dx >= threshold) go(-1)
    } else if (!moved.current) {
      setLightbox(true) // a tap (not a drag) opens the lightbox
    }
    setDx(0)
    setDragging(false)
  }

  const arrowCls =
    'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-navy-950/70 text-slate-200 ring-1 ring-navy-700 backdrop-blur transition hover:bg-navy-900 hover:text-white'

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="overflow-hidden rounded-2xl border border-navy-700/80 bg-navy-900/80 shadow-2xl shadow-black/50 backdrop-blur">
        {/* title bar */}
        <div className="flex items-center justify-between border-b border-navy-800 bg-navy-950/60 px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Icon.Shield width={12} height={12} className="text-accent-400" />
            Running locally · localhost
          </div>
          <span className="text-[11px] font-medium text-slate-400">{shots[i].label}</span>
        </div>

        {/* slides (draggable + tap to open lightbox) */}
        <div
          className={`relative overflow-hidden ${dragging ? 'cursor-grabbing' : multi ? 'cursor-grab' : 'cursor-zoom-in'}`}
          style={{ touchAction: 'pan-y' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div
            className="flex select-none"
            style={{
              transform: `translateX(calc(-${i * 100}% + ${dx}px))`,
              transition: dragging ? 'none' : 'transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {shots.map((s, idx) => (
              <img
                key={s.src}
                src={s.src}
                alt={`Growlance — ${s.label}`}
                className="block w-full shrink-0"
                draggable={false}
                loading={idx === 0 ? 'eager' : 'lazy'}
              />
            ))}
          </div>

          {/* expand / fullscreen */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setLightbox(true)}
            aria-label="View full screen"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-navy-950/70 text-slate-200 ring-1 ring-navy-700 backdrop-blur transition hover:bg-navy-900 hover:text-white"
          >
            <Icon.Expand width={15} height={15} />
          </button>

          {multi && (
            <>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => go(-1)}
                aria-label="Previous screenshot"
                className={`${arrowCls} left-3`}
              >
                <Icon.Arrow width={18} height={18} className="rotate-180" />
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => go(1)}
                aria-label="Next screenshot"
                className={`${arrowCls} right-3`}
              >
                <Icon.Arrow width={18} height={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* dots — large 24px+ hit area (WCAG 2.5.8) with a small visual bar */}
      {multi && (
        <div className="mt-3 flex justify-center gap-1">
          {shots.map((s, idx) => (
            <button
              key={s.src}
              onClick={() => setI(idx)}
              aria-label={`Show ${s.label}`}
              aria-current={idx === i ? 'true' : undefined}
              className="group flex h-6 items-center px-1"
            >
              <span
                className={`block h-2 rounded-full transition-all ${
                  idx === i ? 'w-6 bg-accent-400' : 'w-2 bg-navy-600 group-hover:bg-navy-500'
                }`}
              />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <Lightbox shots={shots} index={i} onIndex={setI} onClose={() => setLightbox(false)} />
      )}
    </div>
  )
}
