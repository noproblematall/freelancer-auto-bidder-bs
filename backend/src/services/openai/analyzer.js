const logger = require('../../utils/logger');
const { ANALYSIS_MODEL } = require('./client');

// Project scoring is a high-volume, structured classification task that runs on
// EVERY searched project — far more often than proposal writing, which runs only
// on qualified ones. So analysis uses the cheap ANALYSIS_MODEL regardless of the
// user's chosen (proposal) model, which is where quality actually matters.

const SYSTEM_PROMPT = `You are an expert freelancer assistant that analyzes project postings.
You MUST respond with valid JSON only.`;

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
    analysis = JSON.parse(content);
  } catch (parseErr) {
    throw new Error(`OpenAI returned invalid JSON (response may have been truncated): ${parseErr.message}`);
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

module.exports = { analyzeProject };
