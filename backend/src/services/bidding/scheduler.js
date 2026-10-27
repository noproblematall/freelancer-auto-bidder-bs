const cron = require('node-cron');
const prisma = require('../../config/database');
const { runProfilePipeline, FatalBidError } = require('./engine');
const { notifySchedulerPaused, notifyEngineStalled } = require('../notifications/telegram');
const { decrypt } = require('../../utils/tokenManager');
const { checkGlobalSchedule } = require('./scheduleChecker');
const logger = require('../../utils/logger');

let isRunning = false;
let cronJob = null;
let shutdownHandlersRegistered = false;
let lastStallAlertAt = 0; // throttle stall alerts to once per hour

async function runAllActiveProfiles() {
  const runStartTime = new Date();
  const runId = `run_${Date.now()}`;

  if (isRunning) {
    logger.warn('Scheduler: previous run still in progress, skipping');
    return;
  }
  isRunning = true; // Set immediately — before any await — to prevent concurrent runs

  // Clean up any bids left in 'pending' from a previous interrupted run before
  // processing new ones. This ensures skipped-project logic doesn't block re-bidding
  // on projects whose pending bids were never actually placed.
  await cleanupStalePendingBids();

  // Check global schedule before processing
  const scheduleCheck = await checkGlobalSchedule();

  // Log schedule check decision
  try {
    const user = await prisma.user.findFirst();
    if (user) {
      await prisma.activityLog.create({
        data: {
          userId: user.id,
          action: 'scheduler_check',
          details: JSON.stringify({
            runId,
            allowed: scheduleCheck.allowed,
            reason: scheduleCheck.reason,
            timestamp: runStartTime.toISOString(),
          }),
        },
      });
    }
  } catch (logErr) {
    logger.error(`Failed to log schedule check: ${logErr.message}`);
  }

  if (!scheduleCheck.allowed) {
    logger.info(`Scheduler: outside schedule window - ${scheduleCheck.reason}`);
    isRunning = false;
    return;
  }
  let totalResults = {
    searched: 0,
    filtered: 0,
    analyzed: 0,
    qualified: 0,
    placed: 0,
    queued: 0,
    errors: 0,
    openaiError: null,
  };

  try {
    const activeProfiles = await prisma.biddingProfile.findMany({
      where: { isActive: true },
    });

    if (activeProfiles.length === 0) {
      logger.info('Scheduler: no active profiles found');
      return;
    }

    logger.info(`Scheduler: processing ${activeProfiles.length} active profile(s) (runId: ${runId})`);

    // Group profiles by user so each user's profiles share the project pool fairly.
    // Within a user's profiles, each one is assigned a slice of qualifying projects
    // by index (profile 0 → projects 0,2,4…; profile 1 → projects 1,3,5…).
    // This prevents profile 1 from claiming all projects before profile 2 runs.
    const profilesByUser = {};
    for (const profile of activeProfiles) {
      if (!profilesByUser[profile.userId]) profilesByUser[profile.userId] = [];
      profilesByUser[profile.userId].push(profile);
    }

    for (const profile of activeProfiles) {
      const userProfiles = profilesByUser[profile.userId];
      const profileIndex = userProfiles.indexOf(profile);
      const totalProfiles = userProfiles.length;

      try {
        const results = await runProfilePipeline(profile, { profileIndex, totalProfiles });
        logger.info(
          `Scheduler: profile "${profile.name}" — searched=${results.searched}, ` +
          `filtered=${results.filtered}, qualified=${results.qualified}, ` +
          `placed=${results.placed}, queued=${results.queued}, errors=${results.errors}`
        );

        // Accumulate totals
        totalResults.searched += results.searched;
        totalResults.filtered += results.filtered;
        totalResults.analyzed += results.analyzed;
        totalResults.qualified += results.qualified;
        totalResults.placed += results.placed;
        totalResults.queued += results.queued || 0;
        totalResults.errors += results.errors;
        if (results.openaiError && !totalResults.openaiError) totalResults.openaiError = results.openaiError;
      } catch (err) {
        if (err instanceof FatalBidError) {
          logger.error(`Scheduler: FATAL — auto-pausing all profiles for user ${profile.userId}: ${err.message}`);
          totalResults.errors += 1;

          // Deactivate all active profiles for this user
          await prisma.biddingProfile.updateMany({
            where: { userId: profile.userId, isActive: true },
            data: { isActive: false },
          }).catch(e => logger.error(`Failed to deactivate profiles: ${e.message}`));

          // Log to activity feed
          await prisma.activityLog.create({
            data: {
              userId: profile.userId,
              action: 'scheduler_auto_paused',
              details: JSON.stringify({ reason: err.message, runId }),
            },
          }).catch(e => logger.error(`Failed to log auto-pause: ${e.message}`));

          // Telegram alert if configured
          try {
            const user = await prisma.user.findUnique({
              where: { id: profile.userId },
              select: { telegramBidNotificationsEnabled: true, telegramBotToken: true, telegramChatId: true },
            });
            if (user?.telegramBidNotificationsEnabled && user.telegramBotToken && user.telegramChatId) {
              const botToken = decrypt(user.telegramBotToken);
              const chatIds = user.telegramChatId.split(',').map(s => s.trim()).filter(Boolean);
              for (const chatId of chatIds) {
                notifySchedulerPaused({ botToken, chatId, reason: err.message })
                  .catch(e => logger.warn(`Telegram pause notification failed: ${e.message}`));
              }
            }
          } catch (tgErr) {
            logger.warn(`Could not send Telegram pause alert: ${tgErr.message}`);
          }

          break; // Stop processing further profiles
        }

        logger.error(`Scheduler: profile "${profile.name}" failed: ${err.message}`);
        totalResults.errors += 1;
      }
    }

    // Log successful run completion to database
    const runEndTime = new Date();
    const durationMs = runEndTime - runStartTime;

    try {
      const user = await prisma.user.findFirst();
      if (user) {
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            action: 'scheduler_run_completed',
            details: JSON.stringify({
              runId,
              profileCount: activeProfiles.length,
              results: totalResults,
              startTime: runStartTime.toISOString(),
              endTime: runEndTime.toISOString(),
              durationMs,
            }),
          },
        });
      }
    } catch (logErr) {
      logger.error(`Failed to log scheduler run: ${logErr.message}`);
    }

    logger.info(
      `Scheduler: run completed (runId: ${runId}) — ` +
      `profiles=${activeProfiles.length}, ` +
      `searched=${totalResults.searched}, ` +
      `analyzed=${totalResults.analyzed}, ` +
      `placed=${totalResults.placed}, ` +
      `duration=${durationMs}ms`
    );

    // Stall detection: if errors occurred but nothing was analyzed, the OpenAI key
    // may be out of quota. Alert via Telegram (at most once per hour).
    if (totalResults.errors > 0 && totalResults.analyzed === 0 && totalResults.filtered > 0) {
      const now = Date.now();
      if (now - lastStallAlertAt > 60 * 60 * 1000) {
        lastStallAlertAt = now;
        try {
          const user = await prisma.user.findFirst({
            select: { id: true, telegramBidNotificationsEnabled: true, telegramBotToken: true, telegramChatId: true },
          });
          if (user) {
            if (user.telegramBidNotificationsEnabled && user.telegramBotToken && user.telegramChatId) {
              const botToken = decrypt(user.telegramBotToken);
              const chatIds = user.telegramChatId.split(',').map(s => s.trim()).filter(Boolean);
              for (const chatId of chatIds) {
                notifyEngineStalled({
                  botToken, chatId,
                  errors: totalResults.errors,
                  reason: totalResults.openaiError || 'Unknown error',
                }).catch(e => logger.warn(`Telegram stall notification failed: ${e.message}`));
              }
            }
            // Also write to activity log so it surfaces in the UI
            await prisma.activityLog.create({
              data: {
                userId: user.id,
                action: 'openai_stall_detected',
                details: JSON.stringify({
                  errors: totalResults.errors,
                  reason: totalResults.openaiError || 'Unknown error',
                  suggestion: 'Check your OpenAI API key and billing at platform.openai.com',
                }),
              },
            }).catch(e => logger.warn(`Failed to log openai_stall_detected: ${e.message}`));
          }
        } catch (alertErr) {
          logger.warn(`Stall alert failed: ${alertErr.message}`);
        }
      }
    }
  } catch (err) {
    logger.error(`Scheduler: run failed: ${err.message}`);

    // Log failed run to database
    try {
      const user = await prisma.user.findFirst();
      if (user) {
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            action: 'scheduler_run_failed',
            details: JSON.stringify({
              runId,
              error: err.message,
              timestamp: new Date().toISOString(),
            }),
          },
        });
      }
    } catch (logErr) {
      logger.error(`Failed to log scheduler failure: ${logErr.message}`);
    }
  } finally {
    isRunning = false;
  }
}

/**
 * Resolve bids that are stuck in 'pending' from a previous interrupted run.
 * A pending bid is stale when it has been waiting longer than the user's bid delay
 * plus a 3-minute buffer for API/processing time. Any such bid was never completed —
 * most likely due to a server crash or restart between create() and update().
 * Called at startup AND at the start of every scheduler run so stale bids are
 * caught quickly without waiting for the next server restart.
 */
async function cleanupStalePendingBids() {
  try {
    // Use the largest bid delay configured across all users so we never prematurely
    // mark a bid as stale while it is legitimately sitting through its delay.
    const users = await prisma.user.findMany({ select: { bidDelaySeconds: true } });
    const maxBidDelay = users.reduce((max, u) => Math.max(max, u.bidDelaySeconds || 0), 0);

    // cutoff = bidDelay + 30s for the Freelancer API call and DB overhead
    const cutoffSeconds = maxBidDelay + 30;
    const cutoff = new Date(Date.now() - cutoffSeconds * 1000);

    const { count } = await prisma.bid.updateMany({
      where: { status: 'pending', createdAt: { lt: cutoff } },
      data: { status: 'error', errorMessage: 'Bid placement interrupted (server restart or timeout)' },
    });
    if (count > 0) {
      logger.warn(`Scheduler: resolved ${count} stale pending bid(s) older than ${Math.round(cutoffSeconds / 60)}min`);
    }
  } catch (err) {
    logger.error(`Scheduler: failed to clean up stale pending bids: ${err.message}`);
  }
}

function start(cronExpression = '*/1 * * * *') {
  if (cronJob) {
    logger.warn('Scheduler: already running');
    return;
  }

  cleanupStalePendingBids();
  logger.info(`Scheduler: starting with cron "${cronExpression}"`);
  cronJob = cron.schedule(cronExpression, runAllActiveProfiles);

  // Graceful shutdown — stop cron and wait for in-progress run
  // Registered once at module level; subsequent start() calls reuse the same handlers
  if (!shutdownHandlersRegistered) {
    shutdownHandlersRegistered = true;

    const shutdown = async (signal) => {
      logger.info(`Scheduler: received ${signal}, shutting down...`);
      stop();
      // Wait for any in-progress run to finish (up to 60s)
      const deadline = Date.now() + 60000;
      while (isRunning && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 500));
      }
      logger.info('Scheduler: shutdown complete');
      // In Electron mode, let Electron handle the process lifecycle.
      // Calling process.exit() here would kill the entire Electron app abruptly.
      if (process.env.ELECTRON_MODE !== 'true') {
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

function stop() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Scheduler: stopped');
  }
}

function getStatus() {
  return {
    running: !!cronJob,
    processing: isRunning,
  };
}

module.exports = { start, stop, getStatus, runAllActiveProfiles };
