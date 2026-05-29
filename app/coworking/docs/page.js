"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const F = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const FM = "'IBM Plex Mono', 'Fira Code', monospace";
const BRAND = "#1B4F8A";
const BRAND_LIGHT = "#EBF2FA";
const BORDER = "#E2E8F0";
const TEXT = "#1A202C";
const MUTED = "#64748B";

/* ─── Image Block — paste your hosted URL into src prop ─────────────────── */
function ImgBlock({ src, label, note }) {
  if (src) {
    return (
      <div style={{ width: "100%", margin: "24px 0", borderRadius: 8, overflow: "hidden", border: `1px solid ${BORDER}`, background: "#F8FAFC" }}>
        <div style={{ width: "100%", textAlign: "center", lineHeight: 0 }}>
          <img
            src={src}
            alt={label || "Screenshot"}
            style={{ maxWidth: "100%", width: "auto", height: "auto", display: "inline-block" }}
          />
        </div>
        {label && (
          <div style={{
            padding: "7px 14px", background: "#F8FAFC", borderTop: `1px solid ${BORDER}`,
            fontSize: 12, color: MUTED, fontFamily: F, fontStyle: "italic",
          }}>
            {label}
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{
      width: "100%", minHeight: 200, margin: "24px 0",
      background: "#F1F5FB",
      border: "1.5px dashed #BAD0EE",
      borderRadius: 8,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 12,
    }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#93BFDD" strokeWidth="1.3">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#7BA7C8", fontWeight: 600, fontFamily: F }}>{label || "Paste image URL in src prop"}</div>
        {note && <div style={{ fontSize: 11, color: "#A0BAD0", fontFamily: F, marginTop: 4 }}>{note}</div>}
        <div style={{ fontSize: 10, color: "#C0D8EA", fontFamily: FM, marginTop: 6 }}>{'<ImgBlock src="https://your-image-url.png" />'}</div>
      </div>
    </div>
  );
}

/* ─── Navigate Button ───────────────────────────────────────────────────── */
function NavButton({ path, label, icon, description }) {
  const router = useRouter();
  return (
    <span
      onClick={() => router.push(path)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        color: BRAND, fontSize: 13, fontFamily: F, cursor: "pointer",
        textDecoration: "underline", textUnderlineOffset: 3,
        marginRight: 20, marginBottom: 4,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 6h8M6 3l3 3-3 3" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}

/* ─── Shared Components ─────────────────────────────────────────────────── */
function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontSize: 24, fontWeight: 700, color: TEXT, fontFamily: F,
      margin: "0 0 6px 0", paddingBottom: 12,
      borderBottom: `2px solid ${BRAND}`,
    }}>{children}</h2>
  );
}

function SubTitle({ children }) {
  return (
    <h3 style={{
      fontSize: 15, fontWeight: 700, color: BRAND, fontFamily: F,
      margin: "30px 0 10px 0",
    }}>{children}</h3>
  );
}

function Para({ children }) {
  return <p style={{ fontSize: 14, color: "#374151", lineHeight: 1.9, margin: "0 0 14px 0", fontFamily: F }}>{children}</p>;
}

function Note({ type = "info", children }) {
  const s = {
    info:    { bg: "#EFF6FF", border: "#2563EB", icon: "ℹ" },
    tip:     { bg: "#F0FDF4", border: "#16A34A", icon: "✓" },
    warning: { bg: "#FFFBEB", border: "#D97706", icon: "!" },
    danger:  { bg: "#FEF2F2", border: "#DC2626", icon: "✕" },
  }[type];
  return (
    <div style={{
      padding: "11px 16px", background: s.bg,
      borderLeft: `3px solid ${s.border}`,
      borderRadius: "0 7px 7px 0", margin: "16px 0",
      fontSize: 13, color: "#374151", lineHeight: 1.75, fontFamily: F,
      display: "flex", gap: 10,
    }}>
      <span style={{ color: s.border, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <span>{children}</span>
    </div>
  );
}

function Step({ n, title, desc }) {
  return (
    <div style={{ display: "flex", gap: 14, marginBottom: 18, alignItems: "flex-start" }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%", background: BRAND, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, flexShrink: 0, fontFamily: FM, marginTop: 1,
      }}>{n}</div>
      <div style={{ paddingTop: 3 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: TEXT, fontFamily: F, marginBottom: 3 }}>{title}</div>
        {desc && <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.75, fontFamily: F }}>{desc}</div>}
      </div>
    </div>
  );
}

function Table({ headers, rows }) {
  return (
    <div style={{ overflowX: "auto", margin: "16px 0", borderRadius: 8, border: `1px solid ${BORDER}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: F }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: "11px 16px", background: "#F1F5F9",
                color: "#374151", fontWeight: 600, textAlign: "left",
                borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#FAFBFC" }}>
              {row.map((cell, j) => (
                <td key={j} style={{
                  padding: "10px 16px", borderBottom: `1px solid ${BORDER}`,
                  color: "#374151", verticalAlign: "top", lineHeight: 1.6,
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FaqItem({ q, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", padding: "14px 18px", background: open ? "#F8FAFF" : "#FAFBFC",
        border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
        fontFamily: F, fontSize: 14, fontWeight: 600, color: open ? BRAND : TEXT, textAlign: "left",
      }}>
        <span>{q}</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s", flexShrink: 0, marginLeft: 12 }}>
          <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          padding: "14px 20px 18px", fontSize: 14, color: "#374151",
          lineHeight: 1.85, fontFamily: F, borderTop: `1px solid ${BORDER}`, background: "#fff",
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: BORDER, margin: "36px 0" }} />;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  CONTENT SECTIONS                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

function CeoAccess() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>👑 CEO / Admin — Full Platform Access</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          The CEO or Admin role has unrestricted access to every feature in CoWork. This is the highest privilege role responsible for platform configuration, team management, office settings, and all final approvals.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="📋" label="Go to Task List" description="View and manage all tasks across the organization" />
      <NavButton path="/coworking/office-settings" icon="🏢" label="Go to Office Settings" description="Configure working hours, days, and max action gap" />
      <NavButton path="/coworking/settings" icon="⚙️" label="Go to Settings" description="Manage employees and platform configuration" />

      <ImgBlock
        src=""
        label="CoWork Dashboard — CEO view showing all team tasks and live timers"
      />

      <SubTitle>Role Overview</SubTitle>
      <Para>As CEO or Admin, you are the primary authority in CoWork. Every task, employee, deadline, and setting is under your control. You can create any type of task, assign it to any employee, manage all deadlines, and give final approvals at any stage of the workflow.</Para>

      <SubTitle>Task Management Capabilities</SubTitle>
      <Para>CEO can create all task types — Timer Task, Fixed Deadline Task, Repeat Task, Goal Task, and Third-Party Task. You can assign tasks to any employee or Team Lead, set priority levels, and configure the review flow for each task.</Para>

      <Table
        headers={["Feature", "Description"]}
        rows={[
          ["Create all task types", "Timer, Fixed Deadline, Repeat, Goal, Third-Party, Self-Assign"],
          ["Delete tasks", "Permanently remove any task — only CEO can do this"],
          ["Edit deadline", "Modify the deadline of any in-progress task at any time"],
          ["Forward / Split tasks", "Reassign or divide a task between employees"],
          ["Set review flow", "Choose TL Final or TL → CEO for each task's approval chain"],
          ["Sender timer preset", "Pre-set a time window before the employee sees the task"],
          ["Watch live timers", "Monitor all employees' active timers in real time"],
          ["Approve extensions", "Approve or reject deadline extension requests from employees"],
        ]}
      />

      <ImgBlock
        src=""
        label="Task Creation Modal — CEO view showing all available task types"
      />

      <SubTitle>Office Settings — CEO Exclusive</SubTitle>
      <Para>The Office Settings page is accessible only to the CEO. It is where you define the working schedule that powers all smart deadline calculations across the platform. Every employee's timer due date is calculated using these settings.</Para>

      <Table
        headers={["Setting", "What It Controls"]}
        rows={[
          ["Working days", "Which days of the week are active (e.g., Mon–Sat, Sun off)"],
          ["Working hours per day", "In-time and out-time for each day (e.g., 9:30 AM – 6:30 PM)"],
          ["Max action gap", "Maximum time allowed between task creation and first Play button press"],
        ]}
      />

      <ImgBlock
        src=""
        label="Office Settings Page — Configure working hours and schedule"
      />

      <SubTitle>Review & Approvals</SubTitle>
      <Para>CEO can review and approve or reject any submitted task regardless of which review flow was set. In a TL → CEO flow, the task first goes to Team Lead and then to CEO for final sign-off. CEO can also bypass any flow and directly approve a submission at any time.</Para>

      <SubTitle>Employee Management</SubTitle>
      <Para>CEO manages all employee accounts — creating new profiles, assigning managers and team leads, setting role permissions, and deactivating accounts when needed. CEO also approves self-assign task requests from employees.</Para>

      <ImgBlock
        src=""
        label="Employee Management Panel — Create and manage team accounts"
      />

      <Note type="info">Office Settings changes take effect immediately for all future timer starts. Previously calculated due dates are not affected by settings changes.</Note>
    </div>
  );
}

function TlAccess() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>🧑‍💼 Team Leader — Scoped Team Access</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          Team Leaders manage the tasks and workload of their assigned team members. They have broad control over task creation, deadline approval, and completion review — but cannot access platform-wide settings or delete tasks.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="📋" label="Go to Task List" description="View and manage your team's tasks" />
      <NavButton path="/coworking/messages" icon="💬" label="Go to Messages" description="DMs and group messages with your team" />

      <ImgBlock
        src=""
        label="Team Leader Dashboard — Team task list with deadline status"
      />

      <SubTitle>What Team Leaders Can Do</SubTitle>
      <Table
        headers={["Feature", "Access Level"]}
        rows={[
          ["Create & assign tasks to team", "✅ Full access"],
          ["Delete tasks", "❌ CEO only"],
          ["Approve deadline proposals", "✅ Approve, counter-propose, or reject"],
          ["Watch live employee timers", "✅ All team members"],
          ["Approve/reject extension requests", "✅ Yes"],
          ["Review completions (TL level)", "✅ Approve or reject with reason"],
          ["CEO final approval", "❌ CEO only"],
          ["Office Settings configuration", "❌ CEO only"],
          ["Manage employee accounts", "❌ CEO only"],
          ["Forward and split tasks", "✅ Yes"],
        ]}
      />

      <ImgBlock
        src=""
        label="Deadline Proposal Review — TL approving or counter-proposing employee's request"
      />

      <SubTitle>Deadline Negotiation</SubTitle>
      <Para>When an employee proposes a deadline duration for a timer task, the Team Leader receives a notification. The TL can approve the exact duration, suggest a different amount, or reject the proposal with a reason. Full back-and-forth counter-proposals are supported until both parties agree.</Para>

      <SubTitle>Reviewing Task Completions</SubTitle>
      <Para>When an employee submits a task for review, the TL receives the submission. The TL reviews the work, attachments, and notes, then either approves or rejects with detailed feedback. If the review flow is TL → CEO, the TL's approval sends the task to CEO for final sign-off.</Para>

      <ImgBlock
        src=""
        label="Task Completion Review Modal — TL reviewing submitted work"
      />

      <SubTitle>Limitations</SubTitle>
      <Note type="warning">Team Leaders cannot delete tasks, configure Office Settings, manage employee accounts, or give CEO-level final approvals. These actions are reserved exclusively for the CEO / Admin role.</Note>

      <ImgBlock
        src=""
        label="TL View — Live timer monitoring panel for team members"
      />
    </div>
  );
}

function MemberAccess() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>👤 Member (Employee) — Personal Task Access</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          Members work on tasks assigned to them by their CEO or Team Leader. They can propose deadlines, start and pause their timer, submit work for review, and request extensions — but they cannot see or manage anyone else's tasks.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="📋" label="Go to My Tasks" description="View all tasks assigned to you" />
      <NavButton path="/coworking/messages" icon="💬" label="Go to Messages" description="Direct messages and task chats" />

      <ImgBlock
        src=""
        label="Employee Task List — Personal task view with status and timer indicators"
      />

      <SubTitle>What Employees Can Do</SubTitle>
      <Table
        headers={["Feature", "Access Level"]}
        rows={[
          ["View own assigned tasks", "✅ Yes — own tasks only"],
          ["Propose deadline duration", "✅ Yes — for timer tasks"],
          ["Accept or counter TL proposals", "✅ Yes"],
          ["Start and pause timer", "✅ Yes — own tasks only"],
          ["Submit commit log on pause", "✅ Yes — auto-prompted on each pause"],
          ["Request deadline extension", "✅ Yes — after deadline passes"],
          ["Submit task for review", "✅ Yes"],
          ["Re-submit after rejection", "✅ Yes"],
          ["Create self-assign tasks", "✅ Yes — requires approver sign-off"],
          ["See other employees' tasks", "❌ No"],
          ["Approve deadlines", "❌ No"],
          ["Review completions", "❌ No"],
        ]}
      />

      <ImgBlock
        src=""
        label="Timer Banner — Employee view with Play/Pause button and progress bar"
      />

      <SubTitle>Starting a Task — Step by Step</SubTitle>
      <Step n={1} title="Receive task notification" desc="You get notified when a new task is assigned to you. It appears in your task list." />
      <Step n={2} title="Propose a deadline (timer tasks)" desc="Enter how many hours or minutes you need to complete the task and submit for TL approval." />
      <Step n={3} title="Wait for approval" desc="Your TL reviews the proposal and approves, counter-proposes, or rejects." />
      <Step n={4} title="Confirm the task" desc="After approval, click Confirm & Accept. The task moves to Ready state." />
      <Step n={5} title="Press Play to start working" desc="The timer starts. Your exact due date is calculated from this moment using your office's working hours." />

      <ImgBlock
        src=""
        label="Confirm and Start Task Flow — Employee confirmation screen"
      />

      <SubTitle>Submitting Your Work</SubTitle>
      <Para>When you believe the work is complete, click Submit for Review from the task detail page. You can attach files and add a completion note. The submission then enters the TL/CEO approval chain defined for that task.</Para>

      <ImgBlock
        src=""
        label="Submit for Review Modal — Employee adding completion note and attachments"
      />

      <Note type="tip">You can track your complete work history in the Work Timeline section inside each task — showing every timer session with exact start and pause timestamps.</Note>
    </div>
  );
}

function DeadlineTask() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>📅 Deadline-Based Tasks</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          A deadline-based task is tied to a fixed calendar date and time. The employee is expected to complete the task before that specific date. There is no running timer — only a hard due date that is visible to everyone with access to the task.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="📋" label="Go to Task List" description="Create and manage deadline-based tasks" />

      <ImgBlock
        src=""
        label="Create Task Modal — Fixed Deadline type selected with date picker"
      />

      <SubTitle>How Deadline-Based Tasks Work</SubTitle>
      <Para>When creating a deadline-based task, the sender sets a fixed date and time as the hard deadline. The employee receives the task, reviews the deadline, and either accepts it or proposes a different date before confirming. Once confirmed, the task is In Progress and the employee works toward the fixed due date.</Para>

      <Step n={1} title="Sender creates task with a fixed deadline" desc="CEO or TL sets a specific date and time (e.g., 15 Jan 2025, 6:00 PM) as the hard deadline." />
      <Step n={2} title="Employee receives the task" desc="The assigned employee sees the task in their list with the due date clearly displayed." />
      <Step n={3} title="Employee reviews and negotiates (if needed)" desc="Employee can accept the given deadline or propose a new date. TL/CEO can approve or counter the proposal." />
      <Step n={4} title="Employee confirms the task" desc="Once the deadline is agreed, employee clicks Confirm & Accept. Task moves to In Progress." />
      <Step n={5} title="Employee submits before the deadline" desc="Work is submitted for review via the Submit for Review button. Late submissions are flagged as overdue." />

      <ImgBlock
        src=""
        label="Task Detail View — Deadline-based task with due date and overdue indicator"
      />

      <SubTitle>Deadline Negotiation</SubTitle>
      <Para>If the employee believes the given deadline is unreasonable, they can propose an alternative date from the task's Details tab. The TL/CEO receives the proposal and can approve, suggest another date, or reject it. The task cannot be confirmed until the deadline is mutually agreed upon.</Para>

      <ImgBlock
        src=""
        label="Deadline Negotiation — Employee proposing a new due date"
      />

      <SubTitle>Overdue Handling</SubTitle>
      <Para>If the task deadline passes without submission, the task is marked overdue in the task list. A red indicator appears on the task. The employee can request a deadline extension from the Details tab. The TL/CEO reviews and either approves a new deadline or rejects the extension request.</Para>

      <ImgBlock
        src=""
        label="Overdue Task — Red deadline indicator and extension request button in Details tab"
      />

      <SubTitle>Deadline Task vs Timer Task — Key Differences</SubTitle>
      <Table
        headers={["Aspect", "Deadline-Based Task", "Timer-Based Task"]}
        rows={[
          ["Time tracking", "No active timer — only a due date", "Yes — active Play/Pause timer"],
          ["Deadline set by", "Sender, with date negotiation", "Calculated from approved window + office hours"],
          ["Pausing work", "Not applicable", "Employee can pause and resume"],
          ["Extension type", "Request a new calendar date", "Request additional time window (hours/minutes)"],
          ["Auto-stop", "No — employee submits manually", "Yes — timer disables at deadline"],
          ["Progress visibility", "Via daily reports only", "Via live timer + work commit logs"],
        ]}
      />

      <Note type="warning">The task does not auto-close when a deadline-based task's date passes. The employee must manually submit the work. The overdue status is clearly visible to TL and CEO in the task list.</Note>
    </div>
  );
}

function TimerTask() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>⏱️ Timer-Based Tasks (Play & Pause)</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          Timer tasks use an active Play/Pause timer to track working time. The employee is allocated a working time window (e.g., 4 hours). The system calculates a precise wall-clock deadline using the CEO's Office Settings — skipping off-hours and non-working days automatically.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="📋" label="Go to Task List" description="View your active timer tasks" />
      <NavButton path="/coworking/office-settings" icon="🏢" label="Office Settings (CEO)" description="Configure working hours that power deadline calculations" />

      <ImgBlock
        src=""
        label="Task Action Banner — Active timer with Play/Pause button and progress bar"
      />

      <SubTitle>How the Timer Works</SubTitle>
      <Para>The timer measures real elapsed wall-clock time from when the employee first presses Play. It uses the CEO's Office Settings (working hours per day and working days) to skip off-hours and weekends automatically. This means a 4-hour task assigned at 5 PM on Friday will not expire until 4 full working hours are consumed — starting from the next working morning.</Para>

      <Note type="info">The due date shown in the task's <strong>"Due at"</strong> field is calculated the <strong>first time the employee presses Play</strong>. The value shown before that is a preliminary estimate. The final value is locked at the moment Play is first pressed.</Note>

      <SubTitle>Complete Timer Task Lifecycle</SubTitle>
      <Step n={1} title="Task is created and assigned" desc="CEO or TL creates a timer task with or without a preset time window." />
      <Step n={2} title="Employee proposes a duration" desc="Employee enters how many hours/minutes they need. Sent to TL/CEO for approval." />
      <Step n={3} title="TL/CEO approves or negotiates" desc="TL can approve, suggest a different duration, or reject. Employee may counter back." />
      <Step n={4} title="Employee confirms the task" desc="Once deadline is approved, employee clicks Confirm & Start. Task becomes In Progress." />
      <Step n={5} title="Employee presses Play" desc="The timer starts. The exact due date is calculated from this moment using office hours." />
      <Step n={6} title="Employee pauses and resumes" desc="Employee can pause at any time. Each pause creates a permanent work commit log entry." />
      <Step n={7} title="Timer reaches deadline" desc="Play button turns red and is disabled. Extension must be requested before resuming." />
      <Step n={8} title="Employee submits for review" desc="Once work is complete, employee submits. TL/CEO reviews and approves or rejects." />

      <ImgBlock
        src=""
        label="Deadline Proposal Flow — Employee proposing duration, TL reviewing"
      />

      <SubTitle>Play / Pause Button States</SubTitle>
      <Table
        headers={["State", "Button Appearance", "Action"]}
        rows={[
          ["Timer not yet started", "Blue ▶ Play button", "Click to start — final due date is calculated now"],
          ["Timer actively running", "Green ⏸ Pause button", "Click to pause — saves a work commit log"],
          ["Timer paused", "Blue ▶ Resume button", "Click to resume — continues the countdown"],
          ["Deadline passed, not running", "Red button, disabled", "Cannot start — request extension first"],
          ["Deadline passed, currently running", "Green ⏸ Pause button", "Can still pause the active session"],
          ["Another task is running", "Greyed out, disabled", "Cannot start — pause the other task first"],
        ]}
      />

      <ImgBlock
        src=""
        label="Play/Pause Button — Normal, Running, and Overdue states"
      />

      <SubTitle>Work Commit Logs</SubTitle>
      <Para>Every time the employee pauses the timer, a work commit log is automatically recorded. This log stores the session start time, end (pause) time, total seconds worked in that session, an optional message, and any file attachments. These logs form the complete work history visible to TL and CEO in the Work Timeline section.</Para>

      <ImgBlock
        src=""
        label="Work Timeline — Session logs with start and pause timestamps"
      />

      <SubTitle>Deadline Extension Process</SubTitle>
      <Para>When a timer deadline passes, the Play button locks red. The employee must go to the Details tab and click Request Deadline Extension. They select a new proposed date/time and provide a reason. The TL/CEO reviews and can approve (new deadline set immediately), reject, or suggest a different date.</Para>

      <Note type="warning">Pausing the timer does not extend the deadline. The wall clock continues ticking after every pause. If you pause for 2 hours, those 2 hours count toward the deadline window.</Note>
    </div>
  );
}

function DirectMessage() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>💬 Direct Messages (DM)</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          Direct Messages allow any two users in CoWork to have a private, real-time conversation. DMs are independent of tasks and are available to all roles — CEO, Team Leader, and Employee.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/messages" icon="💬" label="Go to Messages" description="Open your Direct Messages inbox" />

      <ImgBlock
        src=""
        label="Direct Message View — Private conversation between two team members"
      />

      <SubTitle>How to Start a Direct Message</SubTitle>
      <Step n={1} title="Open Messages from the left sidebar" desc="Click the Messages icon in the CoWork navigation to open the messaging panel." />
      <Step n={2} title="Click New Message or select a team member" desc="Search for the person's name. If a previous conversation exists, it opens automatically." />
      <Step n={3} title="Type and send your message" desc="Use the message input at the bottom. Supports text, file attachments, and images." />
      <Step n={4} title="View read receipts" desc="A small indicator shows when the recipient has read your message." />

      <ImgBlock
        src=""
        label="DM — Compose window with file attachment and read receipt indicator"
      />

      <SubTitle>Features Available in DMs</SubTitle>
      <Table
        headers={["Feature", "Description"]}
        rows={[
          ["Text messages", "Real-time text messaging with any team member"],
          ["File attachments", "Send images, PDFs, and documents"],
          ["Full message history", "Complete conversation history is permanently preserved"],
          ["Read receipts", "See when the other person has read your message"],
          ["Online status", "See if the person is currently active on CoWork"],
          ["Search messages", "Search within a DM conversation for specific content"],
        ]}
      />

      <ImgBlock
        src=""
        label="DM Panel — User list with online status indicators"
      />

      <SubTitle>Privacy</SubTitle>
      <Para>DMs are strictly private between the two participants. No other team member, Team Leader, or CEO can read DM conversations unless they are one of the two direct participants in that conversation.</Para>

      <ImgBlock
        src=""
        label="Messages Panel — Full DM interface with user list and conversation view"
      />

      <Note type="info">Use DMs for quick personal communication. For task-related discussion, use the Task Chat which keeps the conversation tied to the specific task context.</Note>
    </div>
  );
}

function GroupMessage() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>👥 Group Messages</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          Group Messages allow multiple team members to communicate in a shared channel. Group chats are useful for team-wide announcements, project discussions, and department-level coordination.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/messages" icon="💬" label="Go to Messages" description="Access group message channels" />

      <ImgBlock
        src=""
        label="Group Message Channel — Multi-participant conversation view"
      />

      <SubTitle>Creating a Group</SubTitle>
      <Para>CEO or Team Leaders can create a new group message channel by selecting participants and giving the group a name. All added members receive an invitation and can start messaging immediately.</Para>

      <Step n={1} title="Click + New Group in the Messages panel" desc="Found in the left sidebar under the Messages section." />
      <Step n={2} title="Enter a group name" desc="Give the group a clear name (e.g., 'Design Team', 'Q4 Project', 'Frontend Dev')." />
      <Step n={3} title="Add members" desc="Search for and select all members to include. Multiple members can be added at once." />
      <Step n={4} title="Create the group" desc="All selected members are added immediately and can see the channel history from creation." />

      <ImgBlock
        src=""
        label="Create Group Modal — Name input and member selection"
      />

      <SubTitle>Group Channel Features</SubTitle>
      <Table
        headers={["Feature", "Description"]}
        rows={[
          ["Text & file sharing", "All standard messaging — text, images, documents"],
          ["@mentions", "Type @ to mention a specific member and send them a direct notification"],
          ["Pinned messages", "Pin important messages so they stay visible at the top"],
          ["Add / remove members", "CEO or TL can manage group membership at any time"],
          ["Searchable history", "Full message history from the day of creation"],
          ["Notification settings", "Members can mute or adjust notifications per group"],
        ]}
      />

      <ImgBlock
        src=""
        label="Group Message — @mention functionality and pinned message"
      />

      <Note type="tip">Use group messages for team-level communication that is not tied to a specific task. For task-specific discussions, use the Task Chat tab inside the task itself.</Note>

      <ImgBlock
        src=""
        label="Group Message — Multiple participants with member list sidebar"
      />
    </div>
  );
}

function SubChat() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>📋 Sub Chat (Task Chat)</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          Every task in CoWork has its own built-in chat thread — called Sub Chat or Task Chat. This keeps all task-related communication in one place, directly alongside the task details, timer, and actions.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="📋" label="Go to Tasks" description="Open any task to access its Sub Chat" />

      <ImgBlock
        src=""
        label="Task Detail Page — Chat tab showing the full task conversation thread"
      />

      <SubTitle>Draft Chat vs Task Chat</SubTitle>
      <Para>Every task has two chat phases. The Draft Chat is available before the task is confirmed and is used for pre-start discussions like deadline negotiation. The Task Chat unlocks after the task is confirmed and is the main communication channel throughout the work period.</Para>

      <Table
        headers={["Chat Type", "When Active", "Who Can See It", "Purpose"]}
        rows={[
          ["Draft Chat", "Before task confirmation", "Assignee + Sender only", "Deadline negotiation, pre-start clarification"],
          ["Task Chat", "After task confirmation", "Assignee, Sender, TL, CEO", "Work updates, progress discussion, feedback, review"],
        ]}
      />

      <ImgBlock
        src=""
        label="Draft Chat Tab — Pre-confirmation discussion for deadline negotiation"
      />

      <SubTitle>Accessing the Task Chat</SubTitle>
      <Step n={1} title="Open any task from the task list" desc="Click on a task to open the full detail panel on the right side." />
      <Step n={2} title="Click the Chat tab" desc="The Chat tab is visible in the task detail view alongside Details, Reports, and Timeline tabs." />
      <Step n={3} title="Send messages, attach files" desc="Use the message input at the bottom. Full rich-text and file attachment support." />
      <Step n={4} title="Switch between Draft and Task Chat" desc="Use the tab toggle at the top of the chat area to switch between Draft Chat (pre-confirmation) and Task Chat (post-confirmation)." />

      <ImgBlock
        src=""
        label="Task Chat — File attachment, message thread, and switch between Draft and Task Chat"
      />

      <SubTitle>Message Permissions in Task Chat</SubTitle>
      <Table
        headers={["Action", "Employee", "Team Leader", "CEO"]}
        rows={[
          ["Send messages", "✅ Yes", "✅ Yes", "✅ Yes"],
          ["Attach files", "✅ Yes", "✅ Yes", "✅ Yes"],
          ["View message history", "✅ Own tasks only", "✅ Team tasks", "✅ All tasks"],
          ["Delete messages", "❌ No", "❌ No", "✅ CEO only"],
        ]}
      />

      <ImgBlock
        src=""
        label="Task Chat — Full conversation view with attachments and timestamp"
      />

      <Note type="info">Task Chat messages are not private. All parties with access to the task (assignee, creator, TL, CEO) can see the full conversation history. Use DMs for private conversations.</Note>
    </div>
  );
}

function CoworkMail() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>✉️ CoWork Internal Mail</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          CoWork Mail is a built-in formal email system for structured, long-form internal communications. Unlike instant messaging, CoWork Mail is designed for official correspondence that needs to be archived and searchable — performance feedback, policy notices, HR communications, and more.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/mail" icon="✉️" label="Go to CoWork Mail" description="Open your internal mail inbox" />

      <ImgBlock
        src=""
        label="CoWork Mail — Inbox view showing received internal mail"
      />

      <SubTitle>When to Use CoWork Mail vs Messaging</SubTitle>
      <Table
        headers={["Situation", "Use This"]}
        rows={[
          ["Quick task question to a colleague", "💬 Direct Message"],
          ["Team update or announcement", "👥 Group Message"],
          ["Task progress discussion", "📋 Task Chat"],
          ["Performance review feedback", "✉️ CoWork Mail"],
          ["Company policy update", "✉️ CoWork Mail"],
          ["HR communication or notice", "✉️ CoWork Mail"],
          ["External client or vendor email", "📤 Gmail Integration"],
        ]}
      />

      <ImgBlock
        src=""
        label="CoWork Mail — Compose window with rich text editor"
      />

      <SubTitle>How to Send Internal Mail</SubTitle>
      <Step n={1} title="Open CoWork Mail from the navigation" desc="Click the Mail icon in the left sidebar to open your inbox." />
      <Step n={2} title="Click Compose" desc="Opens the compose window with To, CC, Subject, and Body fields." />
      <Step n={3} title="Select recipient(s)" desc="Type a name to search for a team member. Multiple recipients supported." />
      <Step n={4} title="Write your message" desc="Rich text editor supports formatting, bullet points, and file attachments." />
      <Step n={5} title="Send" desc="The recipient is notified and can reply directly from their inbox. Full thread history is preserved." />

      <ImgBlock
        src=""
        label="Compose Window — Rich text formatting and attachment options"
      />

      <SubTitle>CEO Broadcast Mail</SubTitle>
      <Para>CEO has the ability to send a broadcast mail to all employees simultaneously. This is useful for company-wide announcements, holiday notices, or policy changes. Broadcast mails appear in every employee's inbox with a Broadcast badge to distinguish them from individual mail.</Para>

      <ImgBlock
        src=""
        label="CEO Broadcast Mail — Send to all employees at once"
      />

      <Note type="tip">All CoWork mails are permanently stored and searchable. They are never auto-deleted. This makes CoWork Mail the recommended channel for anything that needs a permanent record.</Note>
    </div>
  );
}

function GmailIntegration() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>📤 Gmail Integration</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          CoWork integrates with Gmail to allow authorized users to send external emails directly from the platform. Sent emails are automatically logged in the task activity history so the entire team can see external communications in context.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/settings" icon="⚙️" label="Go to Settings → Integrations" description="Connect your Gmail account to CoWork" />
      <NavButton path="/coworking/mail" icon="📤" label="Go to CoWork Mail" description="Send external emails after Gmail is connected" />

      <ImgBlock
        src=""
        label="Settings — Gmail Integration connected account and status"
      />

      <SubTitle>Who Can Use Gmail Integration</SubTitle>
      <Para>Gmail integration is currently available to CEO and Team Leaders. Employee accounts are limited to CoWork's internal mail system only and cannot connect external Gmail accounts.</Para>

      <Note type="warning">Emails sent via Gmail integration come from your personal Gmail account — not a shared company address. Always use a professional company email when connecting.</Note>

      <SubTitle>How to Connect Your Gmail Account</SubTitle>
      <Step n={1} title="Go to Profile Settings" desc="Click your profile photo in the top right corner and select Settings." />
      <Step n={2} title="Open the Integrations tab" desc="Find the Integrations or Connected Accounts section in your settings." />
      <Step n={3} title="Click Connect Gmail" desc="You are redirected to Google's OAuth authorization page." />
      <Step n={4} title="Grant send permission" desc="Allow CoWork to send emails on your behalf. CoWork does not read or access your inbox." />
      <Step n={5} title="Return to CoWork" desc="Your Gmail is now connected and ready for sending external emails from any task." />

      <ImgBlock
        src=""
        label="Gmail OAuth — Connect Gmail to CoWork settings screen"
      />

      <SubTitle>Sending External Emails</SubTitle>
      <Para>Once connected, a Send External Email option appears in the task detail page. You can send emails to any external address — clients, vendors, or partners — directly from within the task. The email is composed in a modal inside CoWork and sent through your connected Gmail account.</Para>

      <ImgBlock
        src=""
        label="Send External Email Modal — Gmail compose inside CoWork task view"
      />

      <SubTitle>Email Activity Logging</SubTitle>
      <Para>Every external email sent via Gmail integration is automatically logged in the task's activity history. The log includes the timestamp, recipient address, subject line, and sender name. This ensures full transparency — any TL or CEO can audit what was communicated externally about a specific task.</Para>

      <ImgBlock
        src=""
        label="Task Activity Log — External Gmail email recorded with details"
      />

      <Note type="info">The Gmail connection requires a one-time OAuth authorization. Once authorized you do not need to reconnect unless you manually revoke access from your Google Account settings at myaccount.google.com.</Note>
    </div>
  );
}

function GoalTask() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>🎯 Goal-Based Tasks</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          Goal tasks are milestone-based assignments where progress is tracked against defined targets rather than time. Instead of a timer, the employee logs progress updates and TL/CEO monitors completion against the stated goal targets in real time.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="🎯" label="Go to Tasks" description="Create or view goal-based tasks" />

      <ImgBlock
        src=""
        label="Goal Task — Task Detail View with Goal Progress tab open"
      />

      <SubTitle>Goal Tasks vs Timer Tasks</SubTitle>
      <Table
        headers={["Aspect", "Goal Task", "Timer Task"]}
        rows={[
          ["Primary metric", "Progress toward targets", "Time worked (seconds)"],
          ["Active timer", "No — progress logs instead", "Yes — Play/Pause button"],
          ["Deadline type", "Calendar date set by sender", "Wall-clock based on office hours"],
          ["Employee action", "Log progress entries", "Start/pause timer"],
          ["Visibility for TL/CEO", "Real-time progress logs", "Live timer + work commit logs"],
          ["Submission trigger", "Employee marks goals complete", "After timer runs out or extension"],
        ]}
      />

      <ImgBlock
        src=""
        label="Goal Progress Tab — Milestones and progress entries logged by employee"
      />

      <SubTitle>Creating a Goal Task</SubTitle>
      <Step n={1} title="Select Goal Task in Create Task modal" desc="CEO or TL opens the task creation modal and selects the Goal Task type." />
      <Step n={2} title="Define goal targets" desc="Write a clear goal description with specific, measurable targets the employee must achieve." />
      <Step n={3} title="Set a target completion date" desc="Pick a calendar date by which the goal should be fully achieved." />
      <Step n={4} title="Assign to employee(s)" desc="Select the employee(s) responsible. They receive the task immediately." />

      <SubTitle>Employee Progress Flow</SubTitle>
      <Step n={1} title="Employee reviews goal targets" desc="Opens the Goal Progress tab to understand the full scope of what must be achieved." />
      <Step n={2} title="Employee confirms the goal" desc="Clicks Confirm & Accept Goal. Task chat unlocks for discussion with TL/CEO." />
      <Step n={3} title="Employee logs progress entries" desc="At any point, the employee can add a progress entry — what was done, percentage complete, and optional attachments." />
      <Step n={4} title="TL/CEO monitors in real time" desc="Progress entries appear in the Goal Progress tab as they are logged — no waiting for a formal submission." />
      <Step n={5} title="Employee submits for final review" desc="When all goals are met, the employee clicks Submit for Review." />
      <Step n={6} title="TL/CEO approves or requests more work" desc="Reviewer checks all progress logs, confirms targets are met, then approves or sends back for revision." />

      <ImgBlock
        src=""
        label="Progress Entry Form — Employee logging a progress update with attachments"
      />

      <SubTitle>Progress Entry Details</SubTitle>
      <Para>Each progress entry contains: a timestamp of when it was logged, a text description of what was accomplished, an optional percentage complete indicator, and optional file attachments such as screenshots, reports, or exports. Entries are permanent and cannot be deleted once submitted.</Para>

      <ImgBlock
        src=""
        label="Goal Task — TL/CEO view of all progress entries in real time"
      />

      <Note type="tip">Encourage employees to log progress entries frequently throughout the work period — even small daily updates. This gives TLs and CEOs real-time visibility and reduces the need for status check-in meetings.</Note>
    </div>
  );
}

function WorkflowMotto() {
  return (
    <div>
      <div style={{ marginBottom: 30 }}>
        <SectionTitle>🔄 Overall Working Flow & Platform Guide</SectionTitle>
        <p style={{ fontSize: 14, color: MUTED, marginTop: 10, fontFamily: F, lineHeight: 1.8 }}>
          CoWork is built around one principle: <strong>every task is tracked, every deadline is fair, and every action is visible.</strong> This section explains the overall platform philosophy and how all the pieces fit together — along with the most frequently asked questions.
        </p>
      </div>

      <div style={{ fontSize: 12, color: "#94A3B8", fontFamily: F, marginBottom: 4, marginTop: 2 }}>Navigate to:</div>
      <NavButton path="/coworking/tasks" icon="📋" label="Go to Task List" description="See all tasks and their current status" />
      <NavButton path="/coworking/office-settings" icon="🏢" label="Office Settings (CEO)" description="Configure the working schedule" />
      <NavButton path="/coworking/messages" icon="💬" label="Go to Messages" description="DMs, groups, and task chats" />

      <ImgBlock
        src=""
        label="CoWork Platform — Full overview dashboard showing all modules"
      />

      <SubTitle>The End-to-End Workflow</SubTitle>
      <Step n={1} title="CEO configures the platform" desc="CEO sets up Office Settings — working hours, working days, and max action gap. This is the foundation of all smart deadline calculations." />
      <Step n={2} title="CEO or TL creates a task" desc="A task is created with a type, assignee, description, and optionally a preset time window or deadline. The task immediately appears in the employee's inbox." />
      <Step n={3} title="Deadline negotiation (timer tasks)" desc="Employee proposes how much time they need. TL reviews and approves, suggests a different amount, or rejects. This continues until both agree." />
      <Step n={4} title="Employee confirms and starts" desc="After approval, the employee confirms the task and presses Play. The wall-clock deadline is calculated at this exact moment using the office schedule." />
      <Step n={5} title="Employee works with full visibility" desc="Timer runs in real time. TL and CEO watch the live timer. Every pause creates a permanent work commit log with timestamps." />
      <Step n={6} title="Deadline management" desc="If the deadline passes, the timer locks. The employee requests an extension which TL/CEO reviews before work can resume." />
      <Step n={7} title="Submission and review" desc="Employee submits the completed work with notes and attachments. It goes through the configured review chain (TL Only, or TL then CEO)." />
      <Step n={8} title="Approval and closure" desc="Once fully approved, the task is marked Done and permanently archived with its complete history." />

      <ImgBlock
        src=""
        label="End-to-End Task Flow — Creation through approval and closure"
      />

      <SubTitle>The Three Core Pillars</SubTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, margin: "16px 0 28px" }}>
        {[
          { icon: "📋", title: "Structured Accountability", desc: "Every task has a defined owner, deadline, and review chain. There is no ambiguity about who is responsible or when work is due." },
          { icon: "⏱️", title: "Fair Time Tracking", desc: "Deadlines are calculated based on actual working hours — not 24-hour clocks. Evenings and weekends never count against employees." },
          { icon: "👁️", title: "Full Visibility", desc: "TLs and CEOs see every task's status, live timer, work logs, and communication in real time without interrupting the employee." },
        ].map(p => (
          <div key={p.title} style={{ padding: "18px", border: `1px solid ${BORDER}`, borderRadius: 9, background: "#FAFBFC" }}>
            <div style={{ fontSize: 26, marginBottom: 10 }}>{p.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8, fontFamily: F }}>{p.title}</div>
            <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.75, fontFamily: F }}>{p.desc}</div>
          </div>
        ))}
      </div>

      <ImgBlock
        src=""
        label="Live Timer Dashboard — CEO monitoring all active team timers simultaneously"
      />

      <Divider />

      <SubTitle>Frequently Asked Questions (FAQ)</SubTitle>

      <FaqItem q="Can an employee start a task without a deadline being approved?">
        No. For timer tasks, the deadline must be mutually approved before the employee can confirm the task and press Play. The system prevents the timer from starting until an approved deadline window exists.
      </FaqItem>

      <FaqItem q="What happens if the TL rejects an employee's deadline proposal?">
        The task returns to Open status. The employee receives a rejection notification along with the reason provided by the TL. The employee must submit a new deadline proposal. The task remains on hold until a new proposal is approved.
      </FaqItem>

      <FaqItem q="Can two timers run at the same time for the same employee?">
        No. Only one task timer can be active at a time per employee. If you try to start a second task's timer, CoWork will prompt you to pause the currently running task first before the new timer can begin.
      </FaqItem>

      <FaqItem q="What exactly is the Max Action Gap in Office Settings?">
        The Max Action Gap is the maximum allowed time between when a task is created and when the employee first presses Play. If the employee starts after this gap, the deadline anchors to the task creation time plus the gap — not the actual press time. This prevents employees from delaying their start to push the deadline further into the future.
      </FaqItem>

      <FaqItem q="Can the CEO change a deadline after the employee has already started working?">
        Yes. The CEO can edit the deadline of any active task at any time using the Edit Deadline option in the task detail page. The updated deadline takes effect immediately and is visible to all parties. The employee does not need to re-confirm.
      </FaqItem>

      <FaqItem q="What happens to a task if the assigned employee is unavailable?">
        The CEO or TL can use the Forward / Split Task feature to reassign the task to another employee. The new assignee receives the task with the complete history intact and must confirm it before the timer can start.
      </FaqItem>

      <FaqItem q="Is there a limit to how many deadline extensions an employee can request?">
        There is no hard system limit. However, each extension requires explicit approval from TL or CEO. Repeated extension requests are visible in the task history and may be reviewed or escalated at the manager's discretion.
      </FaqItem>

      <FaqItem q="What is the difference between a daily report and submitting for review?">
        A daily report is an informal progress update submitted during the task — used for regular check-ins and to keep TL/CEO updated. Submitting for review is the formal final submission that triggers the approval chain and closes the task on approval. A task can have many daily reports but only one final submission per attempt.
      </FaqItem>

      <FaqItem q="Can an employee see tasks assigned to their colleagues?">
        No. Employees can only see tasks assigned to them. Team Leaders can see all tasks belonging to their team. CEO can see every task across the entire organization.
      </FaqItem>

      <FaqItem q="What data is stored in the Work Timeline?">
        Every timer pause creates a permanent work commit log containing: the session start time (calculated as pause time minus seconds worked in the session), the exact pause timestamp, total seconds worked in that session, an optional message from the employee, and any attached files. These logs cannot be deleted and are always visible to TL and CEO.
      </FaqItem>

      <FaqItem q="What is a self-assign task and how does it work?">
        A self-assign task is a task created by an employee for themselves — rather than being assigned by a manager. After creation, the task is automatically sent to a designated approver (set at creation time, usually a TL or CEO). The approver must sign off before the employee can confirm the task and start the timer.
      </FaqItem>

      <FaqItem q="What does the review flow 'TL then CEO' mean?">
        When the review flow is set to TL then CEO, the employee's submission first goes to the Team Leader. If the TL approves, the task then goes to the CEO for final sign-off. Only after the CEO approves is the task marked Done. In the TL Final flow, the TL's approval closes the task without needing CEO involvement.
      </FaqItem>
    </div>
  );
}

/* ─── SIDEBAR STRUCTURE ──────────────────────────────────────────────────── */
const SIDEBAR = [
  {
    id: "roles", label: "Roles & Access", icon: "👥",
    children: [
      { id: "ceo", label: "CEO Access", icon: "👑", component: CeoAccess },
      { id: "tl", label: "Team Leader Access", icon: "🧑‍💼", component: TlAccess },
      { id: "member", label: "Member Access", icon: "👤", component: MemberAccess },
    ],
  },
  {
    id: "tasks", label: "Task Categories", icon: "📋",
    children: [
      { id: "deadline-task", label: "Deadline-Based Task", icon: "📅", component: DeadlineTask },
      { id: "timer-task", label: "Timer-Based Task", icon: "⏱️", component: TimerTask },
    ],
  },
  {
    id: "messages", label: "Messages", icon: "💬",
    children: [
      { id: "dm", label: "Direct Message (DM)", icon: "💬", component: DirectMessage },
      { id: "group", label: "Group Message", icon: "👥", component: GroupMessage },
      { id: "subchat", label: "Sub Chat (Task Chat)", icon: "📋", component: SubChat },
    ],
  },
  {
    id: "mail", label: "Mail System", icon: "📧",
    children: [
      { id: "cowork-mail", label: "CoWork Internal Mail", icon: "✉️", component: CoworkMail },
      { id: "gmail", label: "Gmail Integration", icon: "📤", component: GmailIntegration },
    ],
  },
  {
    id: "goal-task", label: "Goal-Based Tasks", icon: "🎯",
    children: [
      { id: "goal", label: "Goal Task Overview", icon: "🎯", component: GoalTask },
    ],
  },
  {
    id: "workflow", label: "Working Flow & FAQ", icon: "🔄",
    children: [
      { id: "flow", label: "Overall Working Flow", icon: "🔄", component: WorkflowMotto },
    ],
  },
];

/* ─── MAIN PAGE ──────────────────────────────────────────────────────────── */
export default function CoworkDocsPage() {
  const [openSections, setOpenSections] = useState({ roles: true, tasks: false, messages: false, mail: false, "goal-task": false, workflow: false });
  const [active, setActive] = useState("ceo");

  const toggleSection = (id) => setOpenSections(s => ({ ...s, [id]: !s[id] }));

  const allItems = SIDEBAR.flatMap(s => s.children);
  const activeItem = allItems.find(i => i.id === active);
  const ActiveComponent = activeItem?.component;
  const activeSection = SIDEBAR.find(s => s.children.some(c => c.id === active));

  return (
    <div style={{ display: "flex", height: "100vh", background: "#fff", fontFamily: F, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        .nav-child:hover { background: ${BRAND_LIGHT} !important; color: ${BRAND} !important; }
        .nav-section-btn:hover { background: #F1F5F9 !important; }
      `}</style>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: 268, flexShrink: 0, background: "#FAFBFC",
        borderRight: `1px solid ${BORDER}`,
        display: "flex", flexDirection: "column", height: "100vh", overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 18px 16px", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, background: BRAND, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="5.2" height="5.2" rx="1.4" fill="#fff" />
                <rect x="8.8" y="2" width="5.2" height="5.2" rx="1.4" fill="#fff" opacity="0.65" />
                <rect x="2" y="8.8" width="5.2" height="5.2" rx="1.4" fill="#fff" opacity="0.65" />
                <rect x="8.8" y="8.8" width="5.2" height="5.2" rx="1.4" fill="#fff" opacity="0.3" />
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A", fontFamily: F }}>CoWork</div>
              <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase" }}>Documentation</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "14px 10px 24px" }}>
          {SIDEBAR.map(section => (
            <div key={section.id} style={{ marginBottom: 2 }}>
              <button
                className="nav-section-btn"
                onClick={() => toggleSection(section.id)}
                style={{
                  width: "100%", padding: "8px 10px", border: "none", cursor: "pointer",
                  background: "transparent", display: "flex", alignItems: "center", justifyContent: "space-between",
                  borderRadius: 6, fontFamily: F, transition: "background 0.1s",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  <span style={{ fontSize: 14 }}>{section.icon}</span>
                  {section.label}
                </span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                  style={{ transform: openSections[section.id] ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}>
                  <path d="M4 2l4 4-4 4" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {openSections[section.id] && (
                <div style={{ paddingLeft: 6, marginTop: 2, marginBottom: 4 }}>
                  {section.children.map(child => (
                    <button
                      key={child.id}
                      className="nav-child"
                      onClick={() => setActive(child.id)}
                      style={{
                        width: '100%', padding: '7px 10px 7px 16px', border: 'none', cursor: 'pointer',
                        borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8,
                        fontFamily: F, fontSize: 13, textAlign: 'left', marginBottom: 1,
                        background: active === child.id ? BRAND_LIGHT : 'transparent',
                        color: active === child.id ? BRAND : '#374151',
                        fontWeight: active === child.id ? 600 : 400,
                        borderLeft: active === child.id ? `2px solid ${BRAND}` : '2px solid transparent',
                        transition: 'background 0.1s, color 0.1s',
                      }}>
                      <span style={{ fontSize: 13, flexShrink: 0 }}>{child.icon}</span>
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
        <div style={{
          padding: '13px 44px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', gap: 7,
          position: 'sticky', top: 0, background: '#fff', zIndex: 10,
        }}>
          <span style={{ fontSize: 12, color: '#94A3B8', fontFamily: F }}>{activeSection?.label}</span>
          <span style={{ color: BORDER, fontSize: 16, lineHeight: 1 }}>›</span>
          <span style={{ fontSize: 12, color: '#374151', fontWeight: 600, fontFamily: F }}>{activeItem?.label}</span>
        </div>
        <div style={{ margin: '0 auto', padding: '44px 44px 100px' }}>
          {ActiveComponent && <ActiveComponent />}
        </div>
      </main>
    </div>
  );
}