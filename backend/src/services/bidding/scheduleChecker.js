const prisma = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * Check if current time is within the global schedule window
 * @returns {Promise<{allowed: boolean, reason: string}>}
 */
async function checkGlobalSchedule() {
  try {
    // Get the first user's schedule settings (single-user system)
    const user = await prisma.user.findFirst({
      select: {
        scheduleEnabled: true,
        scheduleTimezone: true,
        scheduleStartTime: true,
        scheduleEndTime: true,
        scheduleDays: true,
      },
    });

    // If no user or schedule not enabled, allow all operations
    if (!user || !user.scheduleEnabled) {
      return { allowed: true, reason: 'Schedule not enabled' };
    }

    // Validate schedule configuration
    if (!user.scheduleDays || user.scheduleDays.trim() === '') {
      logger.error('Schedule check: scheduleDays is empty or invalid');
      return { allowed: false, reason: 'Invalid schedule configuration: no days configured' };
    }

    // Get current time in user's timezone
    const now = new Date();
    const userTime = getUserTimeInTimezone(now, user.scheduleTimezone);

    // Check day of week
    const allowedDays = user.scheduleDays.split(',').map(d => parseInt(d)).filter(d => !isNaN(d));
    if (allowedDays.length === 0) {
      logger.error('Schedule check: no valid days found in scheduleDays');
      return { allowed: false, reason: 'Invalid schedule configuration: no valid days' };
    }

    const currentDay = userTime.day;

    if (!allowedDays.includes(currentDay)) {
      return {
        allowed: false,
        reason: `Day ${currentDay} not in allowed days: ${allowedDays.join(',')}`
      };
    }

    // Check time window (if specified)
    if (user.scheduleStartTime && user.scheduleEndTime) {
      const currentTime = `${String(userTime.hours).padStart(2, '0')}:${String(userTime.minutes).padStart(2, '0')}`;

      if (currentTime < user.scheduleStartTime || currentTime >= user.scheduleEndTime) {
        return {
          allowed: false,
          reason: `Current time ${currentTime} outside window ${user.scheduleStartTime}-${user.scheduleEndTime}`
        };
      }
    }

    return { allowed: true, reason: 'Within schedule window' };
  } catch (err) {
    logger.error(`Schedule check failed: ${err.message}`);
    // Fail open - allow processing if check fails
    return { allowed: true, reason: 'Schedule check error - allowing by default' };
  }
}

/**
 * Get current date/time components in a specific timezone
 * @param {Date} date - The date to convert
 * @param {string} timezone - IANA timezone name (e.g., "America/New_York")
 * @returns {Object} - Object with day, hours, minutes in the specified timezone
 */
function getUserTimeInTimezone(date, timezone) {
  try {
    // Use Intl API to get time components in user's timezone
    // Use hourCycle: 'h23' (hours 0-23) instead of hour12: false.
    // hour12: false is ambiguous — on macOS/Electron ICU it can use the h12 cycle
    // without AM/PM, returning "00" for noon (12 PM) instead of "12", which causes
    // the schedule check to think noon is midnight and block bidding from 12pm–7pm.
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find(p => p.type === type)?.value;

    // Map weekday names to numbers (0=Sunday, 6=Saturday)
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };

    return {
      day: dayMap[get('weekday')] ?? 0,
      hours: parseInt(get('hour') || '0'),
      minutes: parseInt(get('minute') || '0')
    };
  } catch (err) {
    logger.error(`Timezone conversion failed for ${timezone}: ${err.message}`);
    // Re-throw error to fail schedule check rather than using wrong timezone
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

module.exports = { checkGlobalSchedule };
