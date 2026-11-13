const logger = require('../../utils/logger');
const { getProposalPrompt } = require('./promptLoader');
const { detectBotFilter, prependBotFilter } = require('../../utils/botFilterDetector');

const SYSTEM_PROMPT = `You are a bid-writing assistant for freelancer.com. Follow ALL of the rules in the user message exactly. Do not deviate from any of them.`;

// Freelancer.com's official bid description limit. Enforce the real limit —
// an artificial buffer just costs expressiveness on every proposal.
const MAX_CHARS = 1500;

function buildUserPrompt(project, basePrompt, profile) {
  const skills = project.jobNames
    ? project.jobNames.map(j => j.name).join(', ')
    : 'Not specified';

  let prompt = `${basePrompt}

PROJECT:
- Title: ${project.title}
- Description: ${project.description || 'No description provided.'}
- Budget: ${project.budgetMin || '?'} - ${project.budgetMax || '?'} ${project.currency || 'USD'}
- Required Skills: ${skills}`;

  // Inject profile context so the AI can personalize the proposal
  if (profile?.skillsSummary || profile?.experienceSummary || profile?.portfolioHighlights) {
    prompt += `\n\nFREELANCER PROFILE:`;
    if (profile.skillsSummary) prompt += `\n- Skills: ${profile.skillsSummary}`;
    if (profile.experienceSummary) prompt += `\n- Experience: ${profile.experienceSummary}`;
    if (profile.portfolioHighlights) {
      prompt += `\n- Portfolio (sample sites by skill):\n${profile.portfolioHighlights}`;
      // Models otherwise pad bids with whichever links are nearest to hand.
      prompt += `\n\nPORTFOLIO RULE: Cite a portfolio site only when its heading or description clearly matches this project's platform, stack or kind of work (a Shopify store for a Shopify project, a Laravel app for a Laravel project). Never pick links to fill a quota or because they are the closest available. If no site clearly matches, include no links at all and do not mention the portfolio.`;
    }
  }

  prompt += `\n\nIMPORTANT: The bid MUST be under ${MAX_CHARS} characters total. Be concise. If you ask the client questions, put each question on its own line.`;

  return prompt;
}

// Puts each question on its own line. Models often run two or three questions
// together in one paragraph ("What sources do you want? Should it go by
// email?"), which reads badly in a bid. Only lines holding two or more
// questions are split, so a lone "Interested? Let me know." is left alone.
function separateQuestions(text) {
  return text
    .split('\n')
    .map(line => {
      const questions = (line.match(/\?/g) || []).length;
      if (questions < 2) return line;
      // Break after a question mark (plus any closing quote/bracket) that is
      // followed by a space and the start of the next sentence.
      return line.replace(/\?(["')\]]*)\s+(?=\S)/g, '?$1\n');
    })
    .join('\n');
}

async function generateProposal(openaiClient, project, profile) {
  const basePrompt = getProposalPrompt(profile?.accountProposalPrompt, profile?.proposalPrompt);
  const userPrompt = buildUserPrompt(project, basePrompt, profile);

  // Detect bot filter requirement in project description
  const botFilter = detectBotFilter(project.description);

  const { content } = await openaiClient.chat({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 600,
  });

  let proposalText = content.trim();

  // The prompt asks the model to answer "SKIP: <reason>" for projects it must
  // not bid on (design, social media management, adult). Honour that.
  const skipMatch = /^SKIP\b[:\s-]*([\s\S]*)$/i.exec(proposalText);
  if (skipMatch && proposalText.length < 300) {
    const reason = (skipMatch[1] || '').trim().split('\n')[0] || 'prompt rules';
    logger.info(`Project #${project.id}: prompt rules say not to bid (${reason})`);
    return { skipped: true, reason, proposalText: '', charCount: 0 };
  }

  proposalText = separateQuestions(proposalText);

  // If bot filter detected, prepend the required phrase
  if (botFilter.hasFilter && botFilter.requiredPhrase) {
    logger.info(`Project #${project.id}: prepending bot filter phrase "${botFilter.requiredPhrase}"`);
    proposalText = prependBotFilter(proposalText, botFilter.requiredPhrase);
  }

  // If over the limit, re-generate with stricter instruction
  if (proposalText.length > MAX_CHARS) {
    logger.warn(`Proposal too long (${proposalText.length} chars), re-generating with stricter limit`);

    // Calculate target length (account for bot filter phrase if present)
    const botFilterLength = botFilter.hasFilter ? (botFilter.requiredPhrase.length + 2) : 0;
    const targetLength = MAX_CHARS - botFilterLength;

    // If we have a bot filter, we need to remove it before re-generating
    let baseProposal = proposalText;
    if (botFilter.hasFilter && proposalText.startsWith(botFilter.requiredPhrase)) {
      baseProposal = proposalText.substring(botFilter.requiredPhrase.length).trim();
    }

    const { content: retryContent } = await openaiClient.chat({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: baseProposal },
        { role: 'user', content: `The bid above is ${baseProposal.length} characters which exceeds the ${targetLength} character limit. Rewrite it to be under ${targetLength} characters while keeping the same tone and key points. Return ONLY the rewritten bid text.` },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    proposalText = separateQuestions(retryContent.trim());

    // Re-apply bot filter if needed
    if (botFilter.hasFilter && botFilter.requiredPhrase) {
      proposalText = prependBotFilter(proposalText, botFilter.requiredPhrase);
    }
  }

  // Hard cap: Freelancer rejects descriptions over the limit, and an over-long
  // draft is un-editable/un-saveable in the review editor. If the retry still
  // came back long, trim at the last sentence/word boundary that fits. The bot
  // filter phrase (if any) is at the START, so end-trimming preserves it.
  if (proposalText.length > MAX_CHARS) {
    logger.warn(`Proposal for project #${project.id} still ${proposalText.length} chars after retry — hard-trimming to ${MAX_CHARS}`);
    const cut = proposalText.slice(0, MAX_CHARS);
    const lastSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSentence > MAX_CHARS - 200) {
      proposalText = cut.slice(0, lastSentence + 1);
    } else if (lastSpace > MAX_CHARS - 60) {
      proposalText = cut.slice(0, lastSpace).trimEnd();
    } else {
      proposalText = cut.trimEnd();
    }
  }

  logger.info(`Proposal generated for project #${project.id} (${proposalText.length} chars)`);

  return {
    proposalText,
    charCount: proposalText.length,
  };
}

module.exports = { generateProposal, separateQuestions };
