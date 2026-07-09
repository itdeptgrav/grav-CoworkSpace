/**
 * lib/officeDueDate.js
 *
 * All date arithmetic uses explicit IST (UTC+5:30) offset.
 * No server local timezone is ever used — safe on UTC production servers.
 */

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 330 minutes

// ── IST helpers ──────────────────────────────────────────────────────────────

/** Get day-of-week (0=Sun) in IST for a UTC ms timestamp */
function _istDow(ms) {
  return new Date(ms + IST_OFFSET_MS).getUTCDay();
}

/** Get IST midnight (as UTC ms) for the IST calendar day containing utcMs */
function _istMidnightUtcMs(utcMs) {
  const ist = new Date(utcMs + IST_OFFSET_MS);
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS;
}

/** Build a UTC ms timestamp for HH:MM IST on the IST calendar day of utcMs */
function _istTimeMs(utcMs, timeStr) {
  const [h, m] = (timeStr || "18:30").split(":").map(Number);
  return _istMidnightUtcMs(utcMs) + (h * 60 + m) * 60 * 1000;
}

/** Advance to next IST calendar day midnight (as UTC ms), skipping off days */
function _nextWorkDayStartMs(utcMs, schedule) {
  let dayMs = _istMidnightUtcMs(utcMs) + IST_OFFSET_MS + 24 * 60 * 60 * 1000;
  // dayMs is now IST midnight of next day as IST ms — convert back to UTC
  dayMs -= IST_OFFSET_MS;

  for (let i = 0; i < 7; i++) {
    const dayKey = DAY_KEYS[_istDow(dayMs)];
    const cfg = _dayCfg(dayKey, schedule);
    if (!cfg.isOff) {
      return _istTimeMs(dayMs, cfg.inTime);
    }
    dayMs += 24 * 60 * 60 * 1000;
  }
  return dayMs; // fallback
}

/** Get schedule config for a day with safe defaults */
function _dayCfg(dayKey, schedule) {
  return schedule?.[dayKey] ?? { isOff: dayKey === "sunday", inTime: "09:30", outTime: "18:30" };
}

// ── Core: advance a UTC ms timestamp to the next valid IST working moment ────
function _advanceToWorkHoursMs(utcMs, schedule) {
  let cur = utcMs;
  for (let i = 0; i < 14; i++) {
    const dayKey = DAY_KEYS[_istDow(cur)];
    const cfg = _dayCfg(dayKey, schedule);
    if (cfg.isOff) { cur = _nextWorkDayStartMs(cur, schedule); continue; }
    const dayStartMs = _istTimeMs(cur, cfg.inTime);
    const dayEndMs = _istTimeMs(cur, cfg.outTime);
    if (cur < dayStartMs) return dayStartMs;
    if (cur >= dayEndMs) { cur = _nextWorkDayStartMs(cur, schedule); continue; }
    return cur; // within working hours
  }
  return cur;
}

// ── Core: add windowSecs of IST working time to fromMs ───────────────────────
function _addWorkingSecsMs(fromMs, windowSecs, schedule) {
  let remaining = windowSecs;
  let cur = _advanceToWorkHoursMs(fromMs, schedule);
  let safety = 0;
  while (remaining > 0 && safety++ < 60) {
    const dayKey = DAY_KEYS[_istDow(cur)];
    const cfg = _dayCfg(dayKey, schedule);
    if (cfg.isOff) { cur = _nextWorkDayStartMs(cur, schedule); continue; }
    const dayEndMs = _istTimeMs(cur, cfg.outTime);
    if (cur >= dayEndMs) { cur = _nextWorkDayStartMs(cur, schedule); continue; }
    const availSecs = (dayEndMs - cur) / 1000;
    if (remaining <= availSecs) return cur + remaining * 1000;
    remaining -= availSecs;
    cur = _nextWorkDayStartMs(cur, schedule);
  }
  return cur;
}

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Calculate due date for a timer task.
 * Anchors from task creation time + maxGap if employee started late.
 */
export function calcDueDate(windowSecs, schedule, maxGapMinutes, taskCreatedAtMs) {
  const now = Date.now();
  const elapsed = now - taskCreatedAtMs;
  const maxGapMs = (maxGapMinutes || 120) * 60 * 1000;
  const anchorMs = elapsed > maxGapMs ? taskCreatedAtMs + maxGapMs : now;
  return new Date(_addWorkingSecsMs(anchorMs, windowSecs, schedule)).toISOString();
}

/**
 * Add windowSecs of working time from anchorMs through IST office hours.
 * Works correctly even when anchorMs is in the future.
 */
export function addWorkingSecs(anchorMs, windowSecs, schedule) {
  return new Date(_addWorkingSecsMs(anchorMs, windowSecs, schedule)).toISOString();
}

/**
 * Snap a UTC timestamp forward to the next valid IST office moment.
 */
export function snapToOfficeHours(timestampMs, schedule) {
  return new Date(_advanceToWorkHoursMs(timestampMs, schedule)).toISOString();
}