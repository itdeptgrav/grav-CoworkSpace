"use strict";
/**
 * services/schedulingService.js
 * Computes remaining hours per task and greedily bin-packs them across days
 * using an employee's measured daily online hours (from cowork_duty_status).
 */
const { db } = require("../config/firebaseAdmin");

function getRemainingHours(task) {
  const etc = Number(task.etcHours) || 0;
  if (task.hoursCompleted != null) {
    return Math.max(+(etc - Number(task.hoursCompleted)).toFixed(2), 0);
  }
  const pct = Math.min(Math.max(Number(task.progressPercent) || 0, 0), 100);
  return +(etc * (1 - pct / 100)).toFixed(2);
}

function dateKey(d) { return d.toISOString().slice(0, 10); }
function nextDay(d) { const n = new Date(d); n.setDate(n.getDate() + 1); return n; }

function scheduleTasks(tasks, dailyCapacityHours, startDate = new Date(), maxDaysLookahead = 3650) {
  const capacityFor = typeof dailyCapacityHours === "function" ? dailyCapacityHours : () => dailyCapacityHours;
  const ordered = [...tasks].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));

  let cursorDate = new Date(startDate);
  let hoursLeftToday = capacityFor(dateKey(cursorDate));
  let daysAdvanced = 0;
  const results = [];

  for (const task of ordered) {
    let remaining = getRemainingHours(task);
    const original = remaining;
    const perDay = [];

    if (remaining <= 0) {
      results.push({ taskId: task.taskId, title: task.title, remainingHours: 0, scheduledDueDate: null, hoursPerDay: [] });
      continue;
    }

    while (remaining > 0) {
      if (hoursLeftToday <= 0) {
        cursorDate = nextDay(cursorDate);
        if (++daysAdvanced > maxDaysLookahead) {
          throw new Error("scheduleTasks: no capacity found within lookahead window.");
        }
        hoursLeftToday = capacityFor(dateKey(cursorDate));
        continue;
      }
      const consume = Math.min(remaining, hoursLeftToday);
      perDay.push({ date: dateKey(cursorDate), hours: +consume.toFixed(2) });
      remaining = +(remaining - consume).toFixed(2);
      hoursLeftToday = +(hoursLeftToday - consume).toFixed(2);
    }

    results.push({
      taskId: task.taskId, title: task.title,
      remainingHours: original,
      scheduledDueDate: cursorDate.toISOString().slice(0, 10),
      hoursPerDay: perDay,
    });
  }
  return results;
}

/**
 * getRollingDailyCapacity — average of the employee's actual online hours
 * over the last N days (from the dailyHours map written by DutyStatusToggle).
 * Falls back to a flat number for employees with no history yet.
 */
async function getRollingDailyCapacity(employeeId, { days = 7, fallbackHours = 6 } = {}) {
  const snap = await db.collection("cowork_duty_status").doc(employeeId).get();
  const dailyHours = snap.exists ? (snap.data().dailyHours || {}) : {};

  const today = new Date();
  const recentValues = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (dailyHours[key] != null) recentValues.push(Number(dailyHours[key]));
  }

  if (recentValues.length === 0) return fallbackHours;
  return +(recentValues.reduce((a, b) => a + b, 0) / recentValues.length).toFixed(2);
}

/** Read-only: proposes a schedule, does NOT write anything to cowork_tasks. */
async function computeScheduleForEmployee(employeeId, tasks, opts = {}) {
  const capacity = await getRollingDailyCapacity(employeeId, opts);
  return scheduleTasks(tasks, capacity, opts.startDate || new Date());
}

module.exports = { getRemainingHours, scheduleTasks, getRollingDailyCapacity, computeScheduleForEmployee };