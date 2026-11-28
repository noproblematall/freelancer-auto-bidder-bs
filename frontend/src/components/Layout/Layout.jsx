import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import BackToTop from './BackToTop'

// Wide windows (lg, 1024px+): the sidebar is always shown and the page sits
// beside it. Narrower: the sidebar slides in over the page from the ☰ button
// in the header and closes on navigation, Escape or a click outside it.
export default function Layout() {
  const [navOpen, setNavOpen] = useState(false)

  // (Sidebar links close the drawer themselves when clicked.)
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-navy-950 dark:to-navy-900">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen && (
        <div className="fixed inset-0 z-20 bg-navy-950/50 backdrop-blur-[1px] lg:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}
      <Header onMenu={() => setNavOpen((v) => !v)} />
      {/* min-w-0: without it a long unbroken line (a message preview, a URL)
          makes this flex item wider than the window and the page scrolls sideways. */}
      <main className="flex-1 min-w-0 lg:ml-66 pt-16 px-4 sm:px-6 lg:px-8 pb-8">
        <Outlet />
      </main>
      <BackToTop />
    </div>
  )
}
