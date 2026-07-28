# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GRAV's internal collaboration app — Next.js 16 App Router, React 19, deployed as `cowork.grav.in`. Chat (groups + DMs), tasks with approval chains, scheduled meets with LiveKit audio/video, meeting recording and transcript summarisation, SOP tracking, employee scoring (C1/C2/PMP), office monitoring, and MRF requests.

Despite the repo name (`grav-CoworkSpace`) and the `# grav-cms-frontend` line in `README.md`, this is the cowork app, **not** the CMS. The CMS is a separate repo (`grav-cms`, `cms.grav.in`).

The backend is a third repo, **`grav-cms-backend`**, normally cloned as a sibling folder and running on `:5000`. Everything here hits its `/cowork/**` routes.

Active branch here is typically `PRAMOD`, not `main`. Check before committing.

## Commands

```bash
npm run dev        # next dev → :3000 — use `npx next dev -p 3001` if grav-cms already holds 3000
npm run build
npm start
npm run lint       # BROKEN — declares `eslint .` but no eslint config or dependency is installed
```

There is no test framework.

`next.config.mjs` sets `typescript.ignoreBuildErrors: true` and `images.unoptimized: true`, so **`next build` will not catch type errors**. Most files are `.js`; only `hooks/` and a few `components/ui/` files are TypeScript.

## Auth is Firebase, not the CMS JWT

This is the main structural difference from `grav-cms`. `app/page.js` **is** the login screen (not a marketing page), and it calls `lib/coworkAuth.js`:

1. `signInWithEmailAndPassword` against Firebase Auth
2. read `role` from the ID token's **custom claims** (`ceo` | `tl` | `employee`)
3. verify a `cowork_employees` Firestore doc exists, matched by `authUid` then falling back to `email`
4. reject and **sign back out** if the doc is missing, or if `isActive === false` / `status` is `inactive` or `suspended`

Steps 3–4 deliberately mirror the backend's `Middlewear/coworkAuth.js` (same lookup order, same rejection rules). Change one, change the other — a client that accepts a user the server will 403 produces a confusing half-logged-in state.

Already-authenticated users are bounced from `/` to `/coworking` by an `onCoworkAuthChange` subscription.

## API access

**`lib/coworkApi.js` is the single client for backend calls.** `coworkFetch` prefixes `${NEXT_PUBLIC_API_URL}/cowork`, pulls a fresh ID token per request via `firebaseAuth.currentUser.getIdToken()`, and throws on non-JSON responses. It exports one named function per endpoint (`listTasks`, `assignTask`, `approveTask`, `sendGroupMessage`, `scheduleMeet`, `fetchSops`, …). Add new endpoints there rather than calling `fetch` inline.

Specialised siblings follow the same shape: `taskTreeApi.js`, `taskForwardApi.js`, `transcriptApi.js`, `livekitApi.js`, `monitorApi.js`, `mediaUploadApi.js`, `emergencyApproval.js`, `googleWorkspaceApi.js`.

Some reads bypass the backend entirely and hit Firebase directly from the browser — `lib/coworkFirebase.js` (Firestore), `lib/coworkRtdb.js` (Realtime Database, for presence/live state), `lib/coworkSocket.js` (Socket.IO). Before adding a query, check which layer the neighbouring feature uses; the same collection is sometimes read both ways.

**`app/providers.js` wraps the app in a TanStack Query `QueryClientProvider`** (60s `staleTime`, `refetchOnWindowFocus: false`, `retry: 1`). React Query *is* available here — unlike in `grav-cms`, where the same file is a bare passthrough.

## Socket.IO rooms

The backend joins clients to rooms by convention; the emit names matter:

- `join_cowork` with an `employeeId` → per-user room, also broadcasts `workspace-member-status`
- `join_group` / `leave_group` → `group_<groupId>`
- `join_dm` / `leave_dm` → `dm_<chatId>`, where **`chatId = [senderId, receiverId].sort().join("_")`** — the sort is required or the two participants land in different rooms
- `join_meeting_room` / `leave_meeting_room` → `meeting_<meetId>`; late joiners are auto-sent `recording_started`
- `typing` → `typing_indicator` fan-out on the DM room

Meeting recording state is held in a process-local map on the server, so it does not survive a backend restart.

## Structure

`@/*` maps to the project root. shadcn/ui in `components/ui/` (new-york, neutral, lucide). Tailwind v4 via `@tailwindcss/postcss` — no `tailwind.config` file; tokens live in `app/globals.css`, `lib/designTokens.js`, and `lib/coworkStyles.js`.

```
app/coworking/       tasks, task-settings, fix-priorities, groups, direct-messages, mail,
                     calendar, schedule-meet, cowork-meeting, audio-call, sop, pmp, mrf,
                     office-monitor, status-tracking, docs, join, create-employee,
                     create-group, settings
app/api/             cloudinary/upload, delete-screenshot, audio-call-token   (route handlers)
app/workspace/       google-panel
hooks/               useCoworkAuth, useCoworkTasks, useCoworkMessages, useCoworkGroups,
                     useCoworkMeets, useCoworkNotifications, useCoworkSocket, useTaskTimer,
                     useMeetingRecording, useMeetingTranscript, useDutyStatus,
                     useFCMToken, usePushNotifications
```

`layout.js` sets `viewport.maximumScale: 1` and `interactiveWidget: "resizes-content"` — the app is used on phones and this stops keyboard-driven layout jumps. A `pages/api/upload-to-drive.js` still exists alongside the App Router.

## This repo is the maintained superset

`lib/cowork*.js`, `hooks/useCowork*.ts`, `components/coworking/`, and `app/coworking/` **also exist in the `grav-cms` repo**, as a trimmed older copy. Nothing syncs them.

Present here and absent there: `office-monitor`, `pmp`, `mrf`, `audio-call`, `cowork-meeting`, `mail`, `sop`, `status-tracking`, `docs`, `join`, `fix-priorities`, `task-settings`, and the `lib/` files backing them (`livekitApi`, `monitorApi`, `transcriptApi`, `pipMeetingStore`, `liveScreenshot`, `generateTranscriptDocx`, `officeDueDate`, `emergencyApproval`, `tasksPageHelpers`, `coworkPushNotifications`).

Treat this repo as the source of truth for cowork behaviour. Port *to* `grav-cms` only when that repo's copy genuinely needs the change, and expect drift.

## Environment

`.env` is untracked. Needs `NEXT_PUBLIC_API_URL` (backend base, no `/cowork` suffix), `NEXT_PUBLIC_BACKEND_URL` / `NEXT_PUBLIC_BACKEND_LOCAL_URL`, `NEXT_PUBLIC_MONITOR_BACKEND`, the `NEXT_PUBLIC_FIREBASE_*` set including `NEXT_PUBLIC_FIREBASE_DATABASE_URL` (RTDB is used, not just Firestore) and `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (web push), `NEXT_PUBLIC_CLOUDINARY_*` plus server-side `CLOUDINARY_API_SECRET`, and `NEXT_PUBLIC_LIVEKIT_URL`.

A new dev origin (LAN IP, tunnel, Vercel preview) must also be added to the `allowedOrigins` array at the top of the backend's `server.js` — it gates both CORS **and** the Socket.IO handshake, and an unlisted origin fails with an opaque `Not allowed by CORS`.

## Domain notes

- **Roles are `ceo` | `tl` | `employee`**, sourced from Firebase custom claims and enforced server-side by `verifyCeoToken` / `verifyCeoOrTL`. The server caches the employee record for 5 minutes, so a role or status change won't take effect immediately.
- **C1 / C2 / PMP** are employee scoring systems. Band thresholds live in Firestore (`bandconfigs`), not in code, so scoring behaviour changes without a deploy.
- **Timer-SOP** applies daily "bleach" penalties for SOP violations, finalized by a backend cron at ~00:15 IST. All SOP and attendance date logic is IST-based (`Date.now() + 5.5h`, then read with `getUTC*`) — match that pattern rather than introducing a timezone library.
- **Tasks carry an approval chain**: `approverId`, `isSelfAssigned`, `selfAssignApproved`, and `visibleTo`. Self-assigned tasks need TL approval (`approveTask`). The backend runs a repair pass over `cowork_tasks` on every boot to backfill these fields, which is a good indicator of how easily they get out of sync — set all of them together when creating tasks.
- **Meeting transcripts** are recorded via LiveKit, uploaded, and summarised with Gemini on the backend (`meetingSummary.routes.js`, `transcript.routes.js`); `lib/generateTranscriptDocx.js` renders the result client-side.
