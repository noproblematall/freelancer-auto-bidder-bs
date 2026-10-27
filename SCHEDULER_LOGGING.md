# Auto-Bidder Scheduler Activity Logging

**Date**: 2026-02-14
**Purpose**: Comprehensive logging to review scheduler behavior and confirm it runs as expected

---

## Overview

The auto-bidder now logs **all scheduler activity** to both console logs and the database, allowing you to:
- ✅ Review when the scheduler runs
- ✅ Confirm schedule enforcement is working correctly
- ✅ See detailed run results (projects searched, bids placed)
- ✅ Debug any issues or unexpected behavior
- ✅ Verify timing accuracy

---

## What Gets Logged

### 1. **Schedule Check Events** (`scheduler_check`)
**Frequency**: Every minute (each cron cycle)
**Purpose**: Records whether bidding is allowed or blocked

**Logged Data**:
```json
{
  "runId": "run_1707936000000",
  "allowed": true/false,
  "reason": "Within schedule window" | "Day 0 not in allowed days" | "Current time outside window...",
  "timestamp": "2026-02-14T09:00:00.000Z"
}
```

**Examples**:
- ✅ **Allowed**: `"Within schedule window"` - Bidding will proceed
- 🔵 **Blocked**: `"Day 0 not in allowed days"` - It's Sunday but schedule only allows Mon-Fri
- 🔵 **Blocked**: `"Current time 08:59 outside window 09:00-17:00"` - Too early

---

### 2. **Successful Run Completion** (`scheduler_run_completed`)
**Frequency**: When auto-bidder completes successfully
**Purpose**: Records full run statistics and performance

**Logged Data**:
```json
{
  "runId": "run_1707936000000",
  "profileCount": 2,
  "results": {
    "searched": 25,
    "filtered": 18,
    "qualified": 5,
    "placed": 3,
    "errors": 0
  },
  "startTime": "2026-02-14T09:00:00.000Z",
  "endTime": "2026-02-14T09:00:45.123Z",
  "durationMs": 45123
}
```

**Metrics Explained**:
- **searched**: Total projects fetched from Freelancer.com
- **filtered**: Projects that passed initial filters (budget, keywords, etc.)
- **qualified**: Projects that passed AI relevance scoring
- **placed**: Bids successfully placed
- **errors**: Errors encountered during run
- **durationMs**: Total execution time in milliseconds

---

### 3. **Failed Run** (`scheduler_run_failed`)
**Frequency**: When auto-bidder encounters critical error
**Purpose**: Debug issues preventing runs

**Logged Data**:
```json
{
  "runId": "run_1707936000000",
  "error": "Database connection lost",
  "timestamp": "2026-02-14T09:00:00.000Z"
}
```

---

## Where to View Logs

### 1. **Dashboard (Real-Time)**
**Location**: Dashboard page → "Scheduler Activity" section
**Shows**: Last 10 events with color-coded status

**Visual Indicators**:
- 🟢 **Green dot**: Schedule check passed OR run completed successfully
- 🔵 **Blue dot**: Schedule check blocked (outside window)
- 🔴 **Red dot**: Run failed

**Information Displayed**:
- Event type and status
- Time ago (e.g., "2 minutes ago")
- Schedule block reason (if blocked)
- Run statistics (profiles, searched, bids placed, duration)
- Error messages (if failed)

---

### 2. **Database (Persistent)**
**Table**: `activity_logs`
**Query**:
```sql
SELECT * FROM activity_logs
WHERE action IN ('scheduler_check', 'scheduler_run_completed', 'scheduler_run_failed')
ORDER BY created_at DESC
LIMIT 100;
```

**Fields**:
- `id`: Unique log ID
- `user_id`: User who owns the log
- `action`: Event type
- `details`: JSON with full event data
- `created_at`: Timestamp

---

### 3. **Console Logs (Development)**
**Location**: Terminal/console where backend is running

**Example Output**:
```
[INFO] Scheduler: processing 2 active profile(s) (runId: run_1707936000000)
[INFO] Scheduler: profile "Web Development Jobs" — searched=12, filtered=8, qualified=3, placed=2, errors=0
[INFO] Scheduler: profile "Design Projects" — searched=13, filtered=10, qualified=2, placed=1, errors=0
[INFO] Scheduler: run completed (runId: run_1707936000000) — profiles=2, searched=25, placed=3, duration=45123ms
```

---

## API Endpoint

### GET `/api/scheduler/activity`

**Description**: Retrieve scheduler activity logs
**Authentication**: Required (JWT token)

**Query Parameters**:
- `limit` (optional, default: 50): Number of logs to return
- `offset` (optional, default: 0): Pagination offset

**Response**:
```json
{
  "logs": [
    {
      "id": 123,
      "action": "scheduler_run_completed",
      "details": {
        "runId": "run_1707936000000",
        "profileCount": 2,
        "results": {
          "searched": 25,
          "placed": 3
        },
        "durationMs": 45123
      },
      "createdAt": "2026-02-14T09:00:45.123Z"
    }
  ],
  "total": 1450
}
```

**Example Usage**:
```javascript
// Get last 10 scheduler events
const { data } = await api.get('/scheduler/activity', { params: { limit: 10 } })
console.log(data.logs)
```

---

## Verification Examples

### Example 1: Verify Schedule Enforcement

**Scenario**: Schedule set to Mon-Fri, 9:00 AM - 5:00 PM EST

**Expected Logs**:

**Monday 8:59 AM EST**:
```json
{
  "action": "scheduler_check",
  "details": {
    "allowed": false,
    "reason": "Current time 08:59 outside window 09:00-17:00"
  }
}
```

**Monday 9:00 AM EST**:
```json
{
  "action": "scheduler_check",
  "details": {
    "allowed": true,
    "reason": "Within schedule window"
  }
}
```
```json
{
  "action": "scheduler_run_completed",
  "details": {
    "profileCount": 2,
    "results": { "searched": 25, "placed": 3 }
  }
}
```

**Monday 5:00 PM EST**:
```json
{
  "action": "scheduler_check",
  "details": {
    "allowed": false,
    "reason": "Current time 17:00 outside window 09:00-17:00"
  }
}
```

**Sunday 10:00 AM EST**:
```json
{
  "action": "scheduler_check",
  "details": {
    "allowed": false,
    "reason": "Day 0 not in allowed days: 1,2,3,4,5"
  }
}
```

---

### Example 2: Verify Timezone Accuracy

**Scenario**: User in PST (UTC-8), Server in UTC

**User Schedule**: 9:00 AM - 5:00 PM PST
**Server Time at 9:00 AM PST**: 5:00 PM UTC

**Expected**: Schedule check shows **allowed** at 5:00 PM UTC

**Log at 5:00 PM UTC (9:00 AM PST)**:
```json
{
  "action": "scheduler_check",
  "details": {
    "allowed": true,
    "reason": "Within schedule window",
    "timestamp": "2026-02-14T17:00:00.000Z"  // UTC time
  }
}
```

**Verification**: Even though server time is 5 PM UTC, schedule check correctly identifies it as 9 AM PST (within window).

---

### Example 3: Monitor Performance

**Use Case**: Ensure runs complete quickly

**Query Logs**:
```javascript
const { data } = await api.get('/scheduler/activity', { params: { limit: 100 } })

// Get all completed runs
const completedRuns = data.logs.filter(log => log.action === 'scheduler_run_completed')

// Calculate average duration
const avgDuration = completedRuns.reduce((sum, log) => sum + log.details.durationMs, 0) / completedRuns.length

console.log(`Average run duration: ${avgDuration}ms`)
```

**Expected**: Most runs should complete in < 60 seconds (before next cron cycle)

---

## Troubleshooting Guide

### Issue: No scheduler activity logs

**Possible Causes**:
1. Scheduler not started
2. No active profiles
3. Schedule blocking all runs

**Check**:
```javascript
// 1. Check scheduler status
const { data } = await api.get('/scheduler/status')
console.log('Scheduler running:', data.running)

// 2. Check for ANY activity logs
const { data: logs } = await api.get('/scheduler/activity')
console.log('Total logs:', logs.total)

// 3. Check schedule settings
console.log('Schedule enabled:', user.schedule.enabled)
```

---

### Issue: All checks show "blocked"

**Possible Causes**:
1. Current time outside schedule window
2. Current day not in active days
3. Timezone misconfigured

**Verify**:
1. Check current time in your timezone vs schedule window
2. Verify active days include today
3. Test with schedule temporarily disabled

---

### Issue: Runs complete but no bids placed

**Check Logs**:
```json
{
  "results": {
    "searched": 25,   // ✓ Projects found
    "filtered": 0,    // ✗ None passed filters - check profile criteria
    "qualified": 0,   // ✗ None qualified - check relevance threshold
    "placed": 0       // ✗ No bids
  }
}
```

**Diagnosis**:
- `searched > 0, filtered = 0`: Profile filters too strict (budget, keywords, location)
- `filtered > 0, qualified = 0`: AI relevance threshold too high
- `qualified > 0, placed = 0`: Bidding errors (check error count)

---

## Log Retention

**Current**: Logs stored indefinitely in database
**Recommendation**: Set up log rotation if database grows large

**Manual Cleanup** (if needed):
```sql
-- Delete logs older than 30 days
DELETE FROM activity_logs
WHERE action IN ('scheduler_check', 'scheduler_run_completed', 'scheduler_run_failed')
AND created_at < datetime('now', '-30 days');
```

**Future Enhancement**: Add automatic cleanup job

---

## Performance Impact

**Database Writes**:
- ~1 write per minute (schedule check)
- ~1 write per successful run
- Negligible impact on performance

**Storage**:
- ~1 KB per log entry
- ~1,440 schedule checks per day = ~1.4 MB/day
- ~100-200 completed runs per day = ~100-200 KB/day
- **Total**: ~1.5-2 MB per day

**Recommendation**: For long-term production use, implement log rotation after 30-90 days

---

## Summary

✅ **Complete Visibility**: Every scheduler decision is logged
✅ **Easy Debugging**: Detailed error messages and run statistics
✅ **Performance Tracking**: Duration metrics for optimization
✅ **Schedule Verification**: Confirm timing accuracy with real data
✅ **Real-Time Dashboard**: View recent activity at a glance

You can now comprehensively review scheduler behavior and confirm it runs exactly as specified!
