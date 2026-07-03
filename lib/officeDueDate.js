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
  while (remaining > 0 && safety++ < 60) {
    const dayKey = DAY_KEYS[cur.getDay()];
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

  for (let i = 0; i < 14; i++) {
    const dayKey = DAY_KEYS[cur.getDay()];
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
  let next = new Date(date);
  next.setDate(next.getDate() + 1);

  for (let i = 0; i < 7; i++) {
    const dayKey = DAY_KEYS[next.getDay()];
    const cfg = _dayCfg(dayKey, schedule);
    if (!cfg.isOff) {
      const [h, m] = cfg.inTime.split(":").map(Number);
      next.setHours(h, m, 0, 0);
      return next;
    }
    next.setDate(next.getDate() + 1);
  }
  return next; // fallback (shouldn't happen if at least 1 day is working)
}

/** Build a Date for a HH:MM time string on the same calendar day as `base`. */
function _timeOnDay(base, timeStr) {
  const [h, m] = (timeStr || "18:30").split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
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