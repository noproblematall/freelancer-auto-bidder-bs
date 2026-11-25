// "Sign in to Freelancer.com" for when the app runs in a browser instead of
// the desktop shell. The desktop app opens its own sign-in window
// (electron/main.js); here the backend, which runs on the user's own machine,
// opens a Chrome/Edge window with a separate profile on the Freelancer login
// page and watches that window's cookies over the browser's DevTools
// connection. Once the two login cookies appear they are handed to
// webSession.js and the window closes. Nothing else is read from it.
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('../../utils/logger');
const webSession = require('./webSession');

const LOGIN_URL = 'https://www.freelancer.com/login';
const TIMEOUT_MS = 10 * 60 * 1000;

function profileDir() {
  return path.join(path.dirname(webSession.sessionFile()), 'freelancer-web-profile');
}

function findBrowser() {
  const env = process.env;
  const candidates = process.platform === 'win32'
    ? [
        [env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'],
        [env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'],
        [env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'],
        [env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'],
        [env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'],
      ].filter(([base]) => base).map(([base, rel]) => path.join(base, rel))
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The browser-level DevTools socket, once the browser is up.
async function connect(port, isAlive) {
  for (let i = 0; i < 100 && isAlive(); i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const { webSocketDebuggerUrl } = await res.json();
      if (webSocketDebuggerUrl) {
        const ws = new WebSocket(webSocketDebuggerUrl);
        await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('DevTools connection refused')); });
        return ws;
      }
    } catch (_) { /* not up yet */ }
    await sleep(200);
  }
  return null;
}

let inFlight = null;

// Opens the sign-in window and resolves with { ok, userId } once signed in,
// { ok: false, canceled: true } when the window is closed first, or
// { ok: false, error }.
function login() {
  if (inFlight) return inFlight;
  inFlight = run().catch((err) => ({ ok: false, error: err.message })).finally(() => { inFlight = null; });
  return inFlight;
}

async function run() {
  const exe = findBrowser();
  if (!exe) return { ok: false, error: 'Chrome or Edge was not found on this computer.' };
  const port = await freePort();
  const dir = profileDir();
  fs.mkdirSync(dir, { recursive: true });

  let alive = true;
  const child = spawn(exe, [
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    `--user-data-dir=${dir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=560,760',
    `--app=${LOGIN_URL}`,
  ], { stdio: 'ignore' });
  child.once('exit', () => { alive = false; });
  child.once('error', () => { alive = false; });
  logger.info(`Freelancer website sign-in window opened (${path.basename(exe)})`);

  const ws = await connect(port, () => alive);
  if (!ws) {
    try { child.kill(); } catch (_) {}
    return { ok: false, error: 'The sign-in window could not be opened.' };
  }

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      const done = pending.get(msg.id);
      if (done) { pending.delete(msg.id); done(msg.result || null); }
    } catch (_) {}
  };
  ws.onclose = () => { alive = false; };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    try { ws.send(JSON.stringify({ id, method, params })); } catch (_) { pending.delete(id); resolve(null); }
    setTimeout(() => { if (pending.delete(id)) resolve(null); }, 5000);
  });

  const deadline = Date.now() + TIMEOUT_MS;
  let result = { ok: false, canceled: true };
  while (alive && Date.now() < deadline) {
    const r = await send('Storage.getCookies');
    const cookies = (r?.cookies || []).filter((c) => /(^|\.)freelancer\.com$/i.test(c.domain || ''));
    const uid = cookies.find((c) => c.name === 'GETAFREE_USER_ID')?.value;
    const hash = cookies.find((c) => c.name === 'GETAFREE_AUTH_HASH_V2')?.value;
    if (uid && hash) {
      webSession.save({ userId: uid, hash });
      try { require('./bidQuota').clearAllBidQuota(); } catch (_) {}
      result = { ok: true, userId: uid };
      break;
    }
    await sleep(1500);
  }
  if (alive) {
    if (!result.ok) result = { ok: false, error: 'Timed out waiting for the Freelancer.com sign-in.' };
    await send('Browser.close');
    try { ws.close(); } catch (_) {}
  }
  return result;
}

// Forget the sign-in window's own browser profile (cookies and all).
function clearProfile() {
  try { fs.rmSync(profileDir(), { recursive: true, force: true }); } catch (_) {}
}

module.exports = { login, clearProfile, findBrowser };
