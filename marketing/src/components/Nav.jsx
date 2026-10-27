import { useState, useEffect } from 'react'
import { Logo } from './Logo.jsx'
import { Container } from './ui.jsx'
import { BuyButton } from './BuyButton.jsx'

const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Download', href: '#download' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Blog', href: '/blog/' },
]

export function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-navy-800/80 bg-navy-950/85 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <Container className="flex h-16 items-center justify-between">
        <Logo />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-slate-300 transition hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <BuyButton>Get Growlance</BuyButton>
        </div>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-navy-700 text-slate-200 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
          aria-expanded={open}
        >
          <div className="space-y-1.5">
            <span className={`block h-0.5 w-5 bg-current transition ${open ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition ${open ? '-translate-y-2 -rotate-45' : ''}`} />
          </div>
        </button>
      </Container>

      {open && (
        <div className="border-t border-navy-800 bg-navy-950/95 backdrop-blur md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-navy-800 hover:text-white"
              >
                {l.label}
              </a>
            ))}
            <BuyButton className="mt-2">Get Growlance</BuyButton>
          </Container>
        </div>
      )}
    </header>
  )
}
