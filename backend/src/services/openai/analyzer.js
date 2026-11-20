const logger = require('../../utils/logger');
const { ANALYSIS_MODEL } = require('./client');

// Project scoring is a high-volume, structured classification task that runs on
// EVERY searched project — far more often than proposal writing, which runs only
// on qualified ones. So analysis uses the cheap ANALYSIS_MODEL regardless of the
// user's chosen (proposal) model, which is where quality actually matters.

const SYSTEM_PROMPT = `You are an expert freelancer assistant that analyzes project postings.
You MUST respond with valid JSON only.`;

// What is known about the employer (services/freelancer/projectMapper.js), as a
// prompt block. Shared with the proposal generator so both see the same facts.
function describeClient(project) {
  const lines = [];
  if (project.ownerPaymentVerified === true) lines.push('payment verified');
  else if (project.ownerPaymentVerified === false) lines.push('payment NOT verified');
  if (project.ownerDepositMade) lines.push('has made a deposit');
  if (typeof project.ownerReviews === 'number') {
    lines.push(project.ownerReviews > 0
      ? `${project.ownerReviews} review${project.ownerReviews === 1 ? '' : 's'} from freelancers${typeof project.ownerRating === 'number' ? `, rated ${project.ownerRating.toFixed(1)}/5` : ''}`
      : 'no reviews yet (may be hiring for the first time)');
  }
  if (typeof project.ownerProjectsAll === 'number' && project.ownerProjectsAll > 0) {
    lines.push(`${project.ownerProjectsComplete ?? 0} of ${project.ownerProjectsAll} posted projects completed`);
  }
  if (project.ownerCountry) lines.push(`country ${project.ownerCountry}`);
  if (typeof project.bidCount === 'number') {
    lines.push(`${project.bidCount} bids so far${typeof project.bidAvg === 'number' && project.bidAvg > 0 ? `, average bid ${Math.round(project.bidAvg)} ${project.currency || 'USD'}` : ''}`);
  }
  if (!lines.length) return '';
  return `\nCLIENT:\n- ${lines.join('\n- ')}\n`;
}

function buildUserPrompt(project, profile) {
  const skills = project.jobNames
    ? project.jobNames.map(j => j.name).join(', ')
    : 'Not specified';

  const userSkills = profile?.skillsSummary || 'Full-stack web developer with 10 years experience';
  const experience = profile?.experienceSummary || 'Senior developer experienced in React, Node.js, PHP, Python, WordPress, Shopify, and various web technologies.';
  const rate = profile?.hourlyRate > 0 ? `$${profile.hourlyRate} USD per hour` : 'not set';
  const currency = project.currency || 'USD';
  const isHourly = project.projectType === 'hourly';
  const kind = isHourly
    ? `hourly (the budget is the client's hourly rate range in ${currency})`
    : `fixed-price (the budget is the total price range in ${currency})`;

  return `Analyze this project posting and score its relevance to the freelancer's profile.

PROJECT:
- Title: ${project.title}
- Description: ${project.description || 'No description provided.'}
- Budget: ${project.budgetMin || '?'} - ${project.budgetMax || '?'} ${project.currency || 'USD'}
- Skills Required: ${skills}
- Project Type: ${project.projectType ? kind : 'Not specified'}
${describeClient(project)}
FREELANCER PROFILE:
- Skills: ${userSkills}
- Experience: ${experience}
- Hourly rate: ${rate}

Respond with this exact JSON structure:
{
  "key_requirements": ["requirement1", "requirement2"],
  "technologies": ["tech1", "tech2"],
  "estimated_hours": <number, realistic total hours of work for the freelancer>,
  "complexity": "low" | "medium" | "high",
  "relevance_score": <0-100, how well the freelancer's skills match>,
  "relevance_reasons": ["reason1", "reason2"],
  "red_flags": ["any concerns about the project"],
  "suggested_bid_amount": <number in ${currency}: ${isHourly
    ? 'the hourly rate to bid, inside the listed range and as close to the freelancer\'s own rate as the range allows'
    : 'the total price to bid, inside the budget range; start from estimated_hours times the freelancer\'s hourly rate and pull it into the range'}>,
  "suggested_timeline_days": <number of calendar days to deliver; honour any deadline the posting states${isHourly ? ', and for ongoing hourly work the length of the first engagement' : ''}>
}`;
}

async function analyzeProject(openaiClient, project, profile) {
  const { content } = await openaiClient.chat({
    model: ANALYSIS_MODEL, // cheap model for high-volume scoring (see note above)
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(project, profile) },
    ],
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });

  let analysis;
  try {
    analysis = JSON.parse(content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''));
  } catch (parseErr) {
    throw new Error(`OpenAI returned invalid JSON (response may have been truncated): ${parseErr.message}`);
  }

  // Cheap models sometimes quote numbers ("85"). A quoted score used to count
  // as 0 and silently drop the project, so read numeric strings as numbers.
  for (const field of ['relevance_score', 'estimated_hours', 'suggested_bid_amount', 'suggested_timeline_days']) {
    const raw = analysis[field];
    if (typeof raw === 'string' && raw.trim() !== '') {
      const n = Number(raw.replace(/[^0-9.\-]/g, ''));
      if (Number.isFinite(n)) analysis[field] = n;
    }
  }

  // Validate relevance_score is in range
  if (typeof analysis.relevance_score === 'number') {
    analysis.relevance_score = Math.max(0, Math.min(100, Math.round(analysis.relevance_score)));
  } else {
    analysis.relevance_score = 0;
  }

  logger.info(`Project #${project.id} analyzed — relevance: ${analysis.relevance_score}, complexity: ${analysis.complexity}`);
  return analysis;
}

module.exports = { analyzeProject, describeClient };
