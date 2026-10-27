import { Icon } from './icons.jsx'

export function Container({ className = '', children }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>
}

export function Eyebrow({ children }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-accent-400">
      {children}
    </span>
  )
}

export function SectionHeading({ eyebrow, title, subtitle, center = true }) {
  return (
    <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-4 text-3xl font-bold sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">{subtitle}</p>}
    </div>
  )
}

export function PrimaryButton({ href = '#', children, className = '', ...rest }) {
  return (
    <a
      href={href}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl bg-accent-500 px-5 py-3 text-sm font-semibold text-navy-950 shadow-lg shadow-accent-500/20 transition hover:bg-accent-400 hover:shadow-accent-400/30 ${className}`}
      {...rest}
    >
      {children}
      <Icon.Arrow width={16} height={16} className="transition-transform group-hover:translate-x-0.5" />
    </a>
  )
}

export function GhostButton({ href = '#', children, className = '', ...rest }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-navy-700 bg-navy-900/40 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-navy-600 hover:bg-navy-800/60 ${className}`}
      {...rest}
    >
      {children}
    </a>
  )
}
