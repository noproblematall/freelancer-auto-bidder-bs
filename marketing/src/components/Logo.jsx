import { BRAND } from '../config.js'

export function Logo({ className = '' }) {
  return (
    <a href="#top" className={`flex items-center gap-2.5 ${className}`}>
      <img
        src="/favicon-96x96.png"
        alt={`${BRAND.name} logo`}
        width="30"
        height="30"
        className="h-[30px] w-[30px] shrink-0"
      />
      <span className="text-lg font-bold tracking-tight text-white">{BRAND.name}</span>
    </a>
  )
}
