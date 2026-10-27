import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { user, login, register } = useAuth()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const isElectron = typeof window !== 'undefined' && !!window.electron

  if (user) return <Navigate to="/" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validation
    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (isRegister && password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      if (isRegister) {
        await register(email, password)
      } else {
        await login(email, password)
      }
      // Success - Navigate component will redirect
    } catch (err) {
      const errorMessage = err.response?.data?.error || err.message || 'Something went wrong. Please try again.'
      setError(errorMessage)
      setLoading(false)
      // Clear password on error for security and ease of retry
      setPassword('')
      if (isRegister) setConfirmPassword('')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-black/40 mb-4">
            <img src="/apple-touch-icon.png" alt="Growlance" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Growlance</h1>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-white/10 shadow-2xl shadow-black/40 overflow-hidden">
          {isElectron && (
            <div className="p-3 m-4 mb-0 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              Growlance normally signs you in automatically — seeing this screen means that failed.{' '}
              <button type="button" onClick={() => window.location.reload()} className="font-semibold underline">
                Retry automatic sign-in
              </button>
            </div>
          )}
          {/* Tabs */}
          {!isElectron && (
          <div className="flex border-b border-slate-200">
            <button
              type="button"
              onClick={() => { setIsRegister(false); setError('') }}
              className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                !isRegister
                  ? 'text-navy-900 border-b-2 border-navy-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsRegister(true); setError('') }}
              className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                isRegister
                  ? 'text-navy-900 border-b-2 border-navy-900'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              Create Account
            </button>
          </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400"
              />
            </div>

            {isRegister && (
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium text-white bg-gradient-to-r from-navy-800 to-navy-900 rounded-lg hover:from-navy-700 hover:to-navy-800 transition-all shadow-sm disabled:opacity-50 mt-2"
            >
              {loading
                ? (isRegister ? 'Creating Account...' : 'Signing In...')
                : (isRegister ? 'Create Account' : 'Sign In')
              }
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
