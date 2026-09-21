# Attendance State Machine & Workday Calculations Specification

**Version**: 1.0.0 (Frozen)  
**Target Client**: `apps/mobile/employee` (React Native / Android)  
**Authoritative Backend**: `apps/api` (Node.js / Mongoose)

---

## 1. Persistent Geofence Session State Machine

The geofence session tracks continuous out-of-bounds events. State is owned strictly by `apps/api/src/services/geofenceSession.service.js` and persisted in MongoDB (`GeofenceSession` and `GeofenceAlertEvent`).

```
                    ┌─────────────────────────┐
                    │      EMPLOYEE INSIDE    │
                    │   Distance <= Radius    │
                    └────────────┬────────────┘
                                 │ Leaves radius (> Radius + 15m)
                                 ▼
                    ┌─────────────────────────┐
                    │     SESSION ACTIVE      │ ◄─── Restored on app relaunch
                    │       Alert Level 1     │
                    └────────────┬────────────┘
                                 │ Every 30s ping, >= 60s elapsed
                                 ▼
                    ┌─────────────────────────┐
                    │  Alerts 2 ──► 3 ──► 4   │ (Audio chime on live escalation)
                    └────────────┬────────────┘
                                 │ >= 60s elapsed
                                 ▼
                    ┌─────────────────────────┐
                    │     Alert Level 5       │
                    │ 180s Server Grace Period│
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
        Employee returns inside          Countdown reaches 00:00
                 ▼                               ▼
      ┌────────────────────┐          ┌──────────────────────┐
      │   RETURNING        │          │ Backend Validates    │
      │ (1/3 ──► 2/3 ──►3/3│          │ Auto-Checkout        │
      └──────────┬─────────┘          └──────────┬───────────┘
                 │ 3 confirmed pings             │ Confirmed
                 ▼                               ▼
      ┌────────────────────┐          ┌──────────────────────┐
      │  SESSION RESOLVED  │          │ SESSION              │
      │ Alert UI cleared   │          │ AUTO_CHECKED_OUT     │
      └────────────────────┘          └──────────────────────┘
```

### 1.1 Spatial Hysteresis Zones
Given configured Office Location $(Lat_0, Lng_0)$ and Allowed Radius $R$ meters:
* **INSIDE**: $Distance \le R - 10\text{m}$.
* **OUTSIDE**: $Distance > R + 15\text{m}$.
* **BOUNDARY**: $R - 10\text{m} < Distance \le R + 15\text{m}$.
  * *Rule*: Boundary readings do **not** reset an active alert session, preventing threshold oscillation.
* **LOCATION_UNAVAILABLE**: GPS disabled or accuracy $> 100\text{m}$. Session remains `ACTIVE`; progression paused.

### 1.2 Progression Rules
* **Alert Progression**: Advanced by exactly **one level per processing event** when $\Delta t \ge 60\text{s}$. Never jumps or catches up multiple levels on delayed pings.
* **Alert 5 Grace Period**:
  * $T_{\text{grace\_ends}} = T_{\text{alert5}} + 180\text{s}$.
  * Client calculates remaining seconds: $\max(0, \lfloor (T_{\text{grace\_ends}} - Now) / 1000 \rfloor)$.
  * Refreshing or killing the app resumes from the exact remaining duration.
* **Auto-Checkout Revalidation**:
  * Client requests auto-checkout upon countdown completion.
  * Backend revalidates that the session is still active and employee is still outside before executing checkout.
* **Return Confirmation**: Requires **3 consecutive INSIDE samples** to transition `ACTIVE` $\rightarrow$ `RESOLVED`.
* **Manual Checkout**: If employee checks out manually, active session transitions to `CANCELLED`.

---

## 2. Server-Managed Device Binding State Machine

Controls hardware access and ensures accounts punch attendance exclusively from authorized devices.

```
                           ┌───────────────────┐
                           │      No Device    │
                           │   (statusType:    │
                           │      'none')      │
                           └─────────┬─────────┘
                                     │ Submit access request
                                     ▼
                           ┌───────────────────┐
                           │      PENDING      │
                           │ Awaiting manager  │
                           └─────────┬─────────┘
                                     │ Manager decides
                        ┌────────────┴────────────┐
             Approved as│                         │ Approved as
             permanent  ▼                         ▼ temporary
        ┌───────────────────┐               ┌───────────────────┐
        │      ACTIVE       │               │     TEMPORARY     │
        │  Trusted Device   │               │ Expiring at       │
        └─────────┬─────────┘               │ 'temporaryUntil'  │
                  │ Employee logs in on     └─────────┬─────────┘
                  │ new phone                         │ Expired
                  ▼                                   ▼
        ┌───────────────────┐               ┌───────────────────┐
        │  DEVICE_MISMATCH  │               │      LOCKED       │
        │ 403 / Access Denied│              │  Must re-request  │
        └───────────────────┘               └───────────────────┘
```

---

## 3. TimeChamp Productivity & Workday Calculations

Calculated identically across web and mobile using server timestamps.

### 3.1 Timing Invariants
* **Time Zone**: All day boundaries, lunch intervals, and shift caps evaluate in `Asia/Kolkata` (IST, UTC+5:30).
* **Shift End Cap**: Working hours cap strictly at `18:00:00 IST`.
  $$EndTime = \min(\text{checkOutTime} \text{ or } Now, \text{Date} + \text{"T18:00:00.000+05:30"})$$
* **Automatic Lunch Deduction**:
  $$LunchInterval = [13:00:00 \text{ IST}, 14:00:00 \text{ IST}]$$
  Automatically deducted from productive time.
* **Break Interval Union Algorithm**:
  All manual breaks $[Start_i, End_i]$ and $LunchInterval$ are merged into a unified set of non-overlapping intervals prior to calculating total break duration. This guarantees employees are never double-deducted if they take a break during the lunch hour.
* **Net Productive Work**:
  $$ActualWorkMinutes = \max(0, TotalDurationMinutes - TotalBreakMinutes)$$
* **Break Lockout**: Break controls are locked after `20:00:00 IST`.

---

## 4. Attendance Record Daily Status

| Status | Threshold Rule | Description |
|---|---|---|
| `present` | $ActualWorkHours \ge 8\text{ hours}$ | Full standard shift completed |
| `half_day`| $4\text{ hours} \le ActualWorkHours < 8\text{ hours}$ | Half-day shift credit |
| `incomplete` | $ActualWorkHours < 4\text{ hours}$ (or unclosed punch) | Incomplete shift |
| `absent` | No check-in recorded for scheduled work day | Full day absent |
| `leave` | Approved leave on current date | Excluded from absent tally |
| `manual_pending` | Manual attendance requested, awaiting manager | Temporarily pending |
