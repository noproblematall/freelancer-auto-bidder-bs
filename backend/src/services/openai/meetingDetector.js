const logger = require('../../utils/logger');
const { ANALYSIS_MODEL } = require('./client');

const SYSTEM_PROMPT = `You are an assistant that detects meeting requests in freelancer messages.
You MUST respond with valid JSON only.
If no meeting request is found, respond with: {"meeting": null}
If a meeting request is found, extract the details and respond with the meeting object.`;

// Tier 1: Strong meeting signals — any one match triggers OpenAI
const STRONG_SIGNALS = [
  'zoom', 'skype', 'google meet', 'ms teams', 'microsoft teams', 'webex',
  'gotomeeting', 'jitsi', 'whereby', 'bluejeans', 'facetime', 'discord call',
  'calendly', 'cal.com', 'doodle',
  'video call', 'video chat', 'phone call', 'voice call', 'conference call',
  'hop on a call', "let's meet", 'let us meet', 'meeting at', 'meeting on',
  'screen share', 'screenshare', 'screen sharing',
  'interview', 'demo call', 'intro call', 'discovery call', 'onboarding call',
];

// Tier 2: Scheduling words — require one of these AND a time indicator
const SCHEDULE_WORDS = [
  'schedule', 'book', 'arrange', 'set up', 'set a time', 'pick a time',
  'available', 'availability', 'free slot', 'time slot',
  'catch up', 'catchup', 'sync up', 'sync', 'connect', 'check in',
  'discuss', 'appointment', 'call at', 'talk at', 'chat at', 'meet at',
];

// Time indicators — used in conjunction with SCHEDULE_WORDS
const TIME_INDICATORS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'tomorrow', 'next week', 'this week', 'next month',
  'morning', 'afternoon', 'evening', 'tonight',
  "o'clock", ':00', ':30', ':15', ':45',
  'am ', 'am,', 'am.', 'pm ', 'pm,', 'pm.', // space/punctuation guards to avoid "team", "spam"
  ' 9 ', ' 10 ', ' 11 ', ' 12 ', ' 1 ', ' 2 ', ' 3 ', ' 4 ', ' 5 ', ' 6 ', ' 7 ', ' 8 ',
  'at 9', 'at 10', 'at 11', 'at 12', 'at 1', 'at 2', 'at 3', 'at 4', 'at 5',
  'jan ', 'feb ', 'mar ', 'apr ', 'may ', 'jun ', 'jul ', 'aug ', 'sep ', 'oct ', 'nov ', 'dec ',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
];

/**
 * Detect a meeting request in a client message.
 * Returns { title, startTime (ISO string), endTime (ISO string), notes } or null.
 *
 * @param {object} openai - The result of createOpenAIClient(apiKey, model)
 * @param {string} messageText - The raw message text to inspect
 * @param {object} options
 * @param {string} options.projectTitle
 * @param {string} options.currentISODate - e.g. "2026-03-24"
 * @param {string} options.timezone - e.g. "America/New_York"
 */
async function detectMeeting(openai, messageText, { projectTitle, currentISODate, timezone }) {
  if (!messageText || messageText.trim().length < 10) return null;

  const lower = messageText.toLowerCase();

  const hasStrong = STRONG_SIGNALS.some(kw => lower.includes(kw));
  const hasSchedule = !hasStrong && SCHEDULE_WORDS.some(kw => lower.includes(kw));
  const hasTime = hasSchedule && TIME_INDICATORS.some(kw => lower.includes(kw));

  if (!hasStrong && !hasTime) return null;

  // Truncate message to 600 chars to reduce token usage while keeping full context
  const truncated = messageText.length > 600 ? messageText.slice(0, 600) + '…' : messageText;

  const prompt = `Today is ${currentISODate}. Timezone: ${timezone}. Project: "${projectTitle || 'Unknown'}".

Message: "${truncated}"

Does this contain a meeting request with a specific date/time? Extract if yes.
{"meeting": {"title": "...", "startTime": "ISO8601_UTC", "endTime": "ISO8601_UTC", "notes": "..."}}
or {"meeting": null}`;

  const now = new Date();

  try {
    const { content: raw } = await openai.chat({
      model: ANALYSIS_MODEL, // cheap model for high-volume meeting detection
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 150,
      response_format: { type: 'json_object' },
    });

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed.meeting) return null;

    const { title, startTime, endTime, notes } = parsed.meeting;
    if (!title || !startTime) return null;

    const start = new Date(startTime);
    if (isNaN(start.getTime())) return null;
    if (start < now) return null; // Ignore past meetings

    return {
      title,
      startTime: start.toISOString(),
      endTime: endTime ? new Date(endTime).toISOString() : new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      notes: notes || null,
    };
  } catch (err) {
    logger.warn(`meetingDetector: failed — ${err.message}`);
    return null;
  }
}

module.exports = { detectMeeting };
