const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const env = require('../config/env');
const authMiddleware = require('../middleware/auth');
const { encrypt, decrypt, isExpired } = require('../utils/tokenManager');
const freelancerAuth = require('../services/freelancer/auth');
const { createFreelancerClient } = require('../services/freelancer/client');
const { getSelf } = require('../services/freelancer/users');
const { isValidWebhookUrl } = require('../services/notifications/webhook');
const logger = require('../utils/logger');
const { defaultJobFiltersJson } = require('../../prisma/seed');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, jobFilters: defaultJobFiltersJson() },
    });

    const token = jwt.sign({ userId: user.id }, env.jwtSecret, { expiresIn: '7d' });
    logger.info(`User registered: ${email}`);

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/local-session — silent single-user session for the desktop app.
// The license gate is the real access control; a signup form on the user's own
// machine is pure friction (and contradicts the "no account" promise). Returns
// a JWT for the app's single local user, creating it on first run. Gated to
// ELECTRON_MODE so a non-desktop deployment never exposes passwordless login;
// in the app the server is loopback-only, so callers are local by definition.
router.post('/local-session', async (req, res, next) => {
  if (process.env.ELECTRON_MODE !== 'true') {
    return res.status(404).json({ error: 'not_available' });
  }
  try {
    let user = await prisma.user.findFirst({ orderBy: { id: 'asc' } });
    if (!user) {
      // Random password, never used to log in — it just satisfies the schema
      // and keeps /login unusable for this account by guessing.
      const passwordHash = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 12);
      user = await prisma.user.create({
        data: { email: 'local@growlance.app', passwordHash, jobFilters: defaultJobFiltersJson() },
      });
      logger.info('Local user created for silent session');
    }
    const token = jwt.sign({ userId: user.id }, env.jwtSecret, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id }, env.jwtSecret, { expiresIn: '7d' });
    logger.info(`User logged in: ${email}`);

    res.json({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/freelancer — redirect to Freelancer OAuth
// Embeds a signed state token so the callback can identify the user and prevent CSRF
router.get('/freelancer', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { freelancerClientId: true, freelancerClientSecret: true },
    });
    if (!user?.freelancerClientId || !user?.freelancerClientSecret) {
      return res.status(400).json({
        code: 'missing_credentials',
        error: 'Freelancer API credentials not configured. Add your Client ID and Client Secret in Settings first.',
      });
    }
    const state = jwt.sign({ userId: req.userId, purpose: 'fl_oauth' }, env.jwtSecret, { expiresIn: '10m' });
    const url = freelancerAuth.getAuthorizeUrl(state, {
      clientId: user.freelancerClientId,
      redirectUri: env.freelancer.redirectUri,
    });
    logger.info(`Redirecting user ${req.userId} to Freelancer OAuth`);
    res.json({ url });
  } catch (err) {
    logger.error(`Failed to initiate Freelancer OAuth for user ${req.userId}: ${err.message}`);
    res.status(500).json({ error: 'Failed to initiate OAuth: ' + err.message });
  }
});

// GET /api/auth/freelancer/callback — handle OAuth callback
// Tokens are stored server-side; never exposed in the redirect URL
router.get('/freelancer/callback', async (req, res, next) => {
  const frontendBase = env.corsOrigin || 'http://localhost:8080';
  try {
    const { code, state } = req.query;

    if (!code) {
      logger.warn('Freelancer OAuth callback: missing authorization code');
      return res.redirect(`${frontendBase}/settings?fl_callback=error&reason=missing_code`);
    }
    if (!state) {
      logger.warn('Freelancer OAuth callback: missing state — possible CSRF attempt');
      return res.redirect(`${frontendBase}/settings?fl_callback=error&reason=missing_state`);
    }

    // Verify the signed state to identify the user and prevent CSRF
    let userId;
    try {
      const payload = jwt.verify(state, env.jwtSecret);
      if (payload.purpose !== 'fl_oauth') throw new Error('Invalid state purpose');
      userId = payload.userId;
    } catch (err) {
      logger.warn(`Freelancer OAuth callback: invalid/expired state — ${err.message}`);
      return res.redirect(`${frontendBase}/settings?fl_callback=error&reason=invalid_state`);
    }

    // Load per-user API credentials for token exchange
    const userCreds = await prisma.user.findUnique({
      where: { id: userId },
      select: { freelancerClientId: true, freelancerClientSecret: true },
    });
    if (!userCreds?.freelancerClientId || !userCreds?.freelancerClientSecret) {
      logger.warn(`Freelancer OAuth callback: user ${userId} has no API credentials configured`);
      return res.redirect(`${frontendBase}/settings?fl_callback=error&reason=missing_credentials`);
    }

    let decryptedSecret;
    try {
      decryptedSecret = decrypt(userCreds.freelancerClientSecret);
    } catch (e) {
      logger.error(`Failed to decrypt Freelancer client secret for user ${userId}: ${e.message}`);
      return res.redirect(`${frontendBase}/settings?fl_callback=error&reason=decryption_error`);
    }

    const tokenData = await freelancerAuth.exchangeCodeForToken(code, {
      clientId: userCreds.freelancerClientId,
      clientSecret: decryptedSecret,
      redirectUri: env.freelancer.redirectUri,
    });
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

    // Fetch Freelancer user profile to verify the token
    let freelancerUid = null;
    try {
      const client = createFreelancerClient(tokenData.access_token);
      const selfData = await getSelf(client);
      freelancerUid = String(selfData.id);
    } catch (err) {
      logger.warn('Could not fetch Freelancer profile — token may be invalid');
    }

    // Store tokens directly — never expose them in the redirect URL
    await prisma.freelancerToken.upsert({
      where: { userId },
      update: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token || null),
        tokenType: 'oauth',
        expiresAt,
        freelancerUid,
      },
      create: {
        userId,
        accessToken: encrypt(tokenData.access_token),
        refreshToken: encrypt(tokenData.refresh_token || null),
        tokenType: 'oauth',
        expiresAt,
        freelancerUid,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'freelancer_connected',
        details: JSON.stringify({ freelancerUid }),
      },
    });

    logger.info(`User ${userId} connected Freelancer account via OAuth (uid: ${freelancerUid})`);
    res.redirect(`${frontendBase}/settings?fl_callback=true`);
  } catch (err) {
    logger.error(`Freelancer OAuth callback failed: ${err.message}`);
    res.redirect(`${frontendBase}/settings?fl_callback=error&reason=server_error`);
  }
});

// POST /api/auth/freelancer/connect — store Freelancer token (called from frontend after callback)
router.post('/freelancer/connect', authMiddleware, async (req, res, next) => {
  try {
    const { access_token, refresh_token, expires_in } = req.body;
    if (!access_token) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    const expiresAt = new Date(Date.now() + (parseInt(expires_in) || 3600) * 1000);

    // Try to fetch the Freelancer user profile to verify the token
    let freelancerUid = null;
    try {
      const client = createFreelancerClient(access_token);
      const selfData = await getSelf(client);
      freelancerUid = String(selfData.id);
    } catch (err) {
      logger.warn('Could not fetch Freelancer profile — token may be invalid');
    }

    await prisma.freelancerToken.upsert({
      where: { userId: req.userId },
      update: {
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token || null),
        tokenType: 'oauth',
        expiresAt,
        freelancerUid,
      },
      create: {
        userId: req.userId,
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token || null),
        tokenType: 'oauth',
        expiresAt,
        freelancerUid,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: req.userId,
        action: 'freelancer_connected',
        details: JSON.stringify({ freelancerUid }),
      },
    });

    logger.info(`User ${req.userId} connected Freelancer account (uid: ${freelancerUid})`);

    res.json({ success: true, freelancerUid });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/freelancer/disconnect
router.post('/freelancer/disconnect', authMiddleware, async (req, res, next) => {
  try {
    await prisma.freelancerToken.deleteMany({ where: { userId: req.userId } });

    await prisma.activityLog.create({
      data: { userId: req.userId, action: 'freelancer_disconnected' },
    });

    logger.info(`User ${req.userId} disconnected Freelancer account`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/freelancer/refresh
router.post('/freelancer/refresh', authMiddleware, async (req, res, next) => {
  try {
    const tokenRecord = await prisma.freelancerToken.findUnique({
      where: { userId: req.userId },
    });
    if (!tokenRecord || !tokenRecord.refreshToken) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    const userCreds = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { freelancerClientId: true, freelancerClientSecret: true },
    });
    if (!userCreds?.freelancerClientId || !userCreds?.freelancerClientSecret) {
      return res.status(400).json({ error: 'Freelancer API credentials not configured. Add your Client ID and Client Secret in Settings.' });
    }

    let refreshToken;
    let decryptedSecret;
    try {
      refreshToken = decrypt(tokenRecord.refreshToken);
      decryptedSecret = decrypt(userCreds.freelancerClientSecret);
    } catch (e) {
      logger.error(`Failed to decrypt Freelancer secrets for user ${req.userId}: ${e.message}`);
      return res.status(500).json({ error: 'Failed to decrypt stored credentials' });
    }
    const tokenData = await freelancerAuth.refreshAccessToken(refreshToken, {
      clientId: userCreds.freelancerClientId,
      clientSecret: decryptedSecret,
    });
    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);

    await prisma.freelancerToken.update({
      where: { userId: req.userId },
      data: {
        accessToken: encrypt(tokenData.access_token),
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : tokenRecord.refreshToken,
        expiresAt,
      },
    });

    await prisma.activityLog.create({
      data: { userId: req.userId, action: 'token_refreshed' },
    });

    logger.info(`User ${req.userId} refreshed Freelancer token`);
    res.json({ success: true, expiresAt });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/status
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        openaiApiKey: true,
        openaiModel: true,
        bidDelaySeconds: true,
        sealBids: true,
        maxBidsPerHour: true,
        maxBidsPerDay: true,
        reviewMode: true,
        skillsSummary: true,
        experienceSummary: true,
        portfolioHighlights: true,
        scheduleEnabled: true,
        scheduleTimezone: true,
        scheduleStartTime: true,
        scheduleEndTime: true,
        scheduleDays: true,
        telegramEnabled: true,
        telegramBidNotificationsEnabled: true,
        telegramBotToken: true,
        telegramChatId: true,
        webhookEnabled: true,
        webhookUrl: true,
        freelancerClientId: true,
        freelancerClientSecret: true,
        freelancerToken: {
          select: {
            freelancerUid: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        openaiConfigured: !!user.openaiApiKey,
        openaiModel: user.openaiModel,
        bidDelaySeconds: user.bidDelaySeconds,
        sealBids: user.sealBids,
        maxBidsPerHour: user.maxBidsPerHour,
        maxBidsPerDay: user.maxBidsPerDay,
        reviewMode: user.reviewMode,
        skillsSummary: user.skillsSummary || '',
        experienceSummary: user.experienceSummary || '',
        portfolioHighlights: user.portfolioHighlights || '',
        freelancerApiConfigured: !!(user.freelancerClientId && user.freelancerClientSecret),
        freelancerClientId: user.freelancerClientId || null,
        schedule: {
          enabled: user.scheduleEnabled,
          timezone: user.scheduleTimezone,
          startTime: user.scheduleStartTime,
          endTime: user.scheduleEndTime,
          days: (user.scheduleDays || '1,2,3,4,5').split(',').map(d => parseInt(d)).filter(n => !isNaN(n)),
        },
        telegram: {
          enabled: user.telegramEnabled,
          bidNotificationsEnabled: user.telegramBidNotificationsEnabled,
          configured: !!(user.telegramBotToken && user.telegramChatId),
          chatId: user.telegramChatId || null,
        },
        webhook: {
          enabled: user.webhookEnabled,
          url: user.webhookUrl || null,
        },
      },
      freelancer: user.freelancerToken
        ? {
            connected: true,
            uid: user.freelancerToken.freelancerUid,
            expiresAt: user.freelancerToken.expiresAt,
            expired: isExpired(user.freelancerToken.expiresAt),
            // Legacy users connected before per-user credentials existed will
            // have a token but no Client ID/Secret. They cannot refresh and
            // must add credentials and reconnect.
            needsCredentials: !(user.freelancerClientId && user.freelancerClientSecret),
            redirectUri: env.freelancer.redirectUri,
          }
        : { connected: false, redirectUri: env.freelancer.redirectUri },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/settings — update OpenAI, schedule, and Telegram settings
// POST /api/auth/openai/test — verify the saved (or a provided) OpenAI key
// actually works. Without this, a typo'd key saves "successfully" and the
// engine then fails every run with no in-app explanation.
router.post('/openai/test', authMiddleware, async (req, res) => {
  try {
    let apiKey = null;
    // Prefer a key provided in the request (pre-save test); fall back to saved.
    if (req.body?.apiKey && typeof req.body.apiKey === 'string' && !req.body.apiKey.startsWith('••')) {
      apiKey = req.body.apiKey.trim();
    } else {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { openaiApiKey: true },
      });
      if (!user?.openaiApiKey) return res.status(400).json({ error: 'No OpenAI API key saved yet' });
      apiKey = decrypt(user.openaiApiKey);
    }

    const axios = require('axios');
    await axios.get('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 15000,
    });
    res.json({ success: true });
  } catch (err) {
    const status = err.response?.status;
    let message;
    if (status === 401) message = 'OpenAI rejected the key (invalid or revoked). Double-check it at platform.openai.com/api-keys.';
    else if (status === 429) message = 'Key is valid but the account is rate-limited or out of quota. Check billing at platform.openai.com.';
    else message = `Could not reach OpenAI: ${err.response?.data?.error?.message || err.message}`;
    res.status(400).json({ error: message });
  }
});

router.put('/settings', authMiddleware, async (req, res, next) => {
  try {
    const {
      openaiApiKey,
      openaiModel,
      bidDelaySeconds,
      sealBids,
      maxBidsPerHour,
      maxBidsPerDay,
      reviewMode,
      skillsSummary,
      experienceSummary,
      portfolioHighlights,
      scheduleEnabled,
      scheduleTimezone,
      scheduleStartTime,
      scheduleEndTime,
      scheduleDays,
      telegramEnabled,
      telegramBidNotificationsEnabled,
      telegramBotToken,
      telegramChatId,
      webhookEnabled,
      webhookUrl,
      freelancerClientId,
      freelancerClientSecret,
    } = req.body;

    const data = {};

    // Freelancer API credentials — must be saved as a complete pair, and any
    // change/clear invalidates the existing FreelancerToken (it was issued
    // against the old app and won't refresh against a different one).
    let freelancerCredsChanged = false;
    let freelancerCredsCleared = false;
    if (freelancerClientId !== undefined || freelancerClientSecret !== undefined) {
      // Load the current row so we can detect "no real change" and validate completeness
      const existing = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { freelancerClientId: true, freelancerClientSecret: true },
      });

      // Trim ID to avoid stray whitespace from copy/paste breaking exact-match auth
      const finalClientId =
        freelancerClientId !== undefined
          ? (typeof freelancerClientId === 'string' ? freelancerClientId.trim() : '') || null
          : existing?.freelancerClientId || null;

      // Decrypt the existing secret once so we can compare against the new
      // plaintext (encrypt() uses a random IV — comparing ciphertexts is unsafe).
      let existingSecretPlain = null;
      if (existing?.freelancerClientSecret) {
        try {
          existingSecretPlain = decrypt(existing.freelancerClientSecret);
        } catch (e) {
          logger.warn(`Failed to decrypt existing Freelancer secret for user ${req.userId}: ${e.message}`);
          // Treat as missing — user will need to re-enter
        }
      }

      let finalClientSecretPlain;
      if (freelancerClientSecret === undefined) {
        finalClientSecretPlain = existingSecretPlain;
      } else if (typeof freelancerClientSecret !== 'string' || !freelancerClientSecret) {
        finalClientSecretPlain = null;
      } else {
        finalClientSecretPlain = freelancerClientSecret;
      }

      // Validation: must be both-or-neither
      if ((finalClientId && !finalClientSecretPlain) || (!finalClientId && finalClientSecretPlain)) {
        return res.status(400).json({
          error: 'Freelancer Client ID and Client Secret must be provided together',
        });
      }

      data.freelancerClientId = finalClientId;
      // Re-encrypt only when we actually have a plaintext to store. Re-encrypting
      // the existing one would burn a fresh IV every save with no benefit.
      if (finalClientSecretPlain === null) {
        data.freelancerClientSecret = null;
      } else if (freelancerClientSecret !== undefined && freelancerClientSecret) {
        data.freelancerClientSecret = encrypt(finalClientSecretPlain);
      }
      // else: omit from `data` so the existing encrypted row is preserved as-is

      // Detect a real change against PLAINTEXT (not ciphertext)
      const idChanged = (existing?.freelancerClientId || null) !== finalClientId;
      const secretChanged =
        freelancerClientSecret !== undefined && !!freelancerClientSecret &&
        freelancerClientSecret !== existingSecretPlain;
      const cleared = !finalClientId && !finalClientSecretPlain &&
        (existing?.freelancerClientId || existing?.freelancerClientSecret);

      freelancerCredsCleared = !!cleared;
      freelancerCredsChanged = idChanged || secretChanged || !!cleared;
    }

    // OpenAI settings
    if (openaiApiKey !== undefined) data.openaiApiKey = openaiApiKey ? encrypt(openaiApiKey) : null;
    if (openaiModel !== undefined) data.openaiModel = openaiModel;

    // Bidding settings
    if (bidDelaySeconds !== undefined) {
      const delay = parseFloat(bidDelaySeconds);
      if (isNaN(delay) || delay < 0 || delay > 3600) {
        return res.status(400).json({ error: 'Bid delay must be between 0 and 3600 seconds' });
      }
      data.bidDelaySeconds = delay;
    }
    if (sealBids !== undefined) {
      if (typeof sealBids !== 'boolean') {
        return res.status(400).json({ error: 'sealBids must be a boolean' });
      }
      data.sealBids = sealBids;
    }

    // Account-wide rate limits (shared by every profile)
    if (maxBidsPerHour !== undefined) {
      const n = parseInt(maxBidsPerHour, 10);
      if (isNaN(n) || n < 1 || n > 1000) {
        return res.status(400).json({ error: 'Max bids per hour must be between 1 and 1000' });
      }
      data.maxBidsPerHour = n;
    }
    if (maxBidsPerDay !== undefined) {
      const n = parseInt(maxBidsPerDay, 10);
      if (isNaN(n) || n < 1 || n > 10000) {
        return res.status(400).json({ error: 'Max bids per day must be between 1 and 10000' });
      }
      data.maxBidsPerDay = n;
    }

    // Review-before-sending applies to every profile
    if (reviewMode !== undefined) {
      if (typeof reviewMode !== 'boolean') {
        return res.status(400).json({ error: 'reviewMode must be a boolean' });
      }
      data.reviewMode = reviewMode;
    }

    // Freelancer profile — AI context for scoring and proposals
    const contextLimits = { skillsSummary: 1000, experienceSummary: 2000, portfolioHighlights: 2000 };
    for (const [field, max] of Object.entries(contextLimits)) {
      const value = { skillsSummary, experienceSummary, portfolioHighlights }[field];
      if (value === undefined) continue;
      if (value !== null && typeof value !== 'string') {
        return res.status(400).json({ error: `${field} must be a string` });
      }
      const trimmed = (value || '').trim();
      if (trimmed.length > max) {
        return res.status(400).json({ error: `${field} must be ${max} characters or fewer` });
      }
      data[field] = trimmed || null;
    }

    // Schedule settings with comprehensive validation
    if (scheduleEnabled !== undefined) {
      // Validate boolean type
      if (typeof scheduleEnabled !== 'boolean') {
        return res.status(400).json({ error: 'scheduleEnabled must be a boolean' });
      }
      data.scheduleEnabled = scheduleEnabled;
    }

    if (scheduleTimezone !== undefined) {
      // Validate timezone is a string
      if (typeof scheduleTimezone !== 'string' || scheduleTimezone.trim().length === 0) {
        return res.status(400).json({ error: 'Invalid timezone format' });
      }
      // Validate it's a valid IANA timezone
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: scheduleTimezone }).format(new Date());
        data.scheduleTimezone = scheduleTimezone;
      } catch (err) {
        return res.status(400).json({ error: 'Invalid timezone' });
      }
    }

    if (scheduleStartTime !== undefined) {
      // Validate time format (HH:MM)
      if (scheduleStartTime !== null && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduleStartTime)) {
        return res.status(400).json({ error: 'Invalid start time format (expected HH:MM)' });
      }
      data.scheduleStartTime = scheduleStartTime;
    }

    if (scheduleEndTime !== undefined) {
      // Validate time format (HH:MM)
      if (scheduleEndTime !== null && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(scheduleEndTime)) {
        return res.status(400).json({ error: 'Invalid end time format (expected HH:MM)' });
      }
      data.scheduleEndTime = scheduleEndTime;
    }

    // Cross-field validation: if updating time fields, validate start < end
    if (scheduleStartTime !== undefined || scheduleEndTime !== undefined) {
      // Fetch current values to validate against
      const currentUser = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { scheduleStartTime: true, scheduleEndTime: true }
      });

      const finalStartTime = scheduleStartTime !== undefined ? scheduleStartTime : currentUser.scheduleStartTime;
      const finalEndTime = scheduleEndTime !== undefined ? scheduleEndTime : currentUser.scheduleEndTime;

      if (finalStartTime && finalEndTime && finalStartTime > finalEndTime) {
        return res.status(400).json({
          error: 'Start time must be before end time (midnight-crossing schedules not yet supported)'
        });
      }
    }

    if (scheduleDays !== undefined) {
      // Accept array [0,1,2,3,4] and convert to string "0,1,2,3,4"
      if (Array.isArray(scheduleDays)) {
        // Validate array is not empty
        if (scheduleDays.length === 0) {
          return res.status(400).json({ error: 'scheduleDays array cannot be empty' });
        }
        // Validate all values are integers 0-6
        if (!scheduleDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6)) {
          return res.status(400).json({ error: 'Schedule days must be integers 0-6' });
        }
        // Remove duplicates and sort
        const uniqueDays = [...new Set(scheduleDays)].sort();
        data.scheduleDays = uniqueDays.join(',');
      } else if (typeof scheduleDays === 'string') {
        // Validate string format
        if (!/^[0-6](,[0-6])*$/.test(scheduleDays)) {
          return res.status(400).json({ error: 'Invalid scheduleDays string format' });
        }
        data.scheduleDays = scheduleDays;
      } else {
        return res.status(400).json({ error: 'scheduleDays must be an array or string' });
      }
    }

    // Telegram settings
    if (telegramEnabled !== undefined) {
      if (typeof telegramEnabled !== 'boolean') {
        return res.status(400).json({ error: 'telegramEnabled must be a boolean' });
      }
      data.telegramEnabled = telegramEnabled;
    }
    if (telegramBidNotificationsEnabled !== undefined) {
      if (typeof telegramBidNotificationsEnabled !== 'boolean') {
        return res.status(400).json({ error: 'telegramBidNotificationsEnabled must be a boolean' });
      }
      data.telegramBidNotificationsEnabled = telegramBidNotificationsEnabled;
    }
    if (telegramBotToken !== undefined) {
      data.telegramBotToken = telegramBotToken ? encrypt(telegramBotToken) : null;
    }
    if (telegramChatId !== undefined) {
      data.telegramChatId = telegramChatId || null;
    }

    // Webhook settings
    if (webhookEnabled !== undefined) {
      if (typeof webhookEnabled !== 'boolean') {
        return res.status(400).json({ error: 'webhookEnabled must be a boolean' });
      }
      data.webhookEnabled = webhookEnabled;
    }
    if (webhookUrl !== undefined) {
      const trimmedUrl = typeof webhookUrl === 'string' ? webhookUrl.trim() : '';
      if (!trimmedUrl) {
        data.webhookUrl = null;
      } else if (trimmedUrl.length > 2048 || !isValidWebhookUrl(trimmedUrl)) {
        return res.status(400).json({ error: 'Webhook URL must be a valid http(s) URL' });
      } else {
        data.webhookUrl = trimmedUrl;
      }
    }

    // Wrap user update + token invalidation in a transaction so credential
    // changes and token cleanup cannot get out of sync if anything fails between.
    const userSelect = {
      id: true,
      email: true,
      openaiApiKey: true,
      openaiModel: true,
      bidDelaySeconds: true,
      sealBids: true,
      maxBidsPerHour: true,
      maxBidsPerDay: true,
      reviewMode: true,
      skillsSummary: true,
      experienceSummary: true,
      portfolioHighlights: true,
      scheduleEnabled: true,
      scheduleTimezone: true,
      scheduleStartTime: true,
      scheduleEndTime: true,
      scheduleDays: true,
      telegramEnabled: true,
      telegramBidNotificationsEnabled: true,
      telegramBotToken: true,
      telegramChatId: true,
      webhookEnabled: true,
      webhookUrl: true,
      freelancerClientId: true,
      freelancerClientSecret: true,
    };

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: req.userId },
        data,
        select: userSelect,
      });
      if (freelancerCredsChanged) {
        await tx.freelancerToken.deleteMany({ where: { userId: req.userId } });
      }
      return updated;
    });

    // Audit log outside the transaction (best-effort, non-blocking on failure)
    if (freelancerCredsChanged) {
      await prisma.activityLog.create({
        data: {
          userId: req.userId,
          action: freelancerCredsCleared ? 'freelancer_credentials_cleared' : 'freelancer_credentials_changed',
          details: JSON.stringify({ tokenInvalidated: true }),
        },
      }).catch(e => logger.warn(`Failed to log freelancer creds change: ${e.message}`));
      logger.info(`User ${req.userId} ${freelancerCredsCleared ? 'cleared' : 'changed'} Freelancer API credentials — token invalidated`);
    }

    // Log schedule changes for audit trail
    if (Object.keys(data).some(key => key.startsWith('schedule'))) {
      await prisma.activityLog.create({
        data: {
          userId: req.userId,
          action: 'schedule_updated',
          details: JSON.stringify({
            enabled: user.scheduleEnabled,
            timezone: user.scheduleTimezone,
            startTime: user.scheduleStartTime,
            endTime: user.scheduleEndTime,
            days: user.scheduleDays,
          }),
        },
      });
      logger.info(`User ${req.userId} updated schedule settings`);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        openaiConfigured: !!user.openaiApiKey,
        openaiModel: user.openaiModel,
        bidDelaySeconds: user.bidDelaySeconds,
        sealBids: user.sealBids,
        maxBidsPerHour: user.maxBidsPerHour,
        maxBidsPerDay: user.maxBidsPerDay,
        reviewMode: user.reviewMode,
        skillsSummary: user.skillsSummary || '',
        experienceSummary: user.experienceSummary || '',
        portfolioHighlights: user.portfolioHighlights || '',
        freelancerApiConfigured: !!(user.freelancerClientId && user.freelancerClientSecret),
        freelancerClientId: user.freelancerClientId || null,
        schedule: {
          enabled: user.scheduleEnabled,
          timezone: user.scheduleTimezone,
          startTime: user.scheduleStartTime,
          endTime: user.scheduleEndTime,
          days: (user.scheduleDays || '1,2,3,4,5').split(',').map(d => parseInt(d)).filter(n => !isNaN(n)),
        },
        telegram: {
          enabled: user.telegramEnabled,
          bidNotificationsEnabled: user.telegramBidNotificationsEnabled,
          configured: !!(user.telegramBotToken && user.telegramChatId),
          chatId: user.telegramChatId || null,
        },
        webhook: {
          enabled: user.webhookEnabled,
          url: user.webhookUrl || null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
