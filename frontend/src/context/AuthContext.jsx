import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [freelancer, setFreelancer] = useState({ connected: false })
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/status')
      setUser(data.user)
      setFreelancer(data.freelancer)
      return data
    } catch (err) {
      // Only clear the session on a real auth failure. A 500 (e.g. transient
      // backend error or a column-missing query) should NOT wipe the user we
      // just successfully authenticated — that would bounce them back to login.
      if (err?.response?.status === 401) {
        localStorage.removeItem('token')
        setUser(null)
        setFreelancer({ connected: false })
      } else {
        console.warn('fetchStatus failed:', err?.response?.status, err?.response?.data || err?.message)
      }
      throw err
    }
  }, [])

  useEffect(() => {
    // Boot: use the stored token if it still works; otherwise silently open a
    // local single-user session (desktop app — the license gate is the real
    // access control, so there's no signup/login ceremony). If local-session
    // isn't available (e.g. backend outside Electron), the login page shows.
    const boot = async () => {
      const token = localStorage.getItem('token')
      if (token) {
        try {
          await fetchStatus()
          return
        } catch {
          // Fall through and mint a fresh local session on ANY failure — 401
          // (token cleared by fetchStatus) and transient errors alike. Bailing
          // out here stranded desktop users on a login page whose account has
          // a random unknowable password.
        }
      }
      try {
        const { data } = await api.post('/auth/local-session')
        localStorage.setItem('token', data.token)
        setUser(data.user)
        fetchStatus().catch(() => {})
      } catch {
        // Not running against the desktop backend — manual login remains.
      }
    }
    boot().finally(() => setLoading(false))
  }, [fetchStatus])

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
    // Best-effort status hydration — never let a status failure undo a successful login.
    fetchStatus().catch(() => {})
    return data
  }

  const register = async (email, password) => {
    const { data } = await api.post('/auth/register', { email, password })
    localStorage.setItem('token', data.token)
    setUser(data.user)
    fetchStatus().catch(() => {})
    return data
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setFreelancer({ connected: false })
  }

  const updateSettings = async (settings) => {
    const { data } = await api.put('/auth/settings', settings)
    setUser(data.user)
    return data
  }

  const connectFreelancer = async (tokenData) => {
    const { data } = await api.post('/auth/freelancer/connect', tokenData)
    await fetchStatus()
    return data
  }

  const disconnectFreelancer = async () => {
    await api.post('/auth/freelancer/disconnect')
    setFreelancer({ connected: false })
  }

  return (
    <AuthContext.Provider value={{
      user,
      freelancer,
      loading,
      login,
      register,
      logout,
      updateSettings,
      connectFreelancer,
      disconnectFreelancer,
      fetchStatus,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
