import { PrimaryButton, GhostButton } from './ui.jsx'
import { CHECKOUT } from '../config.js'

// Single source of truth for the "buy" action. Sends the buyer to the
// same-origin serverless checkout endpoint (api/checkout.js), which creates a
// Plisio invoice and redirects them to pay. No secret key in the browser.
// variant="ghost" renders the secondary style (used where the trial is the
// primary CTA).
export function BuyButton({ children = 'Get Growlance', className = '', variant = 'primary' }) {
  const Btn = variant === 'ghost' ? GhostButton : PrimaryButton
  return (
    <Btn href={CHECKOUT.endpoint} className={className} rel="nofollow">
      {children}
    </Btn>
  )
}
