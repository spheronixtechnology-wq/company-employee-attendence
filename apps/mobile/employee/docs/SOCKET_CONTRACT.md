# Employee Mobile Socket.IO Contract Specification

**Version**: 1.0.0 (Frozen)  
**Target Client**: `apps/mobile/employee` (React Native / Android)  
**Authoritative Backend**: `apps/api` (Socket.IO v4 Server)  
**Socket Path**: `/socket.io`  
**Connection Options**: `{ withCredentials: true, transports: ['websocket', 'polling'], reconnectionAttempts: 10, reconnectionDelay: 1000 }`

---

## 1. Connection Topology & Lifecycle Architecture

Because mobile devices experience aggressive background execution limits and transient radio drops, the socket manager must handle explicit lifecycle states:

```
┌─────────────────────────┐
│     App In Foreground   │ ──► Socket CONNECTED ──► Real-time push processing
└────────────┬────────────┘
             │ App minimized / screen locked
             ▼
┌─────────────────────────┐
│     App In Background   │ ──► Keepalive via Foreground Service ──► Graceful fallback
└────────────┬────────────┘
             │ Network lost / OS sleep
             ▼
┌─────────────────────────┐
│     App Resumed / Awake │ ──► AppState 'active' ──► Auto-reconnect & fetchDashboard() sync
└─────────────────────────┘
```

---

## 2. Room Subscriptions

### 2.1 Guest Device Request Room
* **Event**: `join:device_request`
* **Direction**: Client $\rightarrow$ Server
* **Purpose**: Subscribes an unauthenticated or device-mismatched mobile client to real-time approval decisions.
* **Payload**: `requestId` (String, MongoDB ObjectId)
  ```javascript
  socket.emit('join:device_request', pendingReqId);
  ```

### 2.2 Authenticated Employee Room
* **Automatic**: Server attaches authenticated employee sockets to their `user:<userId>` room automatically upon connection handshake verification.

---

## 3. Server-to-Client Event Catalog

| Event Name | Source Trigger | Payload Schema | Mobile Client Action |
|---|---|---|---|
| `device:request_resolved` | Manager approves or rejects device replacement in Manager Portal | `{"action": "approve" \| "reject", "decisionNote": string}` | If approved: auto-logs in. If rejected: displays rejection banner with manager's decision note. |
| `checkout:initiate_scan` | Employee clicks "Check Out" on their desktop PC | `{"type": "checkout_prompt", "timestamp": number}` | Phone vibrates (`Vibration.vibrate(200)`) and auto-launches camera scanner overlay to scan the PC monitor. |
| `attendance:checked_out` | Check-out completes from mobile or PC screen scan | `{"attendance": object, "summary": object}` | Closes all open scanner/QR modals and opens `AttendanceReportModal`. Synchronizes dashboard state. |
| `attendance-setting:updated`| Manager toggles heartbeat monitoring or default punch method | `{"heartbeatMonitoringEnabled": boolean, "activeMethod": string}` | Immediate zero-latency optimistic update of dashboard state, timers, and banner notifications. |
| `attendance:heartbeat_warning` | Heartbeat signal lost for $>4$ minutes | `{"minutesMissing": number, "timeoutMinutes": number}` | Displays urgent warning banner to keep app open or check network connectivity. |
| `attendance:reactivated` | Manager approves session reactivation request | `{"attendanceId": string}` | Clears warning modal, resets presence monitoring counters, resumes live session. |
| `attendance:reactivation_rejected` | Manager rejects session reactivation | `{"reason": string}` | Closes warning modal, sets shift closed for today. |
| `attendance:update` | Any manual attendance update or administrative punch | `{}` | Re-fetches `/employee/dashboard` and `/employee/attendance/me`. |
| `notification:new` | New system or administrative notification | `{"title": string, "message": string}` | Shows in-app toast / banner notification and increments badge. |
| `leave:request_resolved` | Admin/Manager decides on leave request | `{"status": "approved" \| "rejected", "decisionNote": string}` | Shows approval toast and updates leave balance counters. |
| `location:request_resolved` | Manager decides on location override | `{"action": "approve" \| "reject"}` | Shows location permission banner and refreshes dashboard. |

---

## 4. Reconnection & Offline Recovery Protocol

1. **Background / Sleep Recovery**:
   When the mobile application transitions from `background` to `active` via `AppState.addEventListener('change')`:
   ```javascript
   if (nextAppState === 'active') {
     if (!socket.connected) {
       socket.connect();
     }
     // Always perform HTTP dashboard reconciliation on resume
     fetchDashboard();
     checkGeofenceSession();
   }
   ```
2. **Missing Ping Recovery**:
   If the network dropped during an active Alert 5 grace period, the client does not rely on missed socket events. It queries `GET /employee/attendance/geofence/session` immediately upon reconnection to synchronize the authoritative server grace timer.
