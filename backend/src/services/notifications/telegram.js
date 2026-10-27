const axios = require('axios');
const logger = require('../../utils/logger');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

async function sendTelegramMessage(botToken, chatId, text) {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`;
  const response = await axios.post(
    url,
    { chat_id: chatId, text, parse_mode: 'HTML' },
    { timeout: 10000 }
  );
  return response.data;
}

async function notifyNewMessage({ botToken, chatId, senderName, projectTitle, projectUrl, messageText, threadUrl }) {
  const preview = messageText ? messageText.slice(0, 200) + (messageText.length > 200 ? '…' : '') : '(no preview)';
  const lines = [
    '💬 <b>New Freelancer Message</b>',
    '',
    `<b>From:</b> ${escapeHtml(senderName)}`,
  ];
  if (projectTitle) {
    if (projectUrl) {
      lines.push(`<b>Project:</b> <a href="${projectUrl}">${escapeHtml(projectTitle)}</a>`);
    } else {
      lines.push(`<b>Project:</b> ${escapeHtml(projectTitle)}`);
    }
  }
  lines.push('', escapeHtml(preview));
  if (projectUrl) lines.push('', `<a href="${projectUrl}">View project →</a>`);

  const text = lines.join('\n');
  try {
    await sendTelegramMessage(botToken, chatId, text);
    logger.info(`Telegram notification sent to chat ${chatId}`);
  } catch (err) {
    logger.error(`Telegram notification failed: ${err.message}`);
    throw err;
  }
}

async function notifyBidPlaced({ botToken, chatId, projectTitle, projectUrl, amount, currency, profileName }) {
  const symbol = currency && currency !== 'USD' ? currency : '$';
  const lines = ['🎯 <b>Bid Placed!</b>', ''];
  if (projectTitle) {
    lines.push(projectUrl
      ? `<b>Project:</b> <a href="${projectUrl}">${escapeHtml(projectTitle)}</a>`
      : `<b>Project:</b> ${escapeHtml(projectTitle)}`
    );
  }
  lines.push(`<b>Amount:</b> ${symbol}${amount}`);
  if (profileName) lines.push(`<b>Profile:</b> ${escapeHtml(profileName)}`);
  if (projectUrl) lines.push('', `<a href="${projectUrl}">View project →</a>`);

  try {
    await sendTelegramMessage(botToken, chatId, lines.join('\n'));
    logger.info(`Telegram bid-placed notification sent to chat ${chatId}`);
  } catch (err) {
    logger.error(`Telegram bid-placed notification failed: ${err.message}`);
    throw err;
  }
}

async function notifyBidError({ botToken, chatId, projectTitle, projectUrl, errorMessage, profileName }) {
  const lines = ['❌ <b>Bid Failed</b>', ''];
  if (projectTitle) {
    lines.push(projectUrl
      ? `<b>Project:</b> <a href="${projectUrl}">${escapeHtml(projectTitle)}</a>`
      : `<b>Project:</b> ${escapeHtml(projectTitle)}`
    );
  }
  if (profileName) lines.push(`<b>Profile:</b> ${escapeHtml(profileName)}`);
  lines.push(`<b>Error:</b> ${escapeHtml(errorMessage)}`);
  if (projectUrl) lines.push('', `<a href="${projectUrl}">View project →</a>`);

  try {
    await sendTelegramMessage(botToken, chatId, lines.join('\n'));
    logger.info(`Telegram bid-error notification sent to chat ${chatId}`);
  } catch (err) {
    logger.error(`Telegram bid-error notification failed: ${err.message}`);
    throw err;
  }
}

async function notifyEngineStalled({ botToken, chatId, errors, reason }) {
  const lines = [
    '⚠️ <b>Growlance: Bid Engine Stalled</b>',
    '',
    `The bid engine ran but could not analyze any projects (${errors} error${errors !== 1 ? 's' : ''}).`,
    '',
    `<b>Error:</b> ${escapeHtml(reason)}`,
    '',
    '<b>Most likely cause:</b> Your OpenAI API key is out of credits or has hit its spend limit.',
    'Add credits at <b>platform.openai.com → Billing</b> to resume bidding.',
    '',
    'This alert will not repeat for 1 hour.',
  ];
  try {
    await sendTelegramMessage(botToken, chatId, lines.join('\n'));
    logger.info(`Telegram engine-stalled notification sent to chat ${chatId}`);
  } catch (err) {
    logger.error(`Telegram engine-stalled notification failed: ${err.message}`);
  }
}

async function notifySchedulerPaused({ botToken, chatId, reason }) {
  const lines = [
    '⚠️ <b>Growlance Paused</b>',
    '',
    'All bid profiles have been automatically deactivated because the account needs attention.',
    '',
    `<b>Reason:</b> ${escapeHtml(reason)}`,
    '',
    'Please resolve the issue on Freelancer and re-activate your profiles.',
  ];
  try {
    await sendTelegramMessage(botToken, chatId, lines.join('\n'));
    logger.info(`Telegram scheduler-paused notification sent to chat ${chatId}`);
  } catch (err) {
    logger.error(`Telegram scheduler-paused notification failed: ${err.message}`);
  }
}

async function notifyMeetingDetected({ botToken, chatId, title, startTime, endTime, projectTitle, projectUrl, notes, googleCalUrl }) {
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : null;
  const formatTime = (d) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' });

  const lines = ['📅 <b>Meeting Request Detected</b>', ''];
  lines.push(`<b>Title:</b> ${escapeHtml(title)}`);
  if (projectTitle) {
    lines.push(projectUrl
      ? `<b>Project:</b> <a href="${projectUrl}">${escapeHtml(projectTitle)}</a>`
      : `<b>Project:</b> ${escapeHtml(projectTitle)}`
    );
  }
  lines.push(`<b>When:</b> ${escapeHtml(formatTime(start))}`);
  if (end) lines.push(`<b>Until:</b> ${escapeHtml(formatTime(end))}`);
  if (notes) lines.push(`<b>Notes:</b> ${escapeHtml(notes)}`);
  lines.push('');
  lines.push(`<a href="${googleCalUrl}">➕ Add to Google Calendar</a>`);

  try {
    await sendTelegramMessage(botToken, chatId, lines.join('\n'));
    logger.info(`Telegram meeting-detected notification sent to chat ${chatId}`);
  } catch (err) {
    logger.error(`Telegram meeting-detected notification failed: ${err.message}`);
  }
}

async function notifyMeetingReminder({ botToken, chatId, title, startTime, projectTitle, projectUrl }) {
  const start = new Date(startTime);
  const formatTime = (d) => d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short', timeZone: 'UTC' });

  const lines = ['⏰ <b>Meeting in 30 Minutes</b>', ''];
  lines.push(`<b>${escapeHtml(title)}</b>`);
  if (projectTitle) {
    lines.push(projectUrl
      ? `<b>Project:</b> <a href="${projectUrl}">${escapeHtml(projectTitle)}</a>`
      : `<b>Project:</b> ${escapeHtml(projectTitle)}`
    );
  }
  lines.push(`<b>Starts at:</b> ${escapeHtml(formatTime(start))}`);

  try {
    await sendTelegramMessage(botToken, chatId, lines.join('\n'));
    logger.info(`Telegram meeting-reminder sent to chat ${chatId}`);
  } catch (err) {
    logger.error(`Telegram meeting-reminder failed: ${err.message}`);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { sendTelegramMessage, notifyNewMessage, notifyBidPlaced, notifyBidError, notifyEngineStalled, notifySchedulerPaused, notifyMeetingDetected, notifyMeetingReminder };
