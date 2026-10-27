import { Container } from './ui.jsx'
import { Logo } from './Logo.jsx'
import { BRAND, LINKS } from '../config.js'

const COLS = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Download', href: '#download' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog/' },
      { label: 'FAQ', href: '#faq' },
      { label: 'Responsible use', href: '#responsible-use' },
      { label: 'Book a demo', href: LINKS.calendly, external: true },
      { label: 'Contact', href: `mailto:${BRAND.email}` },
    ],
  },
]

export function Footer() {
  return (
    <footer className="border-t border-navy-800 py-12">
      <Container>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              {BRAND.tagline}. Local-first, private, and yours to keep.
            </p>
            <a
              href={`mailto:${BRAND.email}`}
              className="mt-4 inline-block text-sm text-accent-400 hover:underline"
            >
              {BRAND.email}
            </a>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold text-white">{col.title}</div>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      target={l.external ? '_blank' : undefined}
                      rel={l.external ? 'noopener noreferrer' : undefined}
                      className="text-sm text-slate-400 transition hover:text-white"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-navy-800 pt-6 text-xs text-slate-400 sm:flex-row">
          <p>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          <p>
            Not affiliated with or endorsed by Freelancer.com. Use responsibly and in line with their terms.
          </p>
        </div>
      </Container>
    </footer>
  )
}
