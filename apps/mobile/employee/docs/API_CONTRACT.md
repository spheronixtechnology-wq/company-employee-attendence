# Employee Mobile API Contract Specification

**Version**: 1.0.0 (Frozen)  
**Target Client**: `apps/mobile/employee` (React Native / Android)  
**Authoritative Backend**: `apps/api` (Node.js / Express / MongoDB)  
**Base URL**: `https://<api-domain>/api` (or `http://<lan-ip>:5000/api` in local dev)

---

## 1. Global Request & Response Specifications

### 1.1 Required Request Headers
Every authenticated request sent from the mobile client must provide:

| Header | Type | Description |
|---|---|---|
| `Authorization` | `Bearer <token>` or Cookie | JWT authentication credential (managed via Axios session) |
| `x-portal-role` | String | Fixed value: `employee` (enforced by backend role-routing) |
| `x-device-token` | String | Server-issued device token stored securely in `EncryptedSharedPreferences` |
| `x-device-fingerprint`| String | Device hardware fingerprint string |
| `Content-Type` | String | `application/json` (except `multipart/form-data` for doc uploads) |

### 1.2 Standard Success Envelope
```json
{
  "success": true,
  "message": "Human-readable confirmation message",
  "data": { ... }
}
```

### 1.3 Standard Error Envelope
```json
{
  "success": false,
  "message": "Clear user-facing error message",
  "data": { ... } // Optional error metadata
}
```

---

## 2. Authentication & Device Binding (`/api/auth/*`)

### 2.1 Login
* **Route**: `POST /auth/login`
* **Access**: Public
* **Payload**:
  ```json
  {
    "email": "employee@spheronixtechnology.in",
    "password": "SecurePassword123",
    "deviceFingerprint": "hw_fp_4f8b2c1a...",
    "deviceLabel": "Samsung Galaxy S23 · Android 14",
    "isMobile": true
  }
  ```
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "_id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "Jane Doe",
        "email": "employee@spheronixtechnology.in",
        "role": "employee",
        "teamId": { "_id": "64f1a...", "name": "Engineering" },
        "avatarUrl": "https://..."
      }
    }
  }
  ```
* **Device Mismatch Error (403 Forbidden)**:
  ```json
  {
    "success": false,
    "message": "This device is not authorized for attendance on this account.",
    "data": {
      "code": "DEVICE_MISMATCH",
      "registeredDevice": {
        "_id": "64f1b...",
        "deviceLabel": "OnePlus 11 · Android 13"
      },
      "requestedDevice": {
        "deviceFingerprint": "hw_fp_4f8b2c1a...",
        "deviceLabel": "Samsung Galaxy S23 · Android 14"
      }
    }
  }
  ```
  *Mobile Behavior*: Switch to replacement request view; connect to guest socket.

### 2.2 Device Access Request
* **Route**: `POST /auth/device-access-request`
* **Access**: Public (credentials verified)
* **Payload**:
  ```json
  {
    "email": "employee@spheronixtechnology.in",
    "password": "SecurePassword123",
    "reason": "Bought a new phone",
    "requestedDeviceLabel": "Samsung Galaxy S23 · Android 14",
    "deviceFingerprint": "hw_fp_4f8b2c1a..."
  }
  ```
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Device access request submitted successfully",
    "data": {
      "request": {
        "_id": "64f2c3d4e5f6a7b8c9d0e1f2",
        "status": "PENDING",
        "requestedDeviceLabel": "Samsung Galaxy S23 · Android 14"
      }
    }
  }
  ```
  *Mobile Behavior*: Join socket room `join:device_request` using `request._id`.

### 2.3 Profile Session
* **Route**: `GET /auth/me`
* **Access**: Authenticated

### 2.4 Logout
* **Route**: `POST /auth/logout`
* **Access**: Authenticated

---

## 3. Attendance Core Endpoints (`/api/employee/attendance/*`)

### 3.1 Dashboard Data
* **Route**: `GET /employee/dashboard`
* **Access**: Authenticated Employee
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "attendance": {
        "attendance": {
          "_id": "64f3d...",
          "checkInTime": "2026-09-21T09:05:00.000Z",
          "checkOutTime": null,
          "status": "present",
          "breaks": [],
          "totalDurationMinutes": 0,
          "completedBreakMinutes": 0,
          "actualWorkMinutes": 0
        },
        "activeBreak": null,
        "completedBreakMinutes": 0,
        "breaks": []
      },
      "teamName": "Mobile Development",
      "dailyLogSubmitted": false,
      "activeMethod": "biometric",
      "managerDefaultMethod": "biometric",
      "allowedMethods": ["biometric", "wifi_ip", "qr_code"],
      "heartbeatMonitoringEnabled": true,
      "deviceStatus": {
        "statusType": "active",
        "statusLabel": "Trusted Device",
        "device": { "_id": "64f1...", "deviceLabel": "Pixel 8 · Android 14" }
      },
      "pendingLeaves": 0,
      "unreadNotifications": 2,
      "leaveBalances": [
        { "leaveTypeId": { "name": "Casual Leave", "code": "CL" }, "allocated": 12, "used": 3 }
      ]
    }
  }
  ```

### 3.2 Check-In
* **Route**: `POST /employee/attendance/check-in`
* **Access**: Authenticated Employee
* **Payload**:
  ```json
  {
    "lat": 12.971598,
    "lng": 77.594562,
    "accuracy": 12.5,
    "timestamp": 1790010300000,
    "deviceFingerprint": "hw_fp_4f8b2c1a...",
    "checkInMethod": "biometric",
    "methodAttempts": [
      { "method": "biometric", "status": "failed", "reason": "SENSOR_CANCELLED" }
    ],
    "qrCodeValue": null,
    "biometricToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
* **Validation Failure Envelopes (400 Bad Request)**:
  - Outside Geofence: `"Outside Office Location — nearest office is 145m away."`
  - Wi-Fi Egress IP Mismatch: `"Unauthorized Network — You must be connected to the authorized office network (Office WiFi). Detected IP: 49.37.xxx.xxx."`
  - Invalid Office QR: `"Invalid or expired Office QR code. Please scan the current code on the office screen."`
  - Unregistered Mobile: `"Use Your Registered Mobile — this device is not authorized for attendance."`

### 3.3 Initiate Cross-Device Checkout (Desktop triggered)
* **Route**: `POST /employee/attendance/initiate-checkout`
* **Access**: Authenticated
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "token": "7a3f8c9b2e1d0f4a5b6c7d8e9f0a1b2c",
      "expiresInSeconds": 60
    }
  }
  ```
  *Side Effect*: Backend sends `checkout:initiate_scan` to the user's active mobile device.

### 3.4 Execute Check-Out
* **Route**: `POST /employee/attendance/check-out`
* **Access**: Authenticated
* **Payload**:
  ```json
  {
    "lat": 12.971598,
    "lng": 77.594562,
    "accuracy": 14.0,
    "timestamp": 1790042400000,
    "deviceFingerprint": "hw_fp_4f8b2c1a...",
    "token": "7a3f8c9b2e1d0f4a5b6c7d8e9f0a1b2c"
  }
  ```
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Checked out successfully",
    "data": {
      "attendance": { ... },
      "summary": {
        "checkInTime": "2026-09-21T09:05:00.000Z",
        "checkOutTime": "2026-09-21T18:02:00.000Z",
        "totalDurationMinutes": 537,
        "totalBreakMinutes": 60,
        "actualWorkMinutes": 477,
        "breaks": [ ... ],
        "dailyLog": { ... }
      }
    }
  }
  ```
  *Side Effect*: Backend broadcasts `attendance:checked_out` over Socket.IO.

### 3.5 Send Shift Attendance Report
* **Route**: `POST /employee/attendance/send-report`
* **Access**: Authenticated Employee

---

## 4. Persistent Geofence Session Endpoints

### 4.1 Restore Active Session
* **Route**: `GET /employee/attendance/geofence/session`
* **Access**: Authenticated Employee
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "hasActiveSession": true,
      "sessionId": "64f4e...",
      "currentAlertLevel": 3,
      "status": "ACTIVE",
      "outsideDurationSeconds": 185,
      "gracePeriodRemainingSeconds": 0,
      "graceExpired": false,
      "distance": 142,
      "radius": 100,
      "officeName": "Bengaluru HQ"
    }
  }
  ```

### 4.2 Presence Ping
* **Route**: `POST /employee/presence/ping`
* **Access**: Authenticated Employee
* **Payload**:
  ```json
  {
    "lat": 12.972950,
    "lng": 77.595420,
    "accuracy": 15.0
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "status": "ACTIVE",
      "geofenceStatus": "OUTSIDE",
      "currentAlertLevel": 4,
      "sessionId": "64f4e...",
      "sessionResolved": false,
      "distance": 158,
      "radius": 100,
      "gracePeriodRemainingSeconds": 0,
      "insideConfirmationCount": 0,
      "officeName": "Bengaluru HQ"
    }
  }
  ```

### 4.3 Out-of-Bounds Reason
* **Route**: `POST /employee/presence/reason`
* **Payload**: `{ "reason": "Client meeting at Coffee Day" }`

### 4.4 Geofence Auto-Checkout (Backend Revalidation)
* **Route**: `POST /employee/attendance/geofence/auto-checkout`
* **Payload**: `{ "sessionId": "64f4e..." }`
* **Success (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "autoCheckedOut": true,
      "attendanceId": "64f3d...",
      "sessionId": "64f4e..."
    }
  }
  ```

---

## 5. Subsystems API Contracts

### 5.1 Breaks (`/employee/break/*`)
* **Start Break**: `POST /employee/break/start` $\rightarrow$ `{ "breakType": "Tea/Coffee" }`
* **End Break**: `POST /employee/break/end` $\rightarrow$ `{}`

### 5.2 Daily Work Log (`/employee/daily-log/*`)
* **Get My Logs**: `GET /employee/daily-log/me` $\rightarrow$ `{ logs: [...], streak: 5 }`
* **Submit Log Document**: `POST /employee/daily-log/me` (Multipart `multipart/form-data`)
  - Form field: `document` (File up to 1MB)

### 5.3 Overtime Module (`/employee/overtime/*`)
* **Stage 1 Permission Request**: `POST /employee/overtime/request`  
  Payload: `{ "date": "2026-09-21", "requestedStartTime": "2026-09-21T18:30:00.000Z", "requestedEndTime": "2026-09-21T20:30:00.000Z", "reason": "Critical release deploy" }`
* **Get Overtime Status**: `GET /employee/overtime/me`
* **Start Overtime Session**: `POST /employee/overtime/:id/start`
* **Stage 2 Work Details**: `POST /employee/overtime/:id/end` $\rightarrow$ `{ "workDetails": "Deployed API patch..." }`

### 5.4 Leaves (`/employee/leave/*`)
* `GET /employee/leave/types`
* `GET /employee/leave/balance`
* `GET /employee/leave/requests/me`
* `POST /employee/leave/apply` $\rightarrow$ `{ "leaveTypeId": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD", "reason": "..." }`

---

## 6. Biometric Token Contract Resolution (Phase 0 Decision)

### 6.1 Backend Invariant
The check-in handler requires a JWT `biometricToken`:
- Must be signed with `JWT_SECRET`.
- Must contain `{ userId, purpose: 'attendance_biometric', jti: '<uuid>' }`.
- Valid for 120 seconds.
- Single-use replay protection (consumed `jti` is cached in memory until expiration).

### 6.2 Mobile Android Strategy
1. The mobile client authenticates the user via Android `BiometricPrompt`.
2. Upon user sensor confirmation, mobile invokes a dedicated mobile verification request to the server with device-bound signature / verified device token.
3. The server validates that the request originated from the active enrolled registered device and issues the signed single-use `biometricToken`.
4. Mobile immediately passes this `biometricToken` in the payload of `POST /employee/attendance/check-in`.
