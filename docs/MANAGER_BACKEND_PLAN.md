# Manager Portal Backend — Implementation Plan

> **Project:** Employee Attendance & Performance Tracking System
> **Scope:** Build the complete Manager Portal API (`apps/api`)
> **Goal:** Eliminate the 404 errors on the Manager Dashboard and make all 6 manager frontend pages fully functional end-to-end
> **Status:** ⏳ Awaiting approval

---

## 1. Problem Statement

The Manager Portal frontend (`apps/manager`) is fully built (8 routes, 6 real pages), but the backend has **only 1 stub route** (`GET /api/manager/status`). Every page call fails:

| Frontend call | Result |
|---|---|
| `GET /manager/dashboard` | **404** — route doesn't exist |
| `GET /manager/team/attendance?date=` | **404** |
| `GET /manager/team/leave-requests?status=` | **404** |
| `POST /manager/team/leave/:id/decision` | **404** |
| `GET /manager/team/daily-logs?date=` | **404** |
| `GET /manager/device-requests?status=` | **404** |
| `PATCH /manager/device-requests/:id/decision` | **404** |
| `GET /manager/location-requests?status=` | **404** |
| `PATCH /manager/location-requests/:id/decision` | **404** |

All 6 dashboard tiles show "—"; Team Attendance, Daily Logs, and Leave Requests pages can only show errors.

**Root cause:** the system was built "data layer first" — 18 Mongoose models and near-complete services exist, but the route/controller layer was never wired for the manager portal.

---

## 2. Errors in the Previously Proposed Plan (and corrections)

| # | Claim in proposed plan | Reality | Correction |
|---|---|---|---|
| 1 | "`authenticate` middleware restricts access to users with the `manager` role" | `authenticate.js` **only verifies the JWT** — there is no role check anywhere in the API | Create a new `authorize()` middleware first (Phase 0), otherwise **any employee can call every manager route** |
| 2 | No mention of response shapes | Frontend reads exact keys: `data.attendance`, `data.requests`, `data.logs` | Response contracts are pinned in Phase 3 — deviations render empty pages even with HTTP 200 |
| 3 | No permission gating mentioned | Device/location request pages explicitly handle HTTP **403**; a `ManagerPermission` model exists but is never consulted | Add permission checks to the 4 request endpoints (Phase 2) |

---

## 3. Phase 0 — Authorization Middleware (prerequisite, blocks everything)

**New file:** `apps/api/src/middleware/authorize.js`

```js
const { forbidden } = require('../utils/response');

const authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : forbidden(res, 'Access denied.');

module.exports = authorize;
```

**Apply to:**
- ALL new manager routes → `authenticate, authorize('manager')`
- **Bonus fix:** `admin.routes.js` is currently 100% public (`/admin/dashboard` needs no login at all!) → add `authenticate, authorize('admin')`

---

## 4. Phase 1 — Routes

**File:** `apps/api/src/routes/manager.routes.js`

Exact paths the frontend already calls — **nothing renamed**:

| Method | Path | Guards | Notes |
|---|---|---|---|
| GET | `/dashboard` | authenticate + authorize('manager') | 6 tiles + 2 pending counters |
| GET | `/team/attendance?date=YYYY-MM-DD` | same | defaults to today (IST) |
| GET | `/team/leave-requests?status=` | same | default `pending` |
| POST | `/team/leave/:id/decision` | same | body: `{ decision, decisionNote }` |
| GET | `/team/daily-logs?date=YYYY-MM-DD` | same | defaults to today |
| GET | `/device-requests?status=` | + ManagerPermission | 403 if flag off |
| PATCH | `/device-requests/:id/decision` | + ManagerPermission | body: `{ action, decisionNote, approvedUntil? }` |
| GET | `/location-requests?status=` | + ManagerPermission | 403 if flag off |
| PATCH | `/location-requests/:id/decision` | + ManagerPermission | body: `{ action, decisionNote }` |

---

## 5. Phase 2 — Shared Controller Helpers

Every endpoint needs the same context, so build 3 helpers in `manager.controller.js`:

1. **`getManagedTeam(userId)`**
   `Team.findOne({ leadUserId: userId })`
   → If none: return an empty context (dashboards show zeros, lists return `[]` — **never a 500**).

2. **`getTeamMemberIds(teamId)`**
   `User.find({ teamId }).distinct('_id')`
   → **Every** query filters by `{ userId: { $in: memberIds } }` — this is the team scoping that prevents a manager from seeing other teams' data.

3. **Permission check**
   `ManagerPermission.findOne({ managerId: userId })`
   → Guard the 4 device/location endpoints; return **403** if the relevant flag is false (frontend already renders this case).
   → Verify flag names in `models/ManagerPermission.js`; add `canManageDeviceRequests` / `canManageLocationRequests` if missing.
   → No permission doc = default **allow** (matches current behavior, non-breaking).

---

## 6. Phase 3 — Endpoint Specifications & Response Contracts

### 6.1 `getDashboard` → `GET /manager/dashboard`

```json
{ "success": true, "data": {
    "totalMembers": 5,
    "checkedInToday": 3,
    "onLeaveToday": 1,
    "missingDailyLogs": 1,
    "pendingLeaveRequests": 2,
    "pendingDeviceRequests": 1,
    "pendingLocationRequests": 0
} }
```

Queries:
- Members: `User.countDocuments({ teamId })`
- Checked in: `Attendance.countDocuments({ userId: { $in: ids }, date: today, checkInTime: { $ne: null } })`
- On leave: approved `LeaveRequest` where `startDate <= today <= endDate`
- Missing logs: checked-in members minus `DailyLog.distinct('userId', { logDate: today })`
- Pending: `countDocuments({ userId: { $in: ids }, status: 'pending' })` on each request model

### 6.2 `getTeamAttendance` → `GET /manager/team/attendance?date=`

`Attendance.find({ userId: { $in: ids }, date })` + populate user `name` → sorted by name.

```json
{ "success": true, "data": { "attendance": [ { "_id", "userId": { "name", "designation" }, "date", "checkInTime", "checkOutTime", "status" } ] } }
```

### 6.3 `getTeamLeaveRequests` → `GET /manager/team/leave-requests?status=`

Filter by `status` param (default `pending`), populate `userId name` + `leaveTypeId name/code`, sort `createdAt: -1`.

```json
{ "success": true, "data": { "requests": [ ... ] } }
```

### 6.4 `handleLeaveDecision` → `POST /manager/team/leave/:id/decision`

**Delegates entirely to the existing `leave.service.js` → `makeLeaveDecision()`**, which already implements:
- pending-only check, self-approval block (403)
- balance deduction on approve
- employee notification + audit log entry

Controller responsibilities:
- Pass `{ leaveId, decidedBy: req.user, decision, decisionNote }`
- **Add team scoping**: the leave's `userId` must be in the manager's member list (or reject with 403)
- Map service errors (`err.statusCode`) to responses
- Validate `decision ∈ {approved, rejected}` → 400 otherwise

### 6.5 `getTeamDailyLogs` → `GET /manager/team/daily-logs?date=`

`DailyLog.find({ userId: { $in: ids }, logDate: date })` + populate names, sort desc.

```json
{ "success": true, "data": { "logs": [ ... ] } }
```

> ⚠️ **Blocker fix required first:** `dailyLog.service.js` line 6 requires `./upload.service` which **does not exist**. Create a minimal `upload.service.js` (or remove the require) before any route touches this file, or the API crashes on boot.

### 6.6 Device & Location Requests — `GET` + `PATCH` (4 endpoints)

GET: query `{ userId: { $in: ids } }` + optional status filter → `{ data: { requests: [...] } }`

PATCH decision logic:
1. Validate `action ∈ {approve, reject}` (frontend sends exactly these strings) → 400 otherwise
2. On `approve` with `approvedUntil` → set `temporaryUntil` / `validUntil` (**verify exact field names in `DeviceRequest.js` / `LocationRequest.js` first**)
3. **On approve, also create/activate the target record** (`RegisteredDevice` / `EmployeeLocation`) — otherwise approval changes nothing at check-in time
4. `writeAuditLog()` + `createNotification()` to the employee (both services already exist)
5. Keep request + device/location record consistent (Mongo transaction, or sequential writes with careful failure handling)

---

## 7. Phase 4 — Seed Data (⚠️ mandatory for testing)

The current seeds (`seedManager.js`, `seedEmployee.js`) do **not** link the Test Manager and Test Employee to any `Team`. Even with perfect APIs, every page returns empty lists.

**Add `apps/api/src/scripts/seedTeam.js`** (or extend the existing seeds):
1. Create team **"Test Team"** with `leadUserId` = Test Manager
2. Set `teamId` on Test Employee (and the manager)
3. Seed 2–3 days of sample `Attendance` + 1 pending `DeviceRequest` + 1 pending `LeaveRequest` + 1 `DailyLog`, so the dashboard shows non-zero numbers immediately

**Run:** `node apps/api/src/scripts/seedTeam.js`

---

## 8. Phase 5 — Verification Checklist

- [ ] `npm run dev:api` boots with **no errors** (proves upload.service fix)
- [ ] Login as Test Manager (seeded `Manager@1234`)
- [ ] Dashboard tiles show **real counts** (not "—"), matching seeded data
- [ ] Team Attendance / Daily Logs pages list the Test Employee for the seeded dates
- [ ] Leave Requests page shows the pending seed request; **approve it** → balance deducted, employee notified, audit log written
- [ ] Device Requests: approve with "approve until" date → `RegisteredDevice` created with `temporaryUntil`; employee portal now shows "Temporary Access"
- [ ] Location Requests: same pattern → `EmployeeLocation` created
- [ ] **Negative tests:** employee JWT on `/manager/*` → **403**; manager without permission flag on device endpoints → **403**; manager querying a non-member's leave id → **403/404**
- [ ] Admin portal unaffected; `/api/admin/dashboard` now requires admin login

---

## 9. Effort Estimate

| Phase | Work | Time |
|---|---|---|
| 0 | authorize middleware + guard admin routes | 30 min |
| 1 | routes file | 20 min |
| 2 | helpers + permission check | 45 min |
| 3 | 9 endpoints | 3–4 h |
| 4 | seed script | 30 min |
| 5 | verification | 45 min |
| **Total** | | **~1 day** |

---

## 10. Out of Scope (noted for a follow-up pass)

Same class of verified bugs elsewhere — worth fixing in the same sitting or right after:

1. `employee.controller.js:41` — counts `read: false` but the Notification schema field is `isRead` → unread badge is **always 0**
2. `employee.controller.js:46` — reads `activeMethodSetting.methodType` but the schema field is `activeMethod` → attendance method **always falls back to `qr_code`**
3. `getTodayDateString()` uses UTC — check-ins between 00:00–05:30 IST land on yesterday's record
4. Check-in never saves `lat/lng/method/deviceId` as evidence, and QR value is never validated against the expected code
5. `Attendance` lacks a unique `{userId, date}` index → double check-in race possible
