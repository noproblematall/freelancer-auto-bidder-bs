import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getProfile, createProfile, updateProfile } from '../services/profiles'
import ProfileForm from '../components/Profiles/ProfileForm'

export default function ProfileFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isEdit) return
    getProfile(id)
      .then(data => setProfile(data.profile))
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave(formData) {
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await updateProfile(id, formData)
      } else {
        await createProfile(formData)
      }
      navigate('/profiles')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save profile.')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/profiles')}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors text-slate-500 dark:text-slate-400"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">
            {isEdit ? 'Edit Profile' : 'New Bid Profile'}
          </h1>
          {isEdit && profile && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{profile.name}</p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-navy-900 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-700 dark:text-slate-200">Loading profile...</p>
          </div>
        </div>
      ) : isEdit && !profile ? (
        // Load failed: rendering the form with defaults here would let a save
        // silently overwrite the real profile with empty values.
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error || 'Failed to load profile.'}</p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate('/profiles')}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 dark:bg-navy-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors"
            >
              Back to Profiles
            </button>
          </div>
        </div>
      ) : (
        <ProfileForm
          profile={profile}
          onSave={handleSave}
          onCancel={() => navigate('/profiles')}
          saving={saving}
          error={error}
        />
      )}
    </div>
  )
}
