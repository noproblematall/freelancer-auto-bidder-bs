// Short messages to clients: the answer to a client's message on a project
// we bid on, and the one follow-up sent some hours after a bid with no reply.
// Both use the user's proposal model (quality matters more than volume here).
const logger = require('../../utils/logger');

const MAX_CHARS = 700;

const SYSTEM_PROMPT = `You write short chat messages on Freelancer.com on behalf of a freelancer, to a client who posted a project the freelancer bid on.
Plain text only, no markdown, no signature, no greeting line like "Dear" or "Hi there". Never mention AI, automation or templates. Never invent facts, prices, links or past projects. Keep every message under ${MAX_CHARS} characters.`;

function profileBlock(profile) {
  const lines = [];
  if (profile?.skillsSummary) lines.push(`Skills: ${profile.skillsSummary}`);
  if (profile?.experienceSummary) lines.push(`Experience: ${profile.experienceSummary}`);
  return lines.length ? `\nFREELANCER:\n${lines.join('\n')}` : '';
}

function trim(text) {
  let t = String(text || '').trim().replace(/^["']|["']$/g, '');
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('?'), cut.lastIndexOf('!'));
    t = end > MAX_CHARS - 200 ? cut.slice(0, end + 1) : cut.trimEnd();
  }
  return t;
}

// Answer to the client's latest message(s). `recent` is the thread's last few
// messages, oldest first, as { fromMe, text }.
async function draftReply(openai, { project, proposalText, recent = [], profile }) {
  const thread = recent.slice(-6).map((m) => `${m.fromMe ? 'ME' : 'CLIENT'}: ${String(m.text || '').slice(0, 600)}`).join('\n');
  const prompt = `PROJECT: ${project?.title || 'Project'}
${project?.description ? `BRIEF: ${String(project.description).slice(0, 800)}` : ''}
MY BID TEXT: ${String(proposalText || '').slice(0, 900)}
${profileBlock(profile)}

CONVERSATION SO FAR:
${thread || '(no messages yet)'}

Write my next message to the client. Answer what they actually asked, in two to five short sentences. If they asked for something I need to check (files, access, a call), say what I need and propose the concrete next step. If they asked for a price or timeline that my bid already states, repeat the bid's figure; do not invent a new one. If they only said hello, ask one specific question about the brief. End with one question or a clear next step, not a sales pitch.`;

  const { content } = await openai.chat({
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 400,
  });
  const text = trim(content);
  logger.info(`Reply drafted for project #${project?.id} (${text.length} chars)`);
  return text;
}

// The one follow-up after a bid with no reply: specific, short, one next step.
async function draftFollowUp(openai, { project, proposalText, profile, hoursSinceBid }) {
  const prompt = `PROJECT: ${project?.title || 'Project'}
${project?.description ? `BRIEF: ${String(project.description).slice(0, 800)}` : ''}
MY BID TEXT: ${String(proposalText || '').slice(0, 900)}
${profileBlock(profile)}

I bid on this project about ${Math.round(hoursSinceBid || 24)} hours ago and the client has not replied. Write one short follow-up message (two or three sentences) that adds something new rather than "just checking in": pick one specific detail from the brief, say concretely how I would handle it or what the first small deliverable would be, and offer one easy next step (a quick chat, or me sending a short plan). Do not repeat the bid, do not apologise, do not pressure.`;

  const { content } = await openai.chat({
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: prompt }],
    temperature: 0.6,
    max_tokens: 300,
  });
  const text = trim(content);
  logger.info(`Follow-up drafted for project #${project?.id} (${text.length} chars)`);
  return text;
}

module.exports = { draftReply, draftFollowUp, MAX_CHARS };
