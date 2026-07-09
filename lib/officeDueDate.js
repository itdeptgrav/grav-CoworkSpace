/**
 * lib/officeDueDate.js
 *
 * Utility: calculates the wall-clock due date for a timer task
 * considering:
 *   1. Max allowed action gap — if employee starts late, anchor
 *      the countdown to (task.createdAt + maxGapMinutes), not to now.
 *   2. Office in/out times per day — deadline only counts working hours,
 *      so it rolls over to the next working period automatically.
 *
 * Usage:
 *   import { calcDueDate } from "../../../lib/officeDueDate";
 *   const dueDate = calcDueDate(windowSecs, schedule, maxGapMinutes, taskCreatedAtMs);
 */

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * Main export.
 * @param {number} windowSecs         - Approved timer window in seconds
 * @param {object} schedule           - Office schedule from Firestore settings
 * @param {number} maxGapMinutes      - Max allowed gap (minutes) from task creation to start
 * @param {number} taskCreatedAtMs    - task.createdAt as ms timestamp
 * @returns {string}                  - ISO dueDate string
 */
export function calcDueDate(windowSecs, schedule, maxGapMinutes, taskCreatedAtMs) {
  const now = Date.now();
  const elapsed = now - taskCreatedAtMs;
  const maxGapMs = (maxGapMinutes || 120) * 60 * 1000;

  // If employee started AFTER the allowed gap → anchor to gap end (not to now).
  // e.g. task created 4:30 PM, gap = 2h, employee starts at 6:35 PM
  //      → anchorMs = 4:30 PM + 2h = 6:30 PM  (not 6:35 PM)
  const anchorMs = elapsed > maxGapMs
    ? taskCreatedAtMs + maxGapMs
    : now;

  return _addWorkingSecs(anchorMs, windowSecs, schedule);
}

/**
 * Adds `windowSecs` of working time to `fromMs`, skipping off-hours and off-days.
 */
function _addWorkingSecs(fromMs, windowSecs, schedule) {
  let remaining = windowSecs;
  let cur = _advanceToWorkHours(new Date(fromMs), schedule);

  // Safety: max 60 iterations (covers 12 weeks of daily loops)
  let safety = 0;
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  while (remaining > 0 && safety++ < 60) {
    const dayKey = DAY_KEYS[new Date(cur.getTime() + IST_OFFSET_MS).getUTCDay()];
    const cfg = _dayCfg(dayKey, schedule);

    if (cfg.isOff) {
      cur = _nextDayStart(cur, schedule);
      continue;
    }

    const dayEnd = _timeOnDay(cur, cfg.outTime);

    if (cur >= dayEnd) {
      cur = _nextDayStart(cur, schedule);
      continue;
    }

    const availSecs = (dayEnd.getTime() - cur.getTime()) / 1000;

    if (remaining <= availSecs) {
      return new Date(cur.getTime() + remaining * 1000).toISOString();
    }

    remaining -= availSecs;
    cur = _nextDayStart(cur, schedule);
  }

  return cur.toISOString();
}

/**
 * If `date` is before office opens → snap to open time.
 * If `date` is after office closes → advance to next working day start.
 * If `date` is within office hours → return as-is.
 */
function _advanceToWorkHours(date, schedule) {
  let cur = new Date(date);

  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  for (let i = 0; i < 14; i++) {
    const dayKey = DAY_KEYS[new Date(cur.getTime() + IST_OFFSET_MS).getUTCDay()];
    const cfg = _dayCfg(dayKey, schedule);

    if (cfg.isOff) {
      cur = _nextDayStart(cur, schedule);
      continue;
    }

    const dayStart = _timeOnDay(cur, cfg.inTime);
    const dayEnd = _timeOnDay(cur, cfg.outTime);

    if (cur < dayStart) return dayStart;   // before opening → snap to open
    if (cur >= dayEnd) { cur = _nextDayStart(cur, schedule); continue; } // after close
    return cur;                             // within working hours
  }
  return cur;
}

/**
 * Advance to next calendar day and snap to that day's inTime.
 * Skips off days automatically.
 */
function _nextDayStart(date, schedule) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  // Advance one IST calendar day
  const istMs = date.getTime() + IST_OFFSET_MS;
  const istDay = new Date(istMs);
  let nextISTDay = new Date(Date.UTC(
    istDay.getUTCFullYear(), istDay.getUTCMonth(), istDay.getUTCDate() + 1
  ));

  for (let i = 0; i < 7; i++) {
    // Get day-of-week in IST
    const istDayMs = nextISTDay.getTime();
    const dayOfWeek = new Date(istDayMs + IST_OFFSET_MS).getUTCDay();
    const dayKey = DAY_KEYS[dayOfWeek];
    const cfg = _dayCfg(dayKey, schedule);
    if (!cfg.isOff) {
      const [h, m] = cfg.inTime.split(":").map(Number);
      // Convert IST h:m to UTC timestamp
      return new Date(istDayMs - IST_OFFSET_MS + (h * 60 + m) * 60 * 1000);
    }
    nextISTDay = new Date(istDayMs + 24 * 60 * 60 * 1000);
  }
  return new Date(nextISTDay.getTime() - IST_OFFSET_MS);
}


/** Build a Date for a HH:MM time string on the same calendar day as `base`. */
function _timeOnDay(base, timeStr) {
  const [h, m] = (timeStr || "18:30").split(":").map(Number);
  // Use UTC methods + IST offset (UTC+5:30 = 330 minutes) to avoid
  // server timezone affecting office hours calculation.
  // Store as UTC but treat as IST wall-clock time.
  const d = new Date(base);
  // Get the UTC date parts for the same IST calendar day
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h30m in ms
  const istMs = d.getTime() + IST_OFFSET_MS;
  const istDay = new Date(istMs);
  // Set to midnight IST of that day, then add h:m
  const midnightISTasUTC = new Date(
    Date.UTC(istDay.getUTCFullYear(), istDay.getUTCMonth(), istDay.getUTCDate(), 0, 0, 0, 0)
  ).getTime() - IST_OFFSET_MS;
  return new Date(midnightISTasUTC + (h * 60 + m) * 60 * 1000);
}

/** Get schedule config for a day, with safe defaults. */
function _dayCfg(dayKey, schedule) {
  return schedule?.[dayKey] ?? { isOff: dayKey === "sunday", inTime: "09:30", outTime: "18:30" };
}

/**
 * Snaps an already-computed timestamp forward to the next valid office moment.
 * If timestampMs lands inside office hours → returns it as-is.
 * If it lands outside (evening, weekend, off day) → advances to next working period open.
 * Used by delta correction to ensure shifted deadlines stay within office hours.
 */
export function snapToOfficeHours(timestampMs, schedule) {
  return _advanceToWorkHours(new Date(timestampMs), schedule).toISOString();
}

export function addWorkingSecs(anchorMs, windowSecs, schedule) {
  return _addWorkingSecs(anchorMs, windowSecs, schedule);
}