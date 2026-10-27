import { Nav } from './components/Nav.jsx'
import { Hero } from './components/Hero.jsx'
import { Features } from './components/Features.jsx'
import { HowItWorks } from './components/HowItWorks.jsx'
import { Comparison } from './components/Comparison.jsx'
import { Privacy } from './components/Privacy.jsx'
import { Pricing } from './components/Pricing.jsx'
import { Compliance } from './components/Compliance.jsx'
import { FAQ } from './components/FAQ.jsx'
import { CTASection } from './components/CTASection.jsx'
import { Footer } from './components/Footer.jsx'

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <Features />
        <HowItWorks />
        <Comparison />
        <Privacy />
        <Pricing />
        <Compliance />
        <FAQ />
        <CTASection />
      </main>
      <Footer />
    </>
  )
}
