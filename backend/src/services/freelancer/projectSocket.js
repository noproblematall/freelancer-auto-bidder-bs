// Live feed of new projects. Freelancer's website learns about new projects
// over a notification socket (SockJS at notifications.freelancer.com) instead
// of polling; this listens on the same socket with the website sign-in
// (webSession.js) and, the moment a project in one of the account's skills is
// posted, asks the scheduler for a bidding run right away. The run itself is
// unchanged: it searches Freelancer, saves the projects and skips anything
// already seen or bid on, so a project announced twice costs nothing.
//
// The once-a-minute cron stays on as the safety net: with no website sign-in,
// or while the socket is down, bidding works exactly as before.
const prisma = require('../../config/database');
const logger = require('../../utils/logger');
const webSession = require('./webSession');

const SOCKET_HOST = 'wss://notifications.freelancer.com';
const MAINTAIN_MS = 30 * 1000;      // connect / reconnect / re-subscribe check
const SILENCE_MS = 90 * 1000;       // the server heartbeats every ~25 s; longer silence means a dead socket
const MAX_SEEN = 5000;

let ws = null;
let timer = null;
let lastFrameAt = 0;
let subscribedKey = '';
const seen = new Set();
const state = { connected: false, connectedAt: null, received: 0, lastProjectAt: null, lastProjectTitle: null, channels: 0, lastError: null };

// Skill (job) ids to listen for: what the active profiles search for, or the
// Freelancer account's own skills when no skills are set in Job Filters.
async function channelIds() {
  const { applyAccountSettings } = require('../bidding/jobFilters');
  const profiles = await prisma.biddingProfile.findMany({ where: { isActive: true } });
  if (profiles.length === 0) return [];
  const ids = new Set();
  for (const p of profiles) {
    try {
      const merged = await applyAccountSettings(p, p.userId);
      for (const j of JSON.parse(merged.jobIds || '[]')) {
        const id = Number(typeof j === 'object' && j !== null ? j.id : j);
        if (Number.isInteger(id)) ids.add(id);
      }
    } catch (_) { /* a profile without usable job ids adds nothing */ }
  }
  if (ids.size === 0) {
    try {
      const { decrypt } = require('../../utils/tokenManager');
      const { createFreelancerClient } = require('./client');
      const token = await prisma.freelancerToken.findUnique({ where: { userId: profiles[0].userId } });
      if (token) {
        const res = await createFreelancerClient(decrypt(token.accessToken)).get('/users/0.1/self/', { params: { jobs: true } });
        for (const j of res.data?.result?.jobs || []) if (Number.isInteger(j.id)) ids.add(j.id);
      }
    } catch (err) {
      logger.warn(`Live project feed: could not read the account's skills: ${err.message}`);
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function close(reason) {
  if (ws) {
    try { ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.close(); } catch (_) {}
    ws = null;
  }
  if (state.connected) logger.info(`Live project feed: disconnected (${reason})`);
  state.connected = false;
  subscribedKey = '';
}

// Freelancer's search lists a new project some seconds after the socket
// announces it, so the first run can miss it. Announced projects stay here
// until a run has saved them, and another run is asked for every few seconds
// meanwhile (the scheduler keeps runs at least 10 s apart).
const RETRY_EVERY_MS = 12 * 1000;
const RETRY_FOR_MS = 2 * 60 * 1000;
const waiting = new Map(); // Freelancer project id -> announced at
let retryTimer = null;

async function retryMissing() {
  retryTimer = null;
  if (waiting.size === 0) return;
  try {
    const found = await prisma.project.findMany({ where: { freelancerProjectId: { in: [...waiting.keys()] } }, select: { freelancerProjectId: true } });
    for (const f of found) waiting.delete(f.freelancerProjectId);
  } catch (_) { /* try again next tick */ }
  const now = Date.now();
  for (const [id, at] of waiting) if (now - at > RETRY_FOR_MS) waiting.delete(id);
  if (waiting.size === 0) return;
  const ids = [...waiting.keys()];
  try { require('../bidding/scheduler').requestRun(`not in Freelancer's search yet: #${ids.slice(0, 3).join(', #')}${ids.length > 3 ? '…' : ''}`); } catch (_) {}
  retryTimer = setTimeout(retryMissing, RETRY_EVERY_MS);
}

function onProject(data) {
  const id = data?.id;
  if (!id || seen.has(id)) return;
  seen.add(id);
  if (seen.size > MAX_SEEN) seen.delete(seen.values().next().value);
  waiting.set(Number(id), Date.now());
  if (!retryTimer) retryTimer = setTimeout(retryMissing, RETRY_EVERY_MS);
  state.received += 1;
  state.lastProjectAt = Date.now();
  state.lastProjectTitle = String(data.title || '').slice(0, 120);
  logger.info(`Live project feed: new project #${id} "${state.lastProjectTitle}" — requesting a bidding run`);
  try { require('../bidding/scheduler').requestRun(`project #${id}`); } catch (err) {
    logger.warn(`Live project feed: could not request a run: ${err.message}`);
  }
}

function connect(session, channels) {
  const server = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const sid = Math.random().toString(36).slice(2, 10);
  const sock = new WebSocket(`${SOCKET_HOST}/${server}/${sid}/websocket`, { headers: { Origin: 'https://www.freelancer.com' } });
  const key = channels.join(',');
  ws = sock;
  lastFrameAt = Date.now();
  // SockJS framing: each message is a JSON string inside a JSON array.
  const send = (obj) => { try { sock.send(JSON.stringify([JSON.stringify(obj)])); } catch (_) {} };

  sock.onmessage = (ev) => {
    if (ws !== sock) return;
    lastFrameAt = Date.now();
    const frame = String(ev.data);
    if (frame === 'o') {
      send({ channel: 'auth', body: { hash2: session.hash, user_id: Number(session.userId) } });
      send({ channel: 'channels', body: { channels } });
      return;
    }
    if (frame[0] !== 'a') return; // 'h' heartbeat, 'c' close
    let messages;
    try { messages = JSON.parse(frame.slice(1)); } catch { return; }
    for (const raw of messages) {
      let m;
      try { m = JSON.parse(raw); } catch { continue; }
      if (m.channel === 'subscribe' && m.body === 'OK') {
        state.connected = true;
        state.connectedAt = Date.now();
        state.channels = channels.length;
        state.lastError = null;
        subscribedKey = key;
        logger.info(`Live project feed: connected, listening for new projects in ${channels.length} skill(s)`);
      } else if (m.channel === 'user' && m.body?.type === 'project') {
        onProject(m.body.data);
      }
    }
  };
  sock.onerror = (e) => { if (ws === sock) state.lastError = e?.message || 'socket error'; };
  sock.onclose = () => { if (ws === sock) { ws = null; close('socket closed'); } };
}

// Keep the socket in the state it should be in. Runs every 30 s.
async function maintain() {
  try {
    const session = webSession.load();
    if (!session || session.invalidAt) { close('no Freelancer.com sign-in'); return; }
    const channels = await channelIds();
    if (channels.length === 0) { close('no active profile or skills'); return; }
    if (ws && Date.now() - lastFrameAt > SILENCE_MS) close('no heartbeat');
    // Skills changed: reconnect with the new list.
    if (ws && state.connected && subscribedKey !== channels.join(',')) close('skills changed');
    if (!ws) connect(session, channels);
  } catch (err) {
    state.lastError = err.message;
    logger.warn(`Live project feed: ${err.message}`);
  }
}

function startProjectSocket() {
  if (timer) return;
  if (typeof WebSocket === 'undefined') { logger.warn('Live project feed: this Node version has no WebSocket; staying on the once-a-minute search'); return; }
  timer = setInterval(maintain, MAINTAIN_MS);
  if (timer.unref) timer.unref();
  setTimeout(maintain, 3000);
}

function stopProjectSocket() {
  if (timer) { clearInterval(timer); timer = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  waiting.clear();
  close('stopped');
}

function getStatus() {
  return { ...state };
}

module.exports = { startProjectSocket, stopProjectSocket, getStatus };
