import { CHECKOUT } from '../config.js'

// Small coin chips signalling crypto-only checkout. Reads CHECKOUT.acceptedCoins.
export function CryptoBadges({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      {CHECKOUT.acceptedCoins.map((coin) => (
        <span
          key={coin}
          className="inline-flex items-center gap-1 rounded-full border border-navy-700 bg-navy-900/60 px-2.5 py-1 text-[11px] font-medium text-slate-300"
        >
          {coin === 'Lightning' ? '⚡ ' : ''}
          {coin}
        </span>
      ))}
    </div>
  )
}
