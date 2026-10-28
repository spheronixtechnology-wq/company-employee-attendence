# Frappe HRMS 5-Minute Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Spheronix integration gateway safe for unattended 5-minute polling by Frappe HRMS: audience versioning, feed correctness fixes, a scope-aware sync-health API, admin UI for health/audience/poll interval, and a corrected Frappe connector contract.

**Architecture:** Backend changes stay inside the existing integration modules (`IntegrationCredential` model, `integrationCredential.service.js`, `integrationFeed.controller.js`, `adminIntegration.controller.js`, `requireStepUp.js`). Health evaluation is split into a pure evaluator (unit-tested) and a thin Mongo stats reader. The admin UI extends `IntegrationsPage.jsx`. Frappe-side behaviour is delivered as documentation only.

**Tech Stack:** Node/Express, Mongoose, Jest + supertest + mongodb-memory-server replset (`tests/helpers/dbMemoryReplSet.js`), React + Vite + Tailwind (admin).

**Spec:** RFC-INT-003 Revision 3 (provided in chat 2026-10-26), as amended by the Rev 3 review. Every amendment is pinned in Global Constraints below; where they differ from the RFC text, the constraints win.

## Global Constraints

- `audienceVersion`: Number, default 1, min 1. `audienceChangedAt`: Date, default `Date.now`. `expectedPollMinutes`: Number, default 5, min 1, max 1440.
- `audienceVersion` is incremented **only on expansion**: scope `restricted → all`, or any employee ID added to a restricted list. Pure removals update `allowedEmployees` and `audienceChangedAt` but do not increment.
- Rotation (normal and compromised) copies `audienceVersion`, `audienceChangedAt`, `expectedPollMinutes` to the new key.
- Audience update is rejected with `409 ROTATION_IN_PROGRESS` while the key has a non-null `rotationLock.lockedAt` or `rotationPendingKeyId`; `404` if the key is missing; `409 KEY_NOT_ACTIVE` if revoked.
- Restricted audience requires `allowedEmployees.length > 0` and every ID must match `{ isActive: true, deletedAt: null }`; otherwise `400 INVALID_EMPLOYEE_IDS` (same code as create).
- Step-up operation name: `integration_key:update_audience`; requires `targetKeyId`; body pre-validated before the grant is consumed.
- Watermark validation order: `WATERMARK_FUTURE` (> now + 5 min) first, then `WATERMARK_TOO_RECENT` (> now − 10 s). Only applies to the initial (cursor-less) page.
- `/ping` adds `audienceVersion`, `audienceChangedAt`, `expectedPollMinutes`, `serverTime` (ISO string).
- Feed routes for health: `/api/integrations/v1/employees` ← `employees:read`, `/api/integrations/v1/attendance` ← `attendance-daily:read`, `/api/integrations/v1/attendance-events` ← `attendance-events:read`. `/ping` is never counted.
- Health states (exact strings): `revoked`, `expired`, `not_verified`, `error`, `stale`, `delayed`, `healthy`. Severity for the overall roll-up: `error > stale > delayed > healthy`.
- Feed rules: latest attempt 401/403 → `error`; latest **two** attempts both non-200 and non-429 → `error`; freshness > 3 × poll → `stale`; latest attempt 429 or any single other failure, or freshness > 2 × poll → `delayed`; else `healthy`. No successful pull ever and key age > 3 × poll → `stale`.
- `not_verified`: key age ≤ 3 × poll minutes and zero requests on any required feed.
- Request log index: `{ keyId: 1, route: 1, createdAt: -1 }`.
- Admin health refresh: every 60 s, paused while `document.hidden`.

## Review Focus

1. Existing feed tests pass `watermark=new Date()` — after `WATERMARK_TOO_RECENT` they must be moved to backdated data, not deleted (Task 2).
2. Audience update on a revoked key or one mid-rotation must not change anything (Task 3).
3. Restricted audience containing a soft-deleted user ID must be rejected even though `isActive` is still true (Task 3).
4. A key older than 15 min that has never pulled must show `stale`, not `not_verified` or `healthy` (Task 4).
5. A key that last succeeded hours ago must still report a real `lastSuccessfulPullAt` (not `null`) even though its recent attempts all failed (Task 4).

---

### Task 1: Credential fields, log index, rotation inheritance

**Files:**
- Modify: `apps/api/src/models/IntegrationCredential.js` (add 3 fields after `allowedEmployees`)
- Modify: `apps/api/src/models/IntegrationRequestLog.js:42` (add compound index)
- Modify: `apps/api/src/services/integrationCredential.service.js` — `generateCredential` (accept new fields), both `generateCredential` calls inside `rotateCredential` (~L398 compromised, ~L470 normal)
- Test: `apps/api/tests/integration/keyRotation.api.test.js`

**Interfaces:**
- Produces: `generateCredential({ ..., audienceVersion = 1, audienceChangedAt = new Date(), expectedPollMinutes = 5 })`; credential documents carry the three fields.

- [ ] **Step 1: Write failing tests** in `keyRotation.api.test.js`:
  - `it('normal rotation preserves audienceVersion, audienceChangedAt and expectedPollMinutes')` — set old key to `{ audienceVersion: 4, audienceChangedAt: <fixed date>, expectedPollMinutes: 15 }` via `IntegrationCredential.updateOne`, rotate through the existing route, then `expect(newCred.audienceVersion).toBe(4)`, `expect(newCred.audienceChangedAt.toISOString()).toBe(<fixed>)`, `expect(newCred.expectedPollMinutes).toBe(15)`.
  - Same test for `compromised: true` rotation.
  - `it('new key defaults to audienceVersion 1 and expectedPollMinutes 5')`.
- [ ] **Step 2: Run** `cd apps/api && npx jest tests/integration/keyRotation.api.test.js` — Expected: the 3 new tests FAIL.
- [ ] **Step 3: Implement** the schema fields, the index, the new `generateCredential` params, and pass `lockedOldKey.audienceVersion || 1`, `lockedOldKey.audienceChangedAt || lockedOldKey.createdAt`, `lockedOldKey.expectedPollMinutes || 5` from both rotation paths.
- [ ] **Step 4: Run** the same command — Expected: all PASS.
- [ ] **Step 5: Commit** `feat(api): audience version fields and rotation inheritance`

---

### Task 2: Feed fixes and ping fields

**Files:**
- Modify: `apps/api/src/controllers/integrationFeed.controller.js` — `resolveWatermarkAndBounds` (~L62), `getEmployeesFeed` select (~L341)
- Modify: `apps/api/src/routes/integration.routes.js:64` (`/ping`)
- Create: `apps/api/tests/helpers/backdate.js`
- Test: `apps/api/tests/integration/stage2GatewayFeed.api.test.js`, `apps/api/tests/integration/integrationGateway.api.test.js`

**Interfaces:**
- Produces: `backdate(Model, ids: ObjectId[], msAgo: number): Promise<void>` — sets `updatedAt` (and `createdAt`) via `Model.collection.updateMany` so Mongoose timestamps don't overwrite it.
- Produces: error code `WATERMARK_TOO_RECENT`; ping `data.serverTime`, `data.audienceVersion`, `data.audienceChangedAt`, `data.expectedPollMinutes`.

- [ ] **Step 1: Migrate existing tests first.** Every test that seeds records then queries with `watermark=new Date()` must `backdate(...)` the records by 5 minutes and use `watermark = new Date(Date.now() - 60_000)`. Run `npx jest tests/integration/stage2GatewayFeed.api.test.js` — Expected: still PASS on current code.
- [ ] **Step 2: Write failing tests:**
  - `rejects watermark within 10s of now with WATERMARK_TOO_RECENT` — `watermark = now − 2s` → 400, `body.code === 'WATERMARK_TOO_RECENT'`.
  - `rejects watermark more than 5 minutes ahead with WATERMARK_FUTURE` — `now + 10 min` → 400, `WATERMARK_FUTURE`.
  - `continuation page is not subject to TOO_RECENT` — page 1 with `watermark = now − 11s`, wait not needed; request page 2 with the cursor immediately → 200.
  - `emits soft-deleted employee with deletedAt` — create user, set `deletedAt`, backdate → `/employees` row has `deletedAt` equal to the stored ISO value.
  - `ping returns serverTime, audienceVersion, audienceChangedAt, expectedPollMinutes` (in `integrationGateway.api.test.js`) — `Math.abs(Date.parse(serverTime) - Date.now()) < 5000`, `audienceVersion === 1`, `expectedPollMinutes === 5`.
- [ ] **Step 3: Run** — Expected: new tests FAIL.
- [ ] **Step 4: Implement:** reorder checks per Global Constraints with `MIN_SAFE_WATERMARK_BUFFER_MS = 10 * 1000`; add `deletedAt` to the employees projection; add the four ping fields.
- [ ] **Step 5: Run** `npx jest tests/integration` — Expected: all PASS.
- [ ] **Step 6: Commit** `feat(api): watermark recency guard, deletedAt in employee feed, ping serverTime`

---

### Task 3: Audience update endpoint

**Files:**
- Modify: `apps/api/src/services/integrationCredential.service.js` — add `updateAudience`, export it
- Create: `apps/api/src/utils/audienceValidation.js` — shared validator extracted from `requireStepUp.js` create branch (~L77-L124)
- Modify: `apps/api/src/middleware/requireStepUp.js` — use the shared validator for `create` and new `update_audience` branch
- Modify: `apps/api/src/controllers/adminIntegration.controller.js` — `validOperations` (L43) and target-required list (L56) gain `integration_key:update_audience`; add `updateKeyAudience`
- Modify: `apps/api/src/routes/admin.routes.js:78` — `router.put('/integrations/keys/:keyId/audience', isAdmin, requireStepUp('integration_key:update_audience'), adminIntegrationController.updateKeyAudience)`
- Test: create `apps/api/tests/integration/audienceUpdate.api.test.js`

**Interfaces:**
- Produces: `validateAudienceInput({ employeeScope, allowedEmployees }): Promise<{ ok: true, scope, uniqueIds: string[] } | { ok: false, status: 400, code, message }>` — checks scope enum, non-empty, 24-hex format, and `User.countDocuments({ _id: {$in}, isActive: true, deletedAt: null }) === uniqueIds.length`.
- Produces: `updateAudience({ keyId, employeeScope, allowedEmployees, adminUser }): Promise<{ credential, expanded: boolean }>` — throws errors with `statusCode` + `code` per Global Constraints; atomic `findOneAndUpdate` filtered on `{ keyId, status: 'active', rotationPendingKeyId: null, 'rotationLock.lockedAt': null }` (use `$or` for missing/null lock as `rotateCredential` does); `$inc: { audienceVersion: 1 }` only when `expanded`; writes audit log `INTEGRATION_KEY_AUDIENCE_UPDATED` with `{ keyId, from, to, expanded }`. If the filtered update matches nothing, re-read the key to pick 404 / `KEY_NOT_ACTIVE` / `ROTATION_IN_PROGRESS`.
- Response: `200 { success: true, data: { keyId, employeeScope, allowedEmployeeCount, audienceVersion, audienceChangedAt, expanded } }`.

- [ ] **Step 1: Write failing tests** (step-up token obtained as in `stepUpAuth.api.test.js:188`, with `operation: 'integration_key:update_audience', targetKeyId`):
  - `adding an employee increments audienceVersion and sets audienceChangedAt` — 1 → 2, `expanded: true`.
  - `restricted → all increments audienceVersion`.
  - `removing an employee does not increment audienceVersion` — stays 1, `expanded: false`, `allowedEmployees` shrinks, `audienceChangedAt` advances.
  - `rejects restricted with empty list` → 400 `INVALID_AUDIENCE`, grant not consumed (same token works on a valid retry).
  - `rejects a soft-deleted employee id` → 400 `INVALID_EMPLOYEE_IDS`.
  - `rejects revoked key` → 409 `KEY_NOT_ACTIVE`.
  - `rejects while rotation pending` — set `rotationPendingKeyId: 'x'` → 409 `ROTATION_IN_PROGRESS`, `audienceVersion` unchanged.
  - `rejects step-up token issued for another key` → 403 `STEP_UP_TARGET_MISMATCH`.
  - `feed reflects new audience on next request` — after update, `/employees` with that key returns the added user.
- [ ] **Step 2: Run** `npx jest tests/integration/audienceUpdate.api.test.js` — Expected: FAIL (404 route).
- [ ] **Step 3: Implement** the validator, refactor create to use it, then service, controller, route.
- [ ] **Step 4: Run** `npx jest tests/integration` — Expected: all PASS, including the untouched `stepUpAuth` create tests.
- [ ] **Step 5: Commit** `feat(api): step-up protected integration key audience update`

---

### Task 4: Sync-health API and poll interval setting

**Files:**
- Create: `apps/api/src/services/syncHealth.service.js`
- Modify: `apps/api/src/controllers/adminIntegration.controller.js` — add `getSyncHealth`, `updateKeySettings`
- Modify: `apps/api/src/routes/admin.routes.js` — `router.get('/integrations/frappe-hrms/keys/sync-health', isAdmin, ...getSyncHealth)` and `router.patch('/integrations/keys/:keyId/settings', isAdmin, ...updateKeySettings)`
- Test: create `apps/api/tests/unit/syncHealth.test.js`, `apps/api/tests/integration/syncHealth.api.test.js`

**Interfaces:**
- Produces: `FEED_ROUTES` — `{ employees: { route: '/api/integrations/v1/employees', scope: 'employees:read' }, attendance: {...'attendance-daily:read'}, attendanceEvents: {...'attendance-events:read'} }`.
- Produces: `getFeedStats(keyId: string, routes: string[], now: Date): Promise<Record<route, { recent: {status, createdAt}[] /* newest first, max 5 */, lastSuccessfulPullAt: Date|null, pullsLastHour: number }>>` — per route: `find({keyId, route}).sort({createdAt:-1}).limit(5)`, `findOne({keyId, route, status: 200}).sort({createdAt:-1})`, `countDocuments({keyId, route, createdAt: {$gte: now-1h}})`. No `$push` aggregation.
- Produces: `evaluateSyncHealth({ credential, stats, now }): { overall: State, expectedPollMinutes, feeds: Record<feedName, { state, lastAttemptAt, lastAttemptStatus, lastSuccessfulPullAt, freshnessMinutes, pullsLastHour, lastError: {status, at}|null }> }` — pure; only feeds whose scope is in `credential.scopes`; rules exactly as Global Constraints.
- Produces: `GET .../keys/sync-health` → `{ success: true, data: { [keyId]: evaluateSyncHealth(...) } }` for every key (revoked/expired short-circuit without querying logs).
- Produces: `PATCH /integrations/keys/:keyId/settings` body `{ expectedPollMinutes }` integer 1–1440 → 200 with updated value; 400 `INVALID_POLL_MINUTES` otherwise; audit `INTEGRATION_KEY_SETTINGS_UPDATED`. No step-up (non-security setting).

- [ ] **Step 1: Write failing unit tests** in `syncHealth.test.js` against `evaluateSyncHealth` with a fixed `now`, poll = 5:
  - all 3 feeds 200 at now−2m → `healthy`.
  - one feed last success now−12m → `delayed`; now−16m → `stale`.
  - latest 429 → `delayed`; latest 500 once (previous 200) → `delayed`; latest two 500 → `error`; latest 401 → `error`.
  - key scoped only `employees:read` with no logs on other routes → only `employees` in `feeds`, overall from that feed alone.
  - key created 5m ago, no logs → `not_verified`; created 20m ago, no logs → `stale`.
  - recent attempts all failing but `lastSuccessfulPullAt` 3h ago → `freshnessMinutes === 180`, `lastSuccessfulPullAt` not null.
  - `status: 'revoked'` → `revoked`; `expiresAt < now` → `expired`.
  - `expectedPollMinutes: 15` scales thresholds (now−25m → `healthy`).
- [ ] **Step 2: Run** `npx jest tests/unit/syncHealth.test.js` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `syncHealth.service.js`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Write failing integration tests** in `syncHealth.api.test.js`: seed `IntegrationRequestLog` rows directly; assert `/ping` rows don't make a key healthy; assert the endpoint returns one entry per key; assert `PATCH settings` with 0, 1441, `'abc'` → 400 and with 15 → 200 and health thresholds use 15.
- [ ] **Step 6: Implement** controllers and routes; **Run** `npx jest` (whole suite) — Expected: all PASS.
- [ ] **Step 7: Commit** `feat(api): scope-aware sync health and poll interval setting`

---

### Task 5: Admin UI — health column, audience modal, poll interval

**Files:**
- Modify: `apps/admin/src/pages/IntegrationsPage.jsx`
- Create: `apps/admin/src/components/integrations/EmployeeAudiencePicker.jsx` — extracted from `CreateKeyModal` (~L665-L1000: scope toggle, search, checkbox list, `/admin/employees` fetch)
- Create: `apps/admin/src/components/integrations/SyncHealthBadge.jsx`

**Interfaces:**
- Consumes: `GET /admin/integrations/frappe-hrms/keys/sync-health`, `PUT /admin/integrations/keys/:keyId/audience` (header `X-Step-Up-Token`), `PATCH /admin/integrations/keys/:keyId/settings`.
- Produces: `<EmployeeAudiencePicker value={{ employeeScope, allowedEmployees }} onChange={fn} />`; `<SyncHealthBadge health={evaluateSyncHealth result} />`.

- [ ] **Step 1:** Extract `EmployeeAudiencePicker`; `CreateKeyModal` uses it with no behaviour change. Run `cd apps/admin && npm run build` — Expected: build succeeds; manually confirm create-key restricted flow still works.
- [ ] **Step 2:** Add `SyncHealthBadge` and a "Sync Health" column after "Status" (L303). Label format: `Healthy (2m ago)`, `Delayed (11m ago)`, `Stale (35m ago)`, `Error (500)`, `Not yet verified`, `Revoked`, `Expired`. Hover/click shows per-feed rows (state, last attempt + status, last success, pulls last hour). Fetch on mount and every 60 s via `setInterval`, skipping ticks while `document.hidden`; clear on unmount.
- [ ] **Step 3:** Add "Edit audience" action → modal with the picker → `pendingAction = { type: 'audience', payload }` → existing `StepUpModal` with `operation="integration_key:update_audience"` and `targetKeyId` → `executeUpdateAudience`. Show `expanded: true` result as "Frappe will run a backfill on its next cycle". Disable the action while the key has a pending rotation. Map 409 `ROTATION_IN_PROGRESS` / 400 `INVALID_EMPLOYEE_IDS` to inline errors.
- [ ] **Step 4:** Add a poll-interval number input (1–1440) in the activity drawer or row actions → `PATCH settings`, then refetch health.
- [ ] **Step 5:** `npm run build` — Expected: success. Run admin + api locally and verify: badge renders for a key with seeded logs; audience edit round-trips with step-up; poll interval change shifts a `delayed` key to `healthy`.
- [ ] **Step 6: Commit** `feat(admin): integration sync health, audience editing, poll interval`

---

### Task 6: Frappe connector contract in the integration guide

**Files:**
- Modify: `docs/spheronix_api_external_integration_guide.md`

- [ ] **Step 1:** Add a "5-minute unattended sync" section containing, as reference Python:
  - Checkpoint DocType keyed by `provider = "spheronix_hrms"` + `feed`, fields `committed_watermark`, `in_progress_watermark`, `in_progress_cursor`, `acknowledged_audience_version`; two-phase advance only after `nextCursor is None` and DB commit; resume from `in_progress_cursor`, or on `INVALID_CURSOR_SIGNATURE` restart from `committed_watermark − 2 min`.
  - Lock: `lock = frappe.cache().lock("spheronix_sync_lock", timeout=900)`, `lock.acquire(blocking=False)`, and **`lock.extend(900, replace_ttl=True)` before every page** (not `set_value`).
  - Watermark from ping: `frappe.utils.get_datetime(server_time.replace("Z", "+00:00")) - timedelta(seconds=30)`; same watermark for all feeds; incremental `updated_since = committed_watermark − 2 min`.
  - Backfill when `audienceVersion > acknowledged_audience_version`: all scoped feeds in order employees → attendance → attendance-events, no `updated_since`; acknowledge only after all finish.
  - Punch upsert: unique `spheronix_event_id`; convert `eventTime` to system timezone (`frappe.utils.convert_utc_to_system_timezone`) before comparing; on change load the doc and `doc.save()` (no `db.set_value`); catch `frappe.DuplicateEntryError` on insert.
  - Semantics: `deletedAt != null` → `Left`; absence from feed never means Left; page of `limit` attendance docs yields up to `2 × limit` events.
  - Known limitation: if `checkOutTime` is cleared, the existing OUT punch in Frappe is not removed.
  - Budget: normal cycle = 4 requests (ping + 3 feeds) ≈ 48/hour vs 300/min limit; recommend `limit=250` for backfills.
  - Health states table and what each means for an operator.
- [ ] **Step 2:** Re-read the section against Global Constraints; confirm every error code it names exists in the API (`WATERMARK_TOO_RECENT`, `WATERMARK_FUTURE`, `INVALID_CURSOR_SIGNATURE`, `CURSOR_CONTEXT_MISMATCH`).
- [ ] **Step 3: Commit** `docs: Frappe 5-minute sync connector contract`

---

### Final verification

- [ ] `cd apps/api && npm test` — Expected: every suite PASS; record the actual suite/test counts in the PR description.
- [ ] `cd apps/admin && npm run build` — Expected: success.
