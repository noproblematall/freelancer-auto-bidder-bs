const env = require('./config/env');
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const correlationId = require('./middleware/correlationId');
const requestLogger = require('./middleware/requestLogger');
const performanceMetrics = require('./middleware/performanceMetrics');
const { apiLimiter } = require('./middleware/rateLimiter');
const authRoutes = require('./routes/auth.routes');
const projectRoutes = require('./routes/projects.routes');
const bidRoutes = require('./routes/bids.routes');
const profileRoutes = require('./routes/profiles.routes');
const schedulerRoutes = require('./routes/scheduler.routes');
const activityRoutes = require('./routes/activity.routes');
const notificationRoutes = require('./routes/notifications.routes');
const meetingRoutes = require('./routes/meetings.routes');
const clientRoutes = require('./routes/clients.routes');

const app = express();

// Security middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());

// Logging and performance middleware
app.use(correlationId);
// app.use(requestLogger);  // Temporarily disabled to reduce log noise during debugging
// app.use(performanceMetrics);

// Rate limiting
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/clients', clientRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve React app in Electron mode (must be after all API routes)
if (process.env.ELECTRON_MODE === 'true') {
  const frontendPath = process.env.FRONTEND_DIST || path.join(__dirname, '../../frontend/dist')
  app.use(require('express').static(frontendPath))
  // Only serve index.html for non-API routes (avoids swallowing API 404s with HTML)
  app.get(/^(?!\/api).*$/, (_req, res) => res.sendFile(path.join(frontendPath, 'index.html')))
}

// Error handler (must be last)
app.use(errorHandler);

const server = app.listen(env.port, '127.0.0.1', () => {
  logger.info(`Growlance backend running on http://localhost:${env.port}`);

  // Pre-flight: verify OpenAI API key is valid and has quota.
  // Runs asynchronously so it never delays server startup.
  // Logs to the activity feed so the user sees a warning in-app if the key is broken.
  setTimeout(async () => {
    try {
      const prisma = require('./config/database');
      const { decrypt } = require('./utils/tokenManager');
      const { createOpenAIClient } = require('./services/openai/client');

      const user = await prisma.user.findFirst({ select: { id: true, openaiApiKey: true, openaiModel: true } });
      if (!user?.openaiApiKey) return; // no key configured yet — skip

      const openai = createOpenAIClient(decrypt(user.openaiApiKey), user.openaiModel || 'gpt-5.4-mini');
      const { modelUsed } = await openai.chat({
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0,
      });

      const usingFallback = modelUsed && modelUsed !== (user.openaiModel || 'gpt-5.4-mini');
      if (usingFallback) {
        // Billing/quota hit — the client fell back to the cheaper model automatically
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            action: 'openai_preflight_warning',
            details: JSON.stringify({
              message: `Your OpenAI account has a billing/quota issue with ${user.openaiModel || 'gpt-5.4-mini'}. Growlance has automatically switched to ${modelUsed} for now. To restore your preferred model, add credits at platform.openai.com/account/billing.`,
              configuredModel: user.openaiModel || 'gpt-5.4-mini',
              fallbackModel: modelUsed,
            }),
          },
        });
        logger.warn(`OpenAI pre-flight: billing issue detected — falling back to ${modelUsed}`);
      } else {
        logger.info(`OpenAI pre-flight: OK (model: ${modelUsed})`);
      }
    } catch (err) {
      logger.error(`OpenAI pre-flight check failed: ${err.message}`);
      try {
        const prisma = require('./config/database');
        const user = await prisma.user.findFirst({ select: { id: true } });
        if (user) {
          await prisma.activityLog.create({
            data: {
              userId: user.id,
              action: 'openai_preflight_failed',
              details: JSON.stringify({
                message: `OpenAI API check failed on startup: ${err.message}. Bidding will not work until this is resolved. Check your API key and billing at platform.openai.com.`,
                error: err.message,
              }),
            },
          });
        }
      } catch (_) {}
    }
  }, 3000); // wait 3s for DB to be fully ready

  // Start the auto-bidding scheduler
  const scheduler = require('./services/bidding/scheduler');
  scheduler.start();

  // Start the Freelancer message poller (checks every 2 minutes)
  const { startPoller } = require('./services/messaging/messagePoller');
  startPoller();

  // Start the Telegram command poller (/start, /stop, /status — checks every 10s)
  const { startCommandPoller } = require('./services/messaging/telegramCommandPoller');
  startCommandPoller();

  // Start the meeting reminder service (checks every minute for upcoming meetings)
  const { startMeetingReminder } = require('./services/meetings/meetingReminder');
  startMeetingReminder();
});

// Without this, an async listen error (e.g. another app already holds the port)
// crashes the process with an unhandled 'error' event — in Electron that's a raw
// "JavaScript error in the main process" dialog. Log it instead; the Electron
// shell's health-check timeout then shows its friendly restart message.
server.on('error', (err) => {
  logger.error(`Backend failed to listen on port ${env.port}: ${err.message}`);
});
