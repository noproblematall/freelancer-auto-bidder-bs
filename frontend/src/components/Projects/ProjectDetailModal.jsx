import { useEffect, useState } from 'react'
import { timeAgo, formatBudget } from '../../utils/formatters'
import { getProjectDetail, analyzeProject, generateProposal } from '../../services/projects'
import { placeBid } from '../../services/bids'

const _regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

function getCountryInfo(code) {
  if (!code || code.length !== 2) return null
  const upper = code.toUpperCase()
  if (upper === 'EU') return null
  const flag = String.fromCodePoint(
    0x1F1E6 - 65 + upper.charCodeAt(0),
    0x1F1E6 - 65 + upper.charCodeAt(1)
  )
  let name = upper
  try { name = _regionNames.of(upper) || upper } catch {}
  return { flag, name }
}

function currencySymbol(code) {
  if (!code) return '$'
  try {
    const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).formatToParts(1)
    return parts.find((p) => p.type === 'currency')?.value || code
  } catch {
    return code
  }
}

export default function ProjectDetailModal({ project, isOpen, onClose, onProjectUpdated }) {
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [proposal, setProposal] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [showBidForm, setShowBidForm] = useState(false)
  const [bidAmount, setBidAmount] = useState('')
  const [bidPeriod, setBidPeriod] = useState('7')
  const [bidMilestone, setBidMilestone] = useState('100')
  const [placing, setPlacing] = useState(false)
  const [bidSuccess, setBidSuccess] = useState(false)
  const [bidError, setBidError] = useState(null)

  useEffect(() => {
    if (isOpen && project) {
      setDetail(null)
      setDetailError(null)
      setLoadingDetail(true)
      setAnalyzeError(null)
      setGenerateError(null)
      setProposal(null)
      setCopied(false)
      setShowBidForm(false)
      setBidAmount('')
      setBidPeriod('7')
      setBidMilestone('100')
      setPlacing(false)
      setBidSuccess(false)
      setBidError(null)
      getProjectDetail(project.id)
        .then((data) => setDetail(data))
        .catch(() => {
          setDetail(null)
          setDetailError("Couldn't load full project details")
        })
        .finally(() => setLoadingDetail(false))

      // Load existing analysis from project data
      if (project.aiAnalysis) {
        try { setAnalysis(JSON.parse(project.aiAnalysis)) } catch { setAnalysis(null) }
      } else {
        setAnalysis(null)
      }
    } else {
      setDetail(null)
      setDetailError(null)
      setAnalysis(null)
      setProposal(null)
    }
  }, [isOpen, project?.id])

  // Pre-populate bid fields when analysis becomes available
  useEffect(() => {
    if (analysis) {
      if (analysis.suggested_bid_amount && !bidAmount) setBidAmount(String(analysis.suggested_bid_amount))
      if (analysis.suggested_timeline_days && bidPeriod === '7') setBidPeriod(String(analysis.suggested_timeline_days))
    }
  }, [analysis])

  if (!isOpen || !project) return null

  const fullDescription = detail?.fullDescription || project.description || 'No description available.'

  async function handleAnalyze() {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const data = await analyzeProject(project.id)
      setAnalysis(data.analysis)
      if (onProjectUpdated) onProjectUpdated(data.project)
    } catch (err) {
      setAnalyzeError(err.response?.data?.error || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    setGenerateError(null)
    try {
      const data = await generateProposal(project.id)
      setProposal(data.proposalText)
    } catch (err) {
      setGenerateError(err.response?.data?.error || 'Proposal generation failed')
    } finally {
      setGenerating(false)
    }
  }

  async function handlePlaceBid() {
    if (!proposal) return setBidError('Generate a proposal first before placing a bid.')
    if (proposal.length > 1500) {
      return setBidError(`Proposal is ${proposal.length} characters. The maximum is 1500, please shorten it before placing your bid.`)
    }
    if (!bidAmount || !(parseFloat(bidAmount) > 0)) return setBidError('Enter a valid bid amount.')
    const periodDays = parseInt(bidPeriod, 10)
    if (!Number.isInteger(periodDays) || periodDays < 1) {
      return setBidError('Enter a delivery period of at least 1 day.')
    }
    const milestonePercentage = parseInt(bidMilestone, 10)
    if (!Number.isInteger(milestonePercentage) || milestonePercentage < 0 || milestonePercentage > 100) {
      return setBidError('Milestone percentage must be a number between 0 and 100.')
    }

    setPlacing(true)
    setBidError(null)
    try {
      await placeBid({
        projectId: project.id,
        amount: parseFloat(bidAmount),
        periodDays,
        milestonePercentage,
        proposalText: proposal,
      })
      setBidSuccess(true)
      setShowBidForm(false)
    } catch (err) {
      setBidError(err.response?.data?.error || 'Failed to place bid')
    } finally {
      setPlacing(false)
    }
  }

  function handleCopy() {
    if (proposal) {
      navigator.clipboard.writeText(proposal)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const scoreColor = analysis?.relevance_score >= 70
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800'
    : analysis?.relevance_score >= 40
      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'
      : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative bg-white dark:bg-navy-900 dark:border dark:border-white/8 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8 flex items-start justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {project.projectType && (
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                  project.projectType === 'fixed'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                    : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                }`}>
                  {project.projectType === 'fixed' ? 'Fixed Price' : 'Hourly'}
                </span>
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                project.status === 'active'
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400'
              }`}>
                {project.status === 'active' ? 'Active' : project.status}
              </span>
              {analysis && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${scoreColor}`}>
                  {analysis.relevance_score}% match
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-navy-950 dark:text-white leading-snug" title={project.title}>{project.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto space-y-5 flex-1">
          {/* Budget & Stats */}
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">Budget</p>
              <p className="text-lg font-medium text-emerald-500">
                {formatBudget(project.budgetMin, project.budgetMax, project.currency)}
              </p>
            </div>
            <div className="h-8 w-px bg-slate-200 dark:bg-white/10" />
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">Bids</p>
              <p className="text-lg font-semibold text-navy-950 dark:text-white">{project.bidCount}</p>
            </div>
            <div className="h-8 w-px bg-slate-200 dark:bg-white/10" />
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">Posted</p>
              <p className="text-sm font-medium text-navy-950 dark:text-white">
                {timeAgo(project.timeSubmitted || project.discoveredAt)}
              </p>
            </div>
            {(() => {
              const ci = getCountryInfo(project.ownerCountry)
              return ci ? (
                <>
                  <div className="h-8 w-px bg-slate-200 dark:bg-white/10" />
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">Location</p>
                    <p className="text-sm font-medium text-navy-950 dark:text-white flex items-center gap-1">
                      <span className="text-base leading-none">{ci.flag}</span>
                      <span>{ci.name} ({project.ownerCountry})</span>
                    </p>
                  </div>
                </>
              ) : null
            })()}
          </div>

          {/* Skills */}
          {project.jobNames?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Skills Required</p>
              <div className="flex flex-wrap gap-2">
                {project.jobNames.map((job) => (
                  <span key={job.id} className="text-xs font-medium bg-navy-50 dark:bg-navy-700/50 text-navy-700 dark:text-navy-300 px-2.5 py-1 rounded-full">
                    {job.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Description</p>
            {loadingDetail ? (
              <div className="flex items-center gap-2 py-4">
                <div className="w-4 h-4 border-2 border-navy-500 dark:border-emerald-400 border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-400 dark:text-slate-500">Loading full description...</span>
              </div>
            ) : (
              <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {fullDescription}
              </div>
            )}
          </div>

          {/* AI Analysis Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">AI Analysis</p>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-600 hover:to-indigo-700 transition-all shadow-sm disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                    </svg>
                    {analysis ? 'Re-analyze' : 'Analyze'}
                  </>
                )}
              </button>
            </div>

            {analyzeError && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 mb-3">
                {analyzeError}
              </div>
            )}

            {analysis && (
              <div className="space-y-3 p-4 rounded-lg bg-slate-50 dark:bg-navy-800/50 border border-slate-200 dark:border-white/8">
                {/* Score + Complexity + Timeline */}
                <div className="flex items-center gap-4">
                  <div className={`px-3 py-1.5 rounded-lg border text-center ${scoreColor}`}>
                    <p className="text-2xl font-bold">{analysis.relevance_score}</p>
                    <p className="text-xs font-medium uppercase tracking-wide">Match</p>
                  </div>
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Complexity</p>
                      <p className="text-sm font-medium text-navy-950 dark:text-white capitalize">{analysis.complexity}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Est. Hours</p>
                      <p className="text-sm font-medium text-navy-950 dark:text-white">{analysis.estimated_hours}h</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Timeline</p>
                      <p className="text-sm font-medium text-navy-950 dark:text-white">{analysis.suggested_timeline_days}d</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase">Suggested Bid</p>
                      <p className="text-sm font-medium text-emerald-500">{currencySymbol(project.currency)}{analysis.suggested_bid_amount}</p>
                    </div>
                  </div>
                </div>

                {/* Technologies */}
                {analysis.technologies?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase mb-1">Technologies</p>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.technologies.map((t, i) => (
                        <span key={i} className="text-xs bg-white dark:bg-navy-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Relevance Reasons */}
                {analysis.relevance_reasons?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-emerald-500 dark:text-emerald-400 uppercase mb-1">Why It Matches</p>
                    <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                      {analysis.relevance_reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-emerald-400 mt-0.5">+</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Key Requirements */}
                {analysis.key_requirements?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase mb-1">Key Requirements</p>
                    <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                      {analysis.key_requirements.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-slate-300 dark:text-slate-600 mt-0.5">-</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Red Flags */}
                {analysis.red_flags?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-400 uppercase mb-1">Red Flags</p>
                    <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5">
                      {analysis.red_flags.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-0.5">!</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!analysis && !analyzing && !analyzeError && (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">Click "Analyze" to get AI-powered project insights and relevance scoring.</p>
            )}
          </div>

          {/* Proposal Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Bid Proposal</p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-navy-900 dark:bg-emerald-400 text-white dark:text-navy-950 hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white dark:border-navy-950 border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                    </svg>
                    {proposal ? 'Regenerate' : 'Generate Proposal'}
                  </>
                )}
              </button>
            </div>

            {generateError && (
              <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400 mb-3">
                {generateError}
              </div>
            )}

            {proposal && (
              <div className="space-y-2">
                <textarea
                  value={proposal}
                  onChange={(e) => setProposal(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2.5 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500 resize-y leading-relaxed"
                />
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${proposal.length > 1500 ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {proposal.length} / 1500 characters
                  </span>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-navy-800 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    </svg>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            {!proposal && !generating && !generateError && (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">Click "Generate Proposal" to create an AI-written bid tailored to this project.</p>
            )}
          </div>

          {/* Owner info */}
          {detail?.owner && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Client</p>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-navy-800/50 border border-slate-100 dark:border-white/8">
                <div className="w-9 h-9 rounded-full bg-navy-100 dark:bg-navy-700 flex items-center justify-center text-sm font-semibold text-navy-700 dark:text-navy-200">
                  {(detail.owner.display_name || detail.owner.username || 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-navy-950 dark:text-white">
                    {detail.owner.display_name || detail.owner.username || `User #${project.ownerId}`}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                    {detail.owner.reputation?.entire_history?.overall > 0 && (
                      <span>Rating: {detail.owner.reputation.entire_history.overall.toFixed(1)}/5</span>
                    )}
                    {(() => {
                      const countryCode = detail.owner.country?.code || project.ownerCountry
                      const ci = getCountryInfo(countryCode)
                      const city = detail.owner.city
                      if (!ci && !city) return null
                      return (
                        <span className="flex items-center gap-1">
                          {ci && <span className="text-base leading-none">{ci.flag}</span>}
                          <span>
                            {city && ci ? `${city}, ${ci.name} (${countryCode?.toUpperCase()})` :
                             city ? city :
                             ci ? `${ci.name} (${countryCode?.toUpperCase()})` : null}
                          </span>
                        </span>
                      )
                    })()}
                    {detail.owner.status?.payment_verified && (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                        Payment Verified
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Detail fetch failure note (client/owner card unavailable) */}
          {detailError && !loadingDetail && (
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Client</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">{detailError}</p>
            </div>
          )}

          {/* Bid Form */}
          {showBidForm && (
            <div className="space-y-3 p-4 rounded-lg bg-navy-50 dark:bg-navy-800/50 border border-navy-200 dark:border-white/8">
              <p className="text-xs font-semibold text-navy-800 dark:text-slate-200 uppercase tracking-wide">Place Your Bid</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Amount ({currencySymbol(project.currency)})</label>
                  <input
                    type="number"
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    min="1"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Period (days)</label>
                  <input
                    type="number"
                    value={bidPeriod}
                    onChange={(e) => setBidPeriod(e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 uppercase mb-1">Milestone %</label>
                  <input
                    type="number"
                    value={bidMilestone}
                    onChange={(e) => setBidMilestone(e.target.value)}
                    min="0"
                    max="100"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 focus:border-navy-500"
                  />
                </div>
              </div>
              {!proposal && (
                <p className="text-xs text-amber-600 dark:text-amber-400">Generate a proposal above before placing your bid.</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handlePlaceBid}
                  disabled={placing || !proposal}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
                >
                  {placing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white dark:border-navy-950 border-t-transparent dark:border-t-transparent rounded-full animate-spin" />
                      Placing...
                    </>
                  ) : 'Confirm & Place Bid'}
                </button>
                <button
                  onClick={() => setShowBidForm(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-white dark:bg-navy-800 border border-slate-300 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {bidError && (
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              {bidError}
            </div>
          )}

          {bidSuccess && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              Bid placed successfully!
            </div>
          )}

          {/* Freelancer Project ID */}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Freelancer Project #{project.freelancerProjectId}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/8 flex items-center justify-between shrink-0">
          <a
            href={`https://www.freelancer.com/projects/${project.freelancerProjectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-navy-600 dark:text-emerald-400 hover:text-navy-800 dark:hover:text-emerald-300 font-medium transition-colors"
          >
            View on Freelancer
          </a>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-200 bg-slate-100 dark:bg-navy-800 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors"
            >
              Close
            </button>
            {bidSuccess ? (
              <button
                disabled
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg"
              >
                Bid Placed
              </button>
            ) : (
              <button
                onClick={() => setShowBidForm(!showBidForm)}
                disabled={placing}
                className="px-4 py-2 text-sm font-medium text-white dark:text-navy-950 bg-navy-900 dark:bg-emerald-400 rounded-lg hover:bg-navy-800 dark:hover:bg-emerald-500 transition-colors shadow-sm disabled:opacity-50"
              >
                {showBidForm ? 'Hide Bid Form' : 'Bid on Project'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
