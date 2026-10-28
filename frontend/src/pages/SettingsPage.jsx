import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'

// Settings sections, in display order. The key is used in the URL (?section=…).
const SECTIONS = [
  { key: 'freelancer', label: 'Freelancer.com' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'profile', label: 'Freelancer Profile' },
  { key: 'autobidding', label: 'Auto-Bidding' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'webhook', label: 'Webhook' },
]

export default function SettingsPage() {
  const { user, freelancer, updateSettings, connectFreelancer, disconnectFreelancer, fetchStatus } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  // Which settings section is shown; kept in the URL so links can open a section directly
  const requestedSection = searchParams.get('section')
  const activeSection = SECTIONS.some(s => s.key === requestedSection) ? requestedSection : SECTIONS[0].key
  function selectSection(key) {
    setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('section', key); return next }, { replace: true })
  }
  // Two-step confirm for clearing Freelancer credentials (see handleSaveFlCreds)
  const clearCredsArmedRef = useRef(false)

  const [openaiKey, setOpenaiKey] = useState(user?.openaiConfigured ? '••••••••••••••••' : '')
  const [openaiModel, setOpenaiModel] = useState(user?.openaiModel || 'gpt-5.4-mini')
  const [bidDelaySeconds, setBidDelaySeconds] = useState(user?.bidDelaySeconds ?? 30)
  const [sealBids, setSealBids] = useState(user?.sealBids || false)
  const [bidDelayMessage, setBidDelayMessage] = useState(null)
  const [maxBidsPerHour, setMaxBidsPerHour] = useState(user?.maxBidsPerHour ?? 8)
  const [maxBidsPerDay, setMaxBidsPerDay] = useState(user?.maxBidsPerDay ?? 80)
  const [rateLimitMessage, setRateLimitMessage] = useState(null)
  const [reviewMode, setReviewMode] = useState(user?.reviewMode || false)
  const [skillsSummary, setSkillsSummary] = useState(user?.skillsSummary || '')
  const [experienceSummary, setExperienceSummary] = useState(user?.experienceSummary || '')
  const [portfolioHighlights, setPortfolioHighlights] = useState(user?.portfolioHighlights || '')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMessage, setProfileMessage] = useState(null)
  const [openaiTesting, setOpenaiTesting] = useState(false)
  const [openaiTestMessage, setOpenaiTestMessage] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState(null)
  const [flClientId, setFlClientId] = useState(user?.freelancerClientId || '')
  const [flClientSecret, setFlClientSecret] = useState(user?.freelancerApiConfigured ? '••••••••••••••••' : '')
  const [flCredsSaving, setFlCredsSaving] = useState(false)
  const [flCredsSaveMessage, setFlCredsSaveMessage] = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [callbackStatus, setCallbackStatus] = useState(null)
  const [callbackErrorReason, setCallbackErrorReason] = useState(null)
  const [schedulerStatus, setSchedulerStatus] = useState(null)
  const [activeProfileCount, setActiveProfileCount] = useState(0)
  const [triggering, setTriggering] = useState(false)
  const [triggerMessage, setTriggerMessage] = useState(null)

  // Schedule settings
  const [scheduleEnabled, setScheduleEnabled] = useState(user?.schedule?.enabled || false)
  const [timezone, setTimezone] = useState(user?.schedule?.timezone || 'America/New_York')
  const [startTime, setStartTime] = useState(user?.schedule?.startTime || '09:00')
  const [endTime, setEndTime] = useState(user?.schedule?.endTime || '17:00')
  const [activeDays, setActiveDays] = useState(user?.schedule?.days || [1, 2, 3, 4, 5])
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleSaveMessage, setScheduleSaveMessage] = useState(null)

  // Telegram notification settings
  const [telegramEnabled, setTelegramEnabled] = useState(user?.telegram?.enabled || false)
  const [telegramBidNotifications, setTelegramBidNotifications] = useState(user?.telegram?.bidNotificationsEnabled || false)
  const [telegramBotToken, setTelegramBotToken] = useState(user?.telegram?.configured ? '••••••••••••••••' : '')
  const [telegramChatId, setTelegramChatId] = useState(user?.telegram?.chatId || '')
  const [telegramSaving, setTelegramSaving] = useState(false)
  const [telegramSaveMessage, setTelegramSaveMessage] = useState(null)
  const [telegramTesting, setTelegramTesting] = useState(false)
  const [telegramTestMessage, setTelegramTestMessage] = useState(null)

  // Webhook settings
  const [webhookEnabled, setWebhookEnabled] = useState(user?.webhook?.enabled || false)
  const [webhookUrl, setWebhookUrl] = useState(user?.webhook?.url || '')
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookSaveMessage, setWebhookSaveMessage] = useState(null)
  const [webhookTesting, setWebhookTesting] = useState(false)
  const [webhookTestMessage, setWebhookTestMessage] = useState(null)

  // Load scheduler status and active profiles
  useEffect(() => {
    async function loadAutoBidStatus() {
      try {
        const [{ data: status }, { data: profileData }] = await Promise.all([
          api.get('/scheduler/status'),
          api.get('/profiles'),
        ])
        setSchedulerStatus(status)
        setActiveProfileCount(profileData.profiles?.filter(p => p.isActive).length || 0)
      } catch {
        // fail silently if not logged in yet
      }
    }
    loadAutoBidStatus()
  }, [])

  // Sync schedule state when user data changes
  useEffect(() => {
    if (user?.bidDelaySeconds !== undefined) {
      setBidDelaySeconds(user.bidDelaySeconds)
    }
    if (user?.sealBids !== undefined) {
      setSealBids(user.sealBids)
    }
    if (user?.maxBidsPerHour !== undefined) setMaxBidsPerHour(user.maxBidsPerHour)
    if (user?.maxBidsPerDay !== undefined) setMaxBidsPerDay(user.maxBidsPerDay)
    if (user?.reviewMode !== undefined) setReviewMode(user.reviewMode)
    if (user?.skillsSummary !== undefined) setSkillsSummary(user.skillsSummary || '')
    if (user?.experienceSummary !== undefined) setExperienceSummary(user.experienceSummary || '')
    if (user?.portfolioHighlights !== undefined) setPortfolioHighlights(user.portfolioHighlights || '')
    if (user?.schedule) {
      setScheduleEnabled(user.schedule.enabled || false)
      setTimezone(user.schedule.timezone || 'America/New_York')
      setStartTime(user.schedule.startTime || '09:00')
      setEndTime(user.schedule.endTime || '17:00')
      setActiveDays(user.schedule.days || [1, 2, 3, 4, 5])
    }
    if (user?.telegram) {
      setTelegramEnabled(user.telegram.enabled || false)
      setTelegramBidNotifications(user.telegram.bidNotificationsEnabled || false)
      if (user.telegram.configured) setTelegramBotToken('••••••••••••••••')
      setTelegramChatId(user.telegram.chatId || '')
    }
    if (user?.webhook) {
      setWebhookEnabled(user.webhook.enabled || false)
      setWebhookUrl(user.webhook.url || '')
    }
    // Re-sync OpenAI fields once real status hydrates — without this, a Settings
    // mount before hydration shows the default model, and Save would silently
    // overwrite the user's saved choice.
    if (user?.openaiModel) setOpenaiModel(user.openaiModel)
    if (user?.openaiConfigured) setOpenaiKey('••••••••••••••••')
    if (user?.freelancerClientId) setFlClientId(user.freelancerClientId)
    if (user?.freelancerApiConfigured) setFlClientSecret('••••••••••••••••')
  }, [user])

  // Handle OAuth callback redirect
  // Tokens are now stored server-side in the callback; we just refresh auth state
  useEffect(() => {
    if (searchParams.get('fl_callback') === 'true') {
      setCallbackStatus('connecting')
      fetchStatus()
        .then(() => {
          setCallbackStatus('success')
          setTimeout(() => setCallbackStatus(null), 4000)
        })
        .catch(() => {
          setCallbackStatus('error')
        })
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('fl_callback') === 'error') {
      const reason = searchParams.get('reason')
      const reasonLabel = {
        invalid_state: 'OAuth state was invalid or expired. Please try again.',
        missing_credentials: 'Freelancer API credentials are missing. Save them first, then reconnect.',
        decryption_error: 'Could not decrypt your stored credentials. Re-enter them and try again.',
      }[reason] || null
      setCallbackStatus('error')
      setCallbackErrorReason(reasonLabel)
      setSearchParams({}, { replace: true })
    }
  }, [])

  const models = [
    { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano', desc: 'Cheapest — great for high volume', cost: '~$0.20 / $1.25 per 1M tokens' },
    { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', desc: 'Recommended — best value', cost: '~$0.75 / $4.50 per 1M tokens' },
    { value: 'gpt-5.4', label: 'GPT-5.4', desc: 'Highest quality', cost: '~$2.50 / $15 per 1M tokens' },
  ]

  const COMMON_TIMEZONES = [
    { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
    { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
    { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
    { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
    { value: 'America/Anchorage', label: 'Alaska' },
    { value: 'Pacific/Honolulu', label: 'Hawaii' },
    { value: 'Europe/London', label: 'London (GMT)' },
    { value: 'Europe/Paris', label: 'Paris (CET)' },
    { value: 'Europe/Berlin', label: 'Berlin (CET)' },
    { value: 'Asia/Dubai', label: 'Dubai (GST)' },
    { value: 'Asia/Kolkata', label: 'India (IST)' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT)' },
    { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
    { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
  ]

  const DAYS = [
    { value: 0, label: 'S', name: 'Sunday' },
    { value: 1, label: 'M', name: 'Monday' },
    { value: 2, label: 'T', name: 'Tuesday' },
    { value: 3, label: 'W', name: 'Wednesday' },
    { value: 4, label: 'T', name: 'Thursday' },
    { value: 5, label: 'F', name: 'Friday' },
    { value: 6, label: 'S', name: 'Saturday' },
  ]

  async function handleSaveOpenAI(e) {
    e.preventDefault()
    setSaving(true)
    setSaveMessage(null)
    try {
      const payload = { openaiModel }
      if (openaiKey && !openaiKey.startsWith('••')) {
        payload.openaiApiKey = openaiKey
      }
      await updateSettings(payload)
      // Re-mask the key so the plaintext doesn't linger on screen
      if (payload.openaiApiKey) setOpenaiKey('••••••••••••••••')
      setSaveMessage({ type: 'success', text: 'Settings saved successfully.' })
      setTimeout(() => setSaveMessage(null), 4000)
    } catch {
      // Errors persist until the next attempt so they can actually be read
      setSaveMessage({ type: 'error', text: 'Failed to save settings. Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleTestOpenAI() {
    setOpenaiTesting(true)
    setOpenaiTestMessage(null)
    try {
      // Test the typed key if there is one; otherwise the saved key.
      const payload = openaiKey && !openaiKey.startsWith('••') ? { apiKey: openaiKey } : {}
      await api.post('/auth/openai/test', payload)
      setOpenaiTestMessage({ type: 'success', text: 'Key works — OpenAI accepted it.' })
      setTimeout(() => setOpenaiTestMessage(null), 6000)
    } catch (err) {
      setOpenaiTestMessage({ type: 'error', text: err.response?.data?.error || 'Key test failed.' })
    } finally {
      setOpenaiTesting(false)
    }
  }

  async function handleSaveProfileContext(e) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMessage(null)
    try {
      await updateSettings({ skillsSummary, experienceSummary, portfolioHighlights })
      setProfileMessage({ type: 'success', text: 'Saved.' })
      setTimeout(() => setProfileMessage(null), 2500)
    } catch (err) {
      setProfileMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save — try again.' })
    } finally {
      setProfileSaving(false)
    }
  }

  // Save a rate-limit field on blur (same pattern as bid delay): clamp, persist, report.
  async function saveRateLimit(field, raw, max, setter) {
    let value = parseInt(raw, 10)
    if (isNaN(value) || value < 1) value = 1
    if (value > max) value = max
    setter(value)
    setRateLimitMessage(null)
    try {
      await updateSettings({ [field]: value })
      setRateLimitMessage({ type: 'success', text: 'Saved.' })
      setTimeout(() => setRateLimitMessage(null), 2500)
    } catch {
      setRateLimitMessage({ type: 'error', text: 'Failed to save rate limit — try again.' })
    }
  }

  async function handleToggleScheduler() {
    const endpoint = schedulerStatus?.running ? '/scheduler/stop' : '/scheduler/start'
    try {
      const { data } = await api.post(endpoint)
      setSchedulerStatus(data)
    } catch (err) {
      setTriggerMessage({
        type: 'error',
        text: err.response?.data?.error || ('Failed to ' + (schedulerStatus?.running ? 'stop' : 'start') + ' the auto-bidder.'),
      })
    }
  }

  async function handleTrigger() {
    setTriggering(true)
    setTriggerMessage(null)
    try {
      await api.post('/scheduler/trigger')
      setTriggerMessage({ type: 'success', text: 'Auto-bid run triggered. Check Bids page for results.' })
      setTimeout(() => setTriggerMessage(null), 5000)
    } catch (err) {
      setTriggerMessage({ type: 'error', text: err.response?.data?.error || 'Failed to trigger run' })
    } finally {
      setTriggering(false)
    }
  }

  async function handleSaveFlCreds(e) {
    e.preventDefault()
    // Client-side validation: if entering a new ID, a Secret must also be present
    // (unless the user already has one on file — then the field can be left blank
    // or kept masked to mean "keep existing").
    const secretAlreadyOnFile = flClientSecret.startsWith('••')
    const hasUsableSecret = !!flClientSecret && !secretAlreadyOnFile
    if (flClientId && !hasUsableSecret && !user?.freelancerApiConfigured) {
      setFlCredsSaveMessage({ type: 'error', text: 'Both Client ID and Client Secret are required.' })
      return
    }
    // Clearing saved credentials disconnects the account — require a second
    // click so it can't happen from an accidental empty save.
    if (!flClientId && user?.freelancerApiConfigured) {
      if (!clearCredsArmedRef.current) {
        clearCredsArmedRef.current = true
        setFlCredsSaveMessage({ type: 'error', text: 'This will clear your credentials and disconnect Freelancer. Click Save again to confirm.' })
        return
      }
      clearCredsArmedRef.current = false
    }
    setFlCredsSaving(true)
    setFlCredsSaveMessage(null)
    try {
      const payload = { freelancerClientId: flClientId }
      if (hasUsableSecret) {
        payload.freelancerClientSecret = flClientSecret
      } else if (!flClientId) {
        // User cleared the ID — also clear the secret
        payload.freelancerClientSecret = ''
      }
      // else: omit secret entirely → backend keeps existing
      const wasConnected = freelancer?.connected
      await updateSettings(payload)
      // Re-fetch full status so the Connect button picks up the new state and
      // the legacy-token banner clears if creds were just added.
      const fresh = await fetchStatus()
      if (wasConnected && !fresh?.freelancer?.connected) {
        // Changing creds resets the OAuth token server-side — say so, loudly,
        // or the user only discovers it when bidding silently stops.
        setFlCredsSaveMessage({ type: 'error', text: 'Credentials saved — your Freelancer connection was reset. Click Connect to re-authorize.' })
      } else {
        setFlCredsSaveMessage({ type: 'success', text: 'API credentials saved.' })
        setTimeout(() => setFlCredsSaveMessage(null), 4000)
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Failed to save credentials.'
      setFlCredsSaveMessage({ type: 'error', text: msg })
    } finally {
      setFlCredsSaving(false)
    }
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const { data } = await api.get('/auth/freelancer')
      window.location.href = data.url
    } catch (err) {
      setConnecting(false)
      const code = err?.response?.data?.code
      if (code === 'missing_credentials') {
        setFlCredsSaveMessage({ type: 'error', text: 'Save your Client ID and Client Secret first.' })
      } else {
        setCallbackStatus('error')
      }
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await disconnectFreelancer()
    } catch (err) {
      setFlCredsSaveMessage({ type: 'error', text: err.response?.data?.error || 'Failed to disconnect. Please try again.' })
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleSaveSchedule() {
    setScheduleSaving(true)
    setScheduleSaveMessage(null)
    try {
      await updateSettings({
        scheduleEnabled,
        scheduleTimezone: timezone,
        scheduleStartTime: startTime,
        scheduleEndTime: endTime,
        scheduleDays: activeDays,
      })
      setScheduleSaveMessage({ type: 'success', text: 'Schedule saved successfully.' })
      setTimeout(() => setScheduleSaveMessage(null), 4000)
    } catch {
      setScheduleSaveMessage({ type: 'error', text: 'Failed to save schedule. Please try again.' })
    } finally {
      setScheduleSaving(false)
    }
  }

  async function handleSaveTelegram() {
    setTelegramSaving(true)
    setTelegramSaveMessage(null)
    try {
      const payload = { telegramEnabled, telegramBidNotificationsEnabled: telegramBidNotifications, telegramChatId }
      if (telegramBotToken && !telegramBotToken.startsWith('••')) {
        payload.telegramBotToken = telegramBotToken
      }
      await updateSettings(payload)
      const missingConfig = (telegramEnabled || telegramBidNotifications) && (!telegramChatId || (!telegramBotToken && !user?.telegram?.configured))
      if (missingConfig) {
        setTelegramSaveMessage({ type: 'error', text: 'Saved — but notifications are ON without a Bot Token and Chat ID, so nothing will be sent yet.' })
      } else {
        setTelegramSaveMessage({ type: 'success', text: 'Telegram settings saved.' })
        setTimeout(() => setTelegramSaveMessage(null), 4000)
      }
    } catch {
      setTelegramSaveMessage({ type: 'error', text: 'Failed to save Telegram settings.' })
    } finally {
      setTelegramSaving(false)
    }
  }

  async function handleTestTelegram() {
    setTelegramTesting(true)
    setTelegramTestMessage(null)
    try {
      await api.post('/notifications/telegram/test')
      setTelegramTestMessage({ type: 'success', text: 'Test notification sent! Check your Telegram.' })
      setTimeout(() => setTelegramTestMessage(null), 6000)
    } catch (err) {
      setTelegramTestMessage({ type: 'error', text: err.response?.data?.error || 'Failed to send test notification.' })
    } finally {
      setTelegramTesting(false)
    }
  }

  async function handleSaveWebhook() {
    setWebhookSaving(true)
    setWebhookSaveMessage(null)
    try {
      await updateSettings({ webhookEnabled, webhookUrl })
      if (webhookEnabled && !webhookUrl) {
        setWebhookSaveMessage({ type: 'error', text: 'Saved — but the webhook is ON without an endpoint URL, so nothing will fire yet.' })
      } else {
        setWebhookSaveMessage({ type: 'success', text: 'Webhook settings saved.' })
        setTimeout(() => setWebhookSaveMessage(null), 4000)
      }
    } catch (err) {
      setWebhookSaveMessage({ type: 'error', text: err.response?.data?.error || 'Failed to save webhook settings.' })
    } finally {
      setWebhookSaving(false)
    }
  }

  async function handleTestWebhook() {
    setWebhookTesting(true)
    setWebhookTestMessage(null)
    try {
      const { data } = await api.post('/notifications/webhook/test')
      setWebhookTestMessage({ type: 'success', text: `Test event delivered (HTTP ${data.status}).` })
      setTimeout(() => setWebhookTestMessage(null), 6000)
    } catch (err) {
      setWebhookTestMessage({ type: 'error', text: err.response?.data?.error || 'Failed to reach the webhook.' })
    } finally {
      setWebhookTesting(false)
    }
  }

  function toggleDay(day) {
    if (activeDays.includes(day)) {
      setActiveDays(activeDays.filter(d => d !== day))
    } else {
      setActiveDays([...activeDays, day].sort())
    }
  }

  function getCurrentScheduleStatus() {
    if (!scheduleEnabled) return null

    try {
      const now = new Date()

      // Use Intl API to get time components in user's timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })

      const parts = formatter.formatToParts(now)
      const get = (type) => parts.find(p => p.type === type)?.value

      // Map weekday names to numbers (0=Sunday, 6=Saturday)
      const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 }
      const currentDay = dayMap[get('weekday')] ?? 0
      const currentTime = `${String(get('hour')).padStart(2, '0')}:${String(get('minute')).padStart(2, '0')}`

      const dayAllowed = activeDays.includes(currentDay)
      const timeAllowed = currentTime >= startTime && currentTime < endTime

      if (dayAllowed && timeAllowed) {
        return { active: true, text: 'Currently ACTIVE - auto-bidding will run' }
      } else if (!dayAllowed) {
        return { active: false, text: 'Currently PAUSED - today is not an active day' }
      } else {
        return { active: false, text: `Currently PAUSED - outside time window (${startTime}-${endTime})` }
      }
    } catch {
      return null
    }
  }

  const flStatus = freelancer.connected
    ? freelancer.expired ? 'expired' : 'connected'
    : 'disconnected'

  const aiStatus = user?.openaiConfigured ? 'configured' : 'not-configured'

  const schedulerRunning = schedulerStatus?.running

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-950 dark:text-white">Settings</h1>
          <p className="text-sm text-slate-700 dark:text-slate-200 mt-1">Manage your connections, preferences, and automation schedule</p>
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-navy-800 border border-slate-200 dark:border-white/8">
          v{__APP_VERSION__}
        </span>
      </div>

      {/* Section navigation + the selected section */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <nav aria-label="Settings sections" className="w-full lg:w-44 shrink-0 lg:sticky lg:top-6">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {SECTIONS.map(s => {
              const active = s.key === activeSection
              return (
                <li key={s.key} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => selectSection(s.key)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full block px-3 py-2 rounded-lg text-sm text-left whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 font-medium shadow-sm'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-800'
                    }`}
                  >
                    {s.label}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="flex-1 min-w-0 space-y-6">

          {/* Freelancer.com Connection */}
          {activeSection === 'freelancer' && (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-navy-800 to-navy-950 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-navy-950 dark:text-white">Freelancer.com</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-400">Project discovery and bidding.</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                  flStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : flStatus === 'expired' ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    flStatus === 'connected' ? 'bg-emerald-500' : flStatus === 'expired' ? 'bg-amber-500' : 'bg-slate-400'
                  }`} />
                  {flStatus === 'connected' ? 'Connected' : flStatus === 'expired' ? 'Expired' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* API Credentials sub-section */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">API Credentials</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                Register your own app at{' '}
                <a href="https://accounts.freelancer.com/settings/develop" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                  accounts.freelancer.com
                </a>{' '}
                and set the redirect URI to:{' '}
                <code className="bg-slate-100 dark:bg-navy-900 px-1 py-0.5 rounded text-xs font-mono select-all">
                  {freelancer?.redirectUri || 'http://localhost:3741/api/auth/freelancer/callback'}
                </code>
              </p>
              {freelancer?.connected && freelancer?.needsCredentials && (
                <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
                  <strong>Action required:</strong> Your existing Freelancer connection was made before per-user API credentials were introduced and can no longer be refreshed. Add your Client ID and Client Secret below, then reconnect.
                </div>
              )}
              <form onSubmit={handleSaveFlCreds} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Client ID</label>
                  <input
                    type="text"
                    value={flClientId}
                    onChange={e => setFlClientId(e.target.value)}
                    placeholder="Your Freelancer app Client ID"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Client Secret</label>
                  <input
                    type="password"
                    value={flClientSecret}
                    onChange={e => setFlClientSecret(e.target.value)}
                    onFocus={() => {
                      // Clear the masked placeholder on focus so the user can't
                      // edit it into a partially-masked, partially-real string
                      // that would later overwrite the real secret with garbage.
                      if (flClientSecret.startsWith('••')) setFlClientSecret('')
                    }}
                    onBlur={() => {
                      // Restore the mask if the user leaves without typing anything,
                      // so the form still reflects "secret on file".
                      if (!flClientSecret && user?.freelancerApiConfigured) {
                        setFlClientSecret('••••••••••••••••')
                      }
                    }}
                    placeholder={user?.freelancerApiConfigured ? 'Leave blank to keep existing' : 'Your Freelancer app Client Secret'}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={flCredsSaving || (!flClientId && !user?.freelancerApiConfigured)}
                    title={!flClientId && !user?.freelancerApiConfigured ? 'Enter your Client ID and Secret first' : undefined}
                    className="px-4 py-2 text-sm font-medium text-white bg-navy-800 dark:bg-navy-700 rounded-lg hover:bg-navy-700 dark:hover:bg-navy-600 transition-colors disabled:opacity-50"
                  >
                    {flCredsSaving ? 'Saving...' : 'Save Credentials'}
                  </button>
                  {flCredsSaveMessage && (
                    <p className={`text-xs ${flCredsSaveMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {flCredsSaveMessage.text}
                    </p>
                  )}
                  {user?.freelancerApiConfigured && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Configured</span>
                  )}
                </div>
              </form>
            </div>

            <div className="px-6 py-5">
              {callbackStatus === 'connecting' && (
                <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-navy-50 dark:bg-navy-900/50 border border-navy-200 dark:border-white/8 text-sm text-navy-700 dark:text-navy-300">
                  <div className="w-4 h-4 border-2 border-navy-500 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  Connecting your Freelancer account...
                </div>
              )}
              {callbackStatus === 'success' && (
                <div className="p-3 mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400">
                  Freelancer account connected successfully!
                </div>
              )}
              {callbackStatus === 'error' && (
                <div className="p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                  {callbackErrorReason || 'Failed to connect. Please try again.'}
                </div>
              )}
              {freelancer.connected ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Connected</p>
                      {freelancer.username && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 truncate">@{freelancer.username}</p>
                      )}
                    </div>
                    {freelancer.expired && (
                      <span className="text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                        Token Expired
                      </span>
                    )}
                  </div>

                  {freelancer.expired && (
                    <button
                      onClick={handleConnect}
                      disabled={connecting}
                      className="w-full py-2.5 text-sm font-medium text-navy-950 bg-emerald-400 rounded-lg hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                    >
                      {connecting ? 'Redirecting...' : 'Re-authorize'}
                    </button>
                  )}

                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="w-full py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-navy-700 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors disabled:opacity-50"
                  >
                    {disconnecting ? 'Disconnecting...' : 'Disconnect Account'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0" />
                    <p className="text-sm text-slate-700 dark:text-slate-200">No Freelancer account connected.</p>
                  </div>

                  <button
                    onClick={handleConnect}
                    disabled={connecting || !user?.freelancerApiConfigured}
                    title={!user?.freelancerApiConfigured ? 'Save your API credentials above first' : undefined}
                    className="w-full py-2.5 text-sm font-medium text-white bg-gradient-to-r from-navy-800 to-navy-900 dark:from-emerald-400 dark:to-emerald-500 dark:text-navy-950 rounded-lg hover:from-navy-700 hover:to-navy-800 dark:hover:from-emerald-500 dark:hover:to-emerald-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {connecting ? 'Redirecting to Freelancer...' : 'Connect Freelancer Account'}
                  </button>

                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                    {user?.freelancerApiConfigured
                      ? 'You will be redirected to Freelancer.com to authorize access.'
                      : 'Save your API credentials above to enable the Connect button.'}
                  </p>
                </div>
              )}
            </div>
          </div>
          )}

          {/* OpenAI Configuration */}
          {activeSection === 'openai' && (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden h-fit">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-navy-950 dark:text-white">OpenAI</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-400">AI model for proposals.</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                  aiStatus === 'configured'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${aiStatus === 'configured' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {aiStatus === 'configured' ? 'Configured' : 'Not Set'}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveOpenAI} className="px-6 py-5 space-y-5">
              <div>
                <label htmlFor="openai-key" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  API Key
                </label>
                <input
                  id="openai-key"
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Your key is encrypted and stored securely. Get one at platform.openai.com
                </p>
              </div>

              <div>
                <label htmlFor="openai-model" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Model
                </label>
                <div className="space-y-2">
                  {models.map((model) => (
                    <button
                      key={model.value}
                      type="button"
                      onClick={() => setOpenaiModel(model.value)}
                      className={`w-full p-3 rounded-lg border text-left transition-all ${
                        openaiModel === model.value
                          ? 'border-navy-500 dark:border-emerald-500 bg-navy-50 dark:bg-navy-900/50 ring-1 ring-navy-500/20 dark:ring-emerald-500/20'
                          : 'border-slate-200 dark:border-white/8 bg-white dark:bg-navy-900/30 hover:border-slate-300 dark:hover:border-navy-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium ${
                          openaiModel === model.value ? 'text-navy-900 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'
                        }`}>
                          {model.label}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{model.cost}</p>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">{model.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  type="button"
                  onClick={handleTestOpenAI}
                  disabled={openaiTesting || (!user?.openaiConfigured && (!openaiKey || openaiKey.startsWith('••')))}
                  title={!user?.openaiConfigured && (!openaiKey || openaiKey.startsWith('••')) ? 'Enter or save an API key first' : 'Verify the key works with OpenAI'}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-navy-700 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors disabled:opacity-50"
                >
                  {openaiTesting ? 'Testing...' : 'Test Key'}
                </button>

                {saveMessage && (
                  <p className={`text-sm font-medium ${
                    saveMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {saveMessage.text}
                  </p>
                )}
              </div>
              {openaiTestMessage && (
                <p className={`text-sm font-medium mt-2 ${
                  openaiTestMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {openaiTestMessage.text}
                </p>
              )}
            </form>
          </div>
          )}

          {/* Freelancer Profile (AI context) */}
          {activeSection === 'profile' && (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-navy-950 dark:text-white">Freelancer Profile</h2>
                  <p className="text-sm text-slate-700 dark:text-slate-400">What the AI knows about you when scoring projects and writing proposals.</p>
                </div>
              </div>
            </div>
            <form onSubmit={handleSaveProfileContext} className="p-6 space-y-4">
              <div>
                <label htmlFor="skills-summary" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Skills Summary</label>
                <textarea id="skills-summary" rows={3} value={skillsSummary} onChange={(e) => setSkillsSummary(e.target.value)} className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600" placeholder="Senior full-stack developer, 10 years React/Node..." />
              </div>
              <div>
                <label htmlFor="experience-summary" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Experience Summary</label>
                <textarea id="experience-summary" rows={3} value={experienceSummary} onChange={(e) => setExperienceSummary(e.target.value)} className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600" placeholder="Describe your past work and expertise..." />
              </div>
              <div>
                <label htmlFor="portfolio-highlights" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Portfolio Highlights</label>
                <textarea id="portfolio-highlights" rows={3} value={portfolioHighlights} onChange={(e) => setPortfolioHighlights(e.target.value)} className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-600" placeholder="Notable projects or clients to mention in bids..." />
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200">Used for every bid profile. Leave blank and the AI falls back to a generic developer profile.</p>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="px-4 py-2 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
                {profileMessage && (
                  <span className={`text-xs font-medium ${
                    profileMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {profileMessage.text}
                  </span>
                )}
              </div>
            </form>
          </div>
          )}

          {/* Telegram Notifications */}
          {activeSection === 'telegram' && (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L8.32 13.617 5.32 12.69c-.656-.204-.668-.656.136-.97l10.57-4.074c.548-.2 1.027.136.868.575z"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-navy-950 dark:text-white">Telegram Notifications</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-400">Get notified of new messages and bids.</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                  user?.telegram?.configured
                    ? 'bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${user?.telegram?.configured ? 'bg-sky-500' : 'bg-slate-400'}`} />
                  {user?.telegram?.configured ? 'Configured' : 'Not Set'}
                </span>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <div>
                  <p className="text-sm font-medium text-navy-950 dark:text-white">Message Notifications</p>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">
                    {telegramEnabled
                      ? 'Sends a Telegram message when someone messages you on Freelancer'
                      : 'Notifications are disabled'}
                  </p>
                </div>
                <button
                  onClick={() => setTelegramEnabled(!telegramEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    telegramEnabled ? 'bg-sky-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    telegramEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Bid Notifications toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <div>
                  <p className="text-sm font-medium text-navy-950 dark:text-white">Bid Notifications</p>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">
                    {telegramBidNotifications
                      ? 'Sends a message when a bid is placed or fails'
                      : 'Bid notifications are disabled'}
                  </p>
                </div>
                <button
                  onClick={() => setTelegramBidNotifications(!telegramBidNotifications)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    telegramBidNotifications ? 'bg-sky-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    telegramBidNotifications ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Bot Token */}
              <div>
                <label htmlFor="tg-token" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Bot Token
                </label>
                <input
                  id="tg-token"
                  type="password"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  placeholder="1234567890:ABCDefgh..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors placeholder:text-slate-400"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Create a bot via <span className="font-medium">@BotFather</span> on Telegram to get your token.
                </p>
              </div>

              {/* Chat ID(s) */}
              <div>
                <label htmlFor="tg-chat" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Chat ID(s)
                </label>
                <input
                  id="tg-chat"
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="e.g. 123456789, 987654321"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-colors placeholder:text-slate-400"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Separate multiple Chat IDs with commas to broadcast to several recipients. Message <span className="font-medium">@userinfobot</span> on Telegram to find a Chat ID.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSaveTelegram}
                  disabled={telegramSaving}
                  className="px-5 py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  {telegramSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleTestTelegram}
                  disabled={telegramTesting || !user?.telegram?.configured}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-navy-700 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors disabled:opacity-50"
                  title={!user?.telegram?.configured ? 'Save your Bot Token and Chat ID first' : ''}
                >
                  {telegramTesting ? 'Sending...' : 'Test Notification'}
                </button>
              </div>

              {telegramSaveMessage && (
                <p className={`text-sm font-medium ${
                  telegramSaveMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {telegramSaveMessage.text}
                </p>
              )}
              {telegramTestMessage && (
                <p className={`text-sm font-medium ${
                  telegramTestMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {telegramTestMessage.text}
                </p>
              )}
            </div>
          </div>
          )}

          {/* Webhook */}
          {activeSection === 'webhook' && (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-navy-950 dark:text-white">Webhook</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-400">POST new-message events to your own endpoint.</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                  user?.webhook?.url
                    ? 'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${user?.webhook?.url ? 'bg-violet-500' : 'bg-slate-400'}`} />
                  {user?.webhook?.url ? 'Configured' : 'Not Set'}
                </span>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Enable toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <div>
                  <p className="text-sm font-medium text-navy-950 dark:text-white">Fire on New Messages</p>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">
                    {webhookEnabled
                      ? 'Sends a message.received event to your endpoint when someone messages you on Freelancer'
                      : 'Webhook is disabled'}
                  </p>
                </div>
                <button
                  onClick={() => setWebhookEnabled(!webhookEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    webhookEnabled ? 'bg-violet-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    webhookEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {/* Endpoint URL */}
              <div>
                <label htmlFor="wh-url" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Endpoint URL
                </label>
                <input
                  id="wh-url"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.example.com/growlance"
                  className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-colors placeholder:text-slate-400"
                />
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Growlance sends <span className="font-mono">POST</span> JSON: <span className="font-mono">{'{ event, timestamp, data }'}</span> with sender, message, project, and thread link. Works with Zapier, n8n, Make, or your own server.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSaveWebhook}
                  disabled={webhookSaving}
                  className="px-5 py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  {webhookSaving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleTestWebhook}
                  disabled={webhookTesting || !user?.webhook?.url}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-navy-700 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors disabled:opacity-50"
                  title={!user?.webhook?.url ? 'Save your webhook URL first' : ''}
                >
                  {webhookTesting ? 'Sending...' : 'Send Test Event'}
                </button>
              </div>

              {webhookSaveMessage && (
                <p className={`text-sm font-medium ${
                  webhookSaveMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {webhookSaveMessage.text}
                </p>
              )}
              {webhookTestMessage && (
                <p className={`text-sm font-medium ${
                  webhookTestMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {webhookTestMessage.text}
                </p>
              )}
            </div>
          </div>
          )}

          {/* Auto-Bidding */}
          {activeSection === 'autobidding' && (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-navy-950 dark:text-white">Auto-Bidding</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-400">Project discovery and bid placement.</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                  schedulerRunning
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${schedulerRunning ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {schedulerRunning ? 'Running' : 'Stopped'}
                </span>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <div>
                  <p className="text-sm font-medium text-navy-950 dark:text-white">Growlance</p>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">
                    {schedulerRunning
                      ? schedulerStatus?.processing ? 'Currently processing active profiles...' : 'Runs every minute for all active profiles'
                      : 'Scheduler is stopped — no automatic bidding'}
                  </p>
                </div>
                <button
                  onClick={handleToggleScheduler}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    schedulerRunning ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    schedulerRunning ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <label htmlFor="bid-delay" className="block text-sm font-medium text-navy-950 dark:text-white mb-2">
                  Bid Delay
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="bid-delay"
                    type="number"
                    min="0"
                    max="3600"
                    step="1"
                    value={bidDelaySeconds}
                    onChange={(e) => setBidDelaySeconds(e.target.value)}
                    onBlur={async (e) => {
                      // Save on blur, not per keystroke — typing "30" must not
                      // momentarily persist 3 (or a cleared field persist 0).
                      let value = Math.round(parseFloat(e.target.value))
                      if (isNaN(value) || value < 0) value = 0
                      if (value > 3600) value = 3600
                      setBidDelaySeconds(value)
                      setBidDelayMessage(null)
                      try {
                        await updateSettings({ bidDelaySeconds: value })
                        setBidDelayMessage({ type: 'success', text: 'Saved.' })
                        setTimeout(() => setBidDelayMessage(null), 2500)
                      } catch {
                        setBidDelayMessage({ type: 'error', text: 'Failed to save bid delay — try again.' })
                      }
                    }}
                    className="w-24 px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-200">seconds</span>
                  {bidDelayMessage && (
                    <span className={`text-xs font-medium ${
                      bidDelayMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {bidDelayMessage.text}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 mt-2">
                  Time to wait between placing bids to avoid rate limiting. Recommended: 30s or more.
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <p className="text-sm font-medium text-navy-950 dark:text-white mb-2">Rate Limits</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="max-bids-hour" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Max Bids / Hour</label>
                    <input
                      id="max-bids-hour"
                      type="number"
                      min="1"
                      max="1000"
                      value={maxBidsPerHour}
                      onChange={(e) => setMaxBidsPerHour(e.target.value)}
                      onBlur={(e) => saveRateLimit('maxBidsPerHour', e.target.value, 1000, setMaxBidsPerHour)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="max-bids-day" className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">Max Bids / Day</label>
                    <input
                      id="max-bids-day"
                      type="number"
                      min="1"
                      max="10000"
                      value={maxBidsPerDay}
                      onChange={(e) => setMaxBidsPerDay(e.target.value)}
                      onBlur={(e) => saveRateLimit('maxBidsPerDay', e.target.value, 10000, setMaxBidsPerDay)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 transition-colors"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-700 dark:text-slate-200 mt-2">
                  Caps apply across all active profiles combined. Queued review drafts count toward them.
                  {rateLimitMessage && (
                    <span className={`ml-2 font-medium ${
                      rateLimitMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {rateLimitMessage.text}
                    </span>
                  )}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label htmlFor="seal-bids" className="block text-sm font-medium text-navy-950 dark:text-white">
                      Seal bids
                    </label>
                    <p className="text-xs text-slate-700 dark:text-slate-200 mt-1">
                      Hide your bid amount and proposal from other freelancers. Freelancer charges $0.10 per sealed bid — you need available funds. The first bid placed after enabling will confirm whether the API honours the request.
                    </p>
                  </div>
                  <button
                    id="seal-bids"
                    type="button"
                    role="switch"
                    aria-checked={sealBids}
                    onClick={async () => {
                      const next = !sealBids
                      setSealBids(next)
                      try { await updateSettings({ sealBids: next }) }
                      catch { setSealBids(!next) }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                      sealBids ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-navy-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        sealBids ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label htmlFor="review-mode" className="block text-sm font-medium text-navy-950 dark:text-white">
                      Review before sending
                    </label>
                    <p className="text-xs text-slate-700 dark:text-slate-200 mt-1">
                      {reviewMode
                        ? 'Drafts from every profile are queued on the Bids page for you to edit and approve — nothing is sent automatically.'
                        : 'Qualified bids from every profile are placed automatically, within your rate limits and schedule.'}
                    </p>
                  </div>
                  <button
                    id="review-mode"
                    type="button"
                    role="switch"
                    aria-checked={reviewMode}
                    onClick={async () => {
                      const next = !reviewMode
                      setReviewMode(next)
                      try { await updateSettings({ reviewMode: next }) }
                      catch { setReviewMode(!next) }
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                      reviewMode ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-navy-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        reviewMode ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button
                  onClick={handleTrigger}
                  disabled={triggering || activeProfileCount === 0}
                  className="w-full py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  {triggering ? 'Running...' : 'Run Growlance Now'}
                </button>
                {activeProfileCount > 0 ? (
                  <p className="text-xs text-slate-700 dark:text-slate-200 text-center mt-2">
                    Runs immediately for all active profiles: searches for new projects, analyzes relevance, generates proposals, and places bids.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
                    Activate a bidding profile first to enable auto-bidding.
                  </p>
                )}
                {triggerMessage && (
                  <p className={`text-sm font-medium text-center mt-2 ${
                    triggerMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {triggerMessage.text}
                  </p>
                )}
              </div>
            </div>
          </div>
          )}


          {/* Schedule */}
          {activeSection === 'schedule' && (
          <div className="bg-white dark:bg-navy-800/90 rounded-xl border border-slate-200 dark:border-white/6 shadow-lg dark:shadow-2xl dark:shadow-black/50 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-navy-950 dark:text-white">Schedule</h2>
                    <p className="text-sm text-slate-700 dark:text-slate-200">Control when auto-bidding runs</p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                  scheduleEnabled
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${scheduleEnabled ? 'bg-indigo-500' : 'bg-slate-400'}`} />
                  {scheduleEnabled ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-navy-900/50 border border-slate-200 dark:border-white/8">
                <div>
                  <p className="text-sm font-medium text-navy-950 dark:text-white">Global Schedule</p>
                  <p className="text-xs text-slate-700 dark:text-slate-200 mt-0.5">
                    {scheduleEnabled
                      ? 'Bidding runs only during configured times'
                      : 'Bidding runs 24/7 when scheduler is on'}
                  </p>
                </div>
                <button
                  onClick={() => setScheduleEnabled(!scheduleEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    scheduleEnabled ? 'bg-indigo-500' : 'bg-slate-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    scheduleEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {scheduleEnabled && (
                <>
                  {/* Timezone Selector */}
                  <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Timezone
                    </label>
                    <select
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                    >
                      {/* Keep an unlisted saved timezone selectable instead of a blank select */}
                      {timezone && !COMMON_TIMEZONES.some(tz => tz.value === timezone) && (
                        <option value={timezone}>{timezone}</option>
                      )}
                      {COMMON_TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Time Window */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="start-time" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        Start Time
                      </label>
                      <input
                        id="start-time"
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label htmlFor="end-time" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        End Time
                      </label>
                      <input
                        id="end-time"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Days of Week */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Active Days
                    </label>
                    <div className="flex gap-2">
                      {DAYS.map(day => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleDay(day.value)}
                          title={day.name}
                          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                            activeDays.includes(day.value)
                              ? 'bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 shadow-sm'
                              : 'bg-slate-100 dark:bg-navy-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-navy-600'
                          }`}
                        >
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Current Status Display */}
                  {(() => {
                    const status = getCurrentScheduleStatus()
                    return status && (
                      <div className={`p-3 rounded-lg border text-sm ${
                        status.active
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                          : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                      }`}>
                        {status.text}
                      </div>
                    )
                  })()}

                </>
              )}

              {/* Save button lives OUTSIDE the enabled-only block: turning the
                  schedule OFF must be saveable too — previously the button
                  vanished with the toggle and the change silently reverted. */}
              <div className="pt-1">
                <button
                  onClick={handleSaveSchedule}
                  disabled={scheduleSaving || (scheduleEnabled && activeDays.length === 0)}
                  className="w-full py-2.5 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  {scheduleSaving ? 'Saving...' : 'Save Schedule'}
                </button>
                {scheduleEnabled && activeDays.length === 0 && (
                  <p className="text-sm font-medium text-center mt-2 text-amber-600 dark:text-amber-400">
                    Please select at least one day
                  </p>
                )}
                {!scheduleEnabled && user?.schedule?.enabled && (
                  <p className="text-sm font-medium text-center mt-2 text-amber-600 dark:text-amber-400">
                    Schedule is still active — click Save Schedule to turn it off.
                  </p>
                )}
                {scheduleSaveMessage && (
                  <p className={`text-sm font-medium text-center mt-2 ${
                    scheduleSaveMessage.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  }`}>
                    {scheduleSaveMessage.text}
                  </p>
                )}
              </div>
            </div>
          </div>
          )}

        </div>

      </div>
    </div>
  )
}
