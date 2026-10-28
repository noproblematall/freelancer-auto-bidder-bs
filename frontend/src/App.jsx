import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ConfirmProvider } from './components/ConfirmDialog'
import Layout from './components/Layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ProfilesPage from './pages/ProfilesPage'
import ProfileFormPage from './pages/ProfileFormPage'
import JobFiltersPage from './pages/JobFiltersPage'
import ProjectsPage from './pages/ProjectsPage'
import BidsPage from './pages/BidsPage'
import ActivityLogsPage from './pages/ActivityLogsPage'
import SettingsPage from './pages/SettingsPage'
import CalendarPage from './pages/CalendarPage'
import ClientsPage from './pages/ClientsPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-navy-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <ConfirmProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/profiles/new" element={<ProfileFormPage />} />
          <Route path="/profiles/:id/edit" element={<ProfileFormPage />} />
          <Route path="/job-filters" element={<JobFiltersPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/bids" element={<BidsPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/activity" element={<ActivityLogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ConfirmProvider>
  )
}
