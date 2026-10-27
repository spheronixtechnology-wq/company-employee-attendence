# Spheronix Attendance Gateway — External Integration Guide & Data Extraction Plan
**Document Version:** 4.0.0  
**Target Systems:** Frappe HRMS, External ERP, Data Warehouses, Custom ETL Pipelines  
**Base URL:** `http://localhost:5000/api/integrations/v1` (or your configured production domain)

---

## 1. Authentication & Security Contract

All requests to the Spheronix Integration Gateway authenticate via **HTTP Bearer Tokens** carrying an HMAC-SHA256 hashed API key.

### Active API Key Credentials
* **Raw Integration Key:** `shk_live_05df7a0121040a35_d1dfebcbb0b530c771c171e4c2edf26addffcaf70ecafd620112b6e90a0c4e0b`
* **Key ID (Public Prefix):** `05df7a0121040a35`
* **Environment:** `live`
* **Status:** `active`
* **Valid Until:** `2027-04-22T12:00:23.694Z` (180 days)
* **Authorized Scopes:**
  * `employees:read`
  * `attendance-daily:read`
  * `attendance-events:read`
  * `attendance-history:read`

### Required HTTP Headers
Every request from the external system must include:
```http
Authorization: Bearer shk_live_05df7a0121040a35_d1dfebcbb0b530c771c171e4c2edf26addffcaf70ecafd620112b6e90a0c4e0b
Content-Type: application/json
Accept: application/json
```

---

## 2. Catalog of Available Data (What Is Present)

The gateway exposes 4 core endpoints providing employee profiles, daily attendance, punch timings, and system status:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           SPHERONIX INTEGRATION GATEWAY                                 │
└────────────────────────────────────┬────────────────────────────────────────────────────┘
                                     │
     ┌───────────────────────────────┼───────────────────────────────┬────────────────────┐
     ▼                               ▼                               ▼                    ▼
/v1/ping                    /v1/employees                 /v1/attendance        /v1/attendance-events
Identity & Scopes           Employee Profiles             Login & Logout        Punch In/Out Events
Validates Key & Expiry      16 Live Employees             155 Daily Records     Biometric, QR, IP
```

---

### Endpoint 1: Gateway Identity & Handshake (`GET /ping`)
* **Path:** `/api/integrations/v1/ping`
* **Scope Required:** *Any valid authenticated key*
* **Purpose:** Validates that the external system can communicate with Spheronix, verifies token validity, scope grants, and returns authoritative server clock time and audience synchronization metadata.
* **Fields Returned:**
  * `name`: Name assigned to this key integration (`"hrms"`).
  * `environment`: `"live"` or `"test"`.
  * `scopes`: Array of granted permissions.
  * `expiresAt`: ISO 8601 expiration timestamp.
  * `serverTime`: Authoritative ISO 8601 UTC server timestamp. Connectors must base their cycle watermark on this timestamp to prevent clock-skew rejection.
  * `audienceVersion`: Integer monotonic counter incremented whenever the key's authorized employee audience is expanded.
  * `audienceChangedAt`: ISO 8601 timestamp of last audience modification.
  * `expectedPollMinutes`: Expected polling cadence (default: `5`).

#### Sample Request & Response
```bash
curl -X GET "http://localhost:5000/api/integrations/v1/ping" \
  -H "Authorization: Bearer shk_live_05df7a0121040a35_d1dfebcbb0b530c771c171e4c2edf26addffcaf70ecafd620112b6e90a0c4e0b"
```
```json
{
  "success": true,
  "data": {
    "name": "hrms",
    "environment": "live",
    "scopes": [
      "employees:read",
      "attendance-daily:read",
      "attendance-history:read",
      "attendance-events:read"
    ],
    "expiresAt": "2027-04-22T12:00:23.694Z",
    "serverTime": "2026-10-27T10:45:00.000Z",
    "audienceVersion": 1,
    "audienceChangedAt": "2026-10-24T12:00:00.000Z",
    "expectedPollMinutes": 5
  }
}
```

---

### Endpoint 2: Employee Profiles Feed (`GET /employees`)
* **Path:** `/api/integrations/v1/employees`
* **Scope Required:** `employees:read`
* **Purpose:** Synchronizes staff master data into external HR/payroll systems.
* **Database Records:** All active and soft-deleted employee accounts permitted by this key's audience scope.

#### Field Specification
| JSON Field | Type | Description | External Mapping (e.g. Frappe) |
| :--- | :--- | :--- | :--- |
| `_id` | String (ObjectID) | Spheronix unique database ID | `custom_spheronix_user_id` |
| `employeeId` | String | Organization code (e.g. `"EMP-0003"`) | `name` / `employee` ID |
| `name` | String | Employee full name | `first_name` / `employee_name` |
| `email` | String | Corporate / login email address | `company_email` / `personal_email` |
| `role` | String | Access role (`admin`, `manager`, `employee`) | `designation` or custom role |
| `department` | String | Department (e.g. `"Technical"`, `"Marketing"`) | `department` |
| `designation` | String | Job title (e.g. `"Software Developer"`) | `designation` |
| `jobType` | String | Contract type (`"Full-Time"`, `"Intern"`, etc.) | `employment_type` |
| `phone` | String/null | Contact phone number | `cell_number` |
| `workLocation` | String/null | Office branch or city | `branch` / `location` |
| `gender` | String/null | Gender demographic | `gender` |
| `dob` | Date/null | Date of birth | `date_of_birth` |
| `joinedDate` | ISO Date | Joining date in Spheronix | `date_of_joining` |
| `isActive` | Boolean | Employment status (`true`/`false`) | `status` (`Active` / `Left`) |
| `deletedAt` | ISO Date / null | Soft-delete timestamp. When non-null, employee is terminated. | Set `status = "Left"` & `relieving_date` |
| `updatedAt` | ISO Date | Last record modification timestamp | Change tracking & delta sync |

#### Sample Request & Response
```bash
curl -X GET "http://localhost:5000/api/integrations/v1/employees?watermark=2026-10-27T10:44:30.000Z&limit=2" \
  -H "Authorization: Bearer shk_live_05df7a0121040a35_d1dfebcbb0b530c771c171e4c2edf26addffcaf70ecafd620112b6e90a0c4e0b"
```
```json
{
  "success": true,
  "data": [
    {
      "_id": "6a9e7cb82c26fb673f7fe034",
      "employeeId": "EMP-0003",
      "name": "Yash",
      "email": "yashwanthkumar@gmail.com",
      "role": "manager",
      "department": "Technical",
      "designation": "Marketing",
      "jobType": "Full-Time",
      "phone": null,
      "workLocation": "Bangalore",
      "gender": null,
      "dob": null,
      "joinedDate": "2026-09-07T08:58:32.456Z",
      "isActive": true,
      "deletedAt": null,
      "updatedAt": "2026-09-21T12:09:38.364Z"
    }
  ],
  "pagination": {
    "limit": 2,
    "watermark": "2026-10-27T10:44:30.000Z",
    "nextCursor": "eyJ0ZW5hbnQiOiIwNWRmN2EwMTIxMDQwYTM1IiwiZXAiOiJlbXBsb3llZXMi..."
  },
  "requestId": "e666f9d2-26d8-4eeb-b9ee-ed859e6e5fde"
}
```

---

### Endpoint 3: Daily Attendance Feed (`GET /attendance`)
* **Path:** `/api/integrations/v1/attendance`
* **Scope Required:** `attendance-daily:read`
* **Purpose:** Synchronizes aggregated daily attendance, login/checkout timestamps, calculated work hours, and status.
* **Database Records:** All **155 attendance summaries** in the system.

#### Field Specification
| JSON Field | Type | Description | External Mapping (e.g. Frappe) |
| :--- | :--- | :--- | :--- |
| `_id` | String (ObjectID) | Unique daily attendance record ID | `custom_spheronix_attendance_id` |
| `userId` | String (ObjectID) | Spheronix Employee ID | Links to Employee |
| `date` | String (`YYYY-MM-DD`) | Calendar attendance date | `attendance_date` |
| `status` | String | Attendance outcome (`present`, `half-day`, `late`, `absent`, `manual_pending`) | `status` (`Present`, `Half Day`, `Absent`) |
| `checkInTime` | ISO Date/null | **Login timing** (First punch of the day) | `in_time` |
| `checkOutTime` | ISO Date/null | **Checkout timing** (Last punch of the day) | `out_time` |
| `totalDurationMinutes` | Integer | Total elapsed minutes between in and out | Gross working duration |
| `totalBreakMinutes` | Integer | Recorded break time | Total break duration |
| `actualWorkMinutes` | Integer | Net productive work minutes | Net working hours (`actualWorkMinutes / 60`) |
| `autoCheckedOut` | Boolean | Whether system checked out automatically | Flag for auto-closure |
| `updatedAt` | ISO Date | Last update timestamp | Delta sync continuation |

#### Sample Request & Response
```bash
curl -X GET "http://localhost:5000/api/integrations/v1/attendance?watermark=2026-10-24T12:00:00.000Z&limit=2" \
  -H "Authorization: Bearer shk_live_05df7a0121040a35_d1dfebcbb0b530c771c171e4c2edf26addffcaf70ecafd620112b6e90a0c4e0b"
```
```json
{
  "success": true,
  "data": [
    {
      "_id": "6aaa18e6d62a16991c64d335",
      "userId": "6a9e79c924af0c8402f52a61",
      "date": "2026-09-16",
      "status": "present",
      "checkInTime": "2026-09-16T04:19:50.426Z",
      "checkOutTime": "2026-09-16T12:47:16.786Z",
      "totalDurationMinutes": 508,
      "totalBreakMinutes": 30,
      "actualWorkMinutes": 478,
      "autoCheckedOut": false,
      "updatedAt": "2026-09-16T04:19:50.426Z"
    }
  ],
  "pagination": {
    "limit": 2,
    "watermark": "2026-10-24T12:00:00.000Z",
    "nextCursor": "eyJ0ZW5hbnQiOiIwNWRmN2EwMTIxMDQwYTM1IiwiZXAiOiJhdHRlbmRhbmNlIi..."
  },
  "requestId": "31c209a5-ac08-4c61-930b-b7a4c414b3ac"
}
```

---

### Endpoint 4: Raw Punch Events Feed (`GET /attendance-events`)
* **Path:** `/api/integrations/v1/attendance-events`
* **Scope Required:** `attendance-events:read`
* **Purpose:** Returns discrete clock-in and clock-out physical punches. Ideal for external shift calculation or Frappe `Employee Checkin`.

#### Field Specification
| JSON Field | Type | Description | External Mapping (e.g. Frappe) |
| :--- | :--- | :--- | :--- |
| `eventId` | String | Deterministic ID (`<attendanceId>_IN` or `_OUT`) | `custom_spheronix_log_id` |
| `attendanceId` | String | Reference to parent daily attendance record | Parent Attendance linkage |
| `userId` | String | Spheronix Employee ID | Links to Employee |
| `logType` | String (`IN` / `OUT`) | Direction of punch | `log_type` (`IN` / `OUT`) |
| `eventTime` | ISO Date | Exact timestamp of punch | `time` |
| `device` | String | Device type (`biometric`, `qr_code`, `wifi_ip`) | `device_id` / Method |
| `updatedAt` | ISO Date | Synchronization tracking timestamp | Incremental cursor watermark |

---

## 3. External Data Extraction Plan (Architecture & Protocol)

To reliably synchronize data into an external database without data loss, race conditions, or duplicate entries, the external integration must follow this **5-step protocol**:

```mermaid
flowchart TD
    A[Step 1: Handshake /ping] --> B{Token Valid?}
    B -- No --> C[Alert Admin / Halt]
    B -- Yes --> D[Step 2: Read Last Watermark T_prev]
    D --> E[Capture Snapshot Watermark T_watermark = now_utc]
    E --> F[Step 3: Call Feed Endpoint with T_watermark]
    F --> G[Step 4: Save Records in Target Database Transaction]
    G --> H{nextCursor Present?}
    H -- Yes --> I[Request next page with &cursor=nextCursor]
    I --> G
    H -- No --> J[Step 5: Persist sync_watermark = T_watermark]
    J --> K[Sync Run Complete]
```

### Protocol Steps

#### Step 1: Gateway Handshake (`/ping`)
Before performing extraction, make a preliminary call to `/ping`. If the status is not `200`, halt execution and raise an alert (e.g., token expired, network unreachable).

#### Step 2: Establish the Snapshot Upper Watermark ($T_{\text{watermark}}$)
Record updates happen continuously. To prevent pagination drift (records inserted while paging through the dataset):
1. Determine the previous sync checkpoint ($T_{\text{prev}}$) from your external database.
2. Capture the current UTC timestamp: $T_{\text{watermark}} = \text{new Date().toISOString()}$.
3. Use $T_{\text{watermark}}$ across all page requests in this sync session.

#### Step 3: Stream Records via Signed Cursor Continuation
Send the initial request with:
* `watermark`: $T_{\text{watermark}}$ (upper bound cutoff)
* `updated_since`: $T_{\text{prev}}$ (optional lower bound to fetch only modified records)
* `limit`: Number of records per batch (`50` to `250`)

If `pagination.nextCursor` is present:
* Pass `&cursor=${encodeURIComponent(pagination.nextCursor)}` in the subsequent call.
* Repeat until `pagination.nextCursor` is `null`.

#### Step 4: Transactional Idempotency in Target Database
When inserting records into the target system:
1. Enforce unique constraints on primary external keys:
   * Employees: `employeeId` / `_id`
   * Attendance: `custom_spheronix_attendance_id` (`_id`)
   * Events: `eventId`
2. If a record already exists, perform an **upsert** (update existing fields if `updatedAt` in payload is strictly newer than the record in the target system).

#### Step 5: Advance Synchronization Checkpoint
Only after all pages in the stream have been committed to the target database, update the stored checkpoint:
$$\text{last\_synced\_watermark} \leftarrow T_{\text{watermark}}$$

---

## 4. Error Handling & Rate Limit Specifications

| Status Code | Error Code | Root Cause | Integration Recovery Action |
| :--- | :--- | :--- | :--- |
| **400** | `WATERMARK_REQUIRED` | Missing `?watermark=` query parameter. | External client must supply an explicit ISO 8601 UTC timestamp. |
| **400** | `WATERMARK_FUTURE` | Watermark timestamp is > 5 minutes in the future compared to server clock. | Synchronize external clock via NTP or fetch `serverTime` via `GET /ping`. |
| **400** | `WATERMARK_TOO_RECENT` | Watermark timestamp is within 10 seconds of current server clock. | Safety guard against mid-transaction race conditions. Subtract 30s buffer ($T_{\text{watermark}} = \text{serverTime} - 30\text{s}$). Continuation cursors are exempt. |
| **400** | `INVALID_CURSOR_SIGNATURE` | Cursor token was modified or corrupted in transit. | Clear cursor token and restart extraction from previous watermark checkpoint. |
| **400** | `CURSOR_CONTEXT_MISMATCH` | Cursor from `/attendance` was passed to `/employees`, or watermark changed. | Ensure cursors are only passed back to the exact same endpoint and watermark. |
| **401** | `UNAUTHORIZED` | API key invalid, revoked, or expired. | Refresh credential in Spheronix Admin Settings. |
| **403** | `INSUFFICIENT_SCOPE` | Key lacks the required scope (e.g. `attendance-daily:read`). | Regenerate key with the necessary scope. |
| **429** | `RATE_LIMITED` | Exceeded 300 requests/minute threshold. | Inspect `Retry-After` header and back off exponentially. |

---

## 5. Production Frappe HRMS Unattended 5-Minute Auto-Sync Connector

For continuous, unattended synchronization every 5 minutes from Spheronix into Frappe HRMS, the connector must implement distributed locking, server-authoritative cycle watermarks, audience version expansion detection, and safe upserts.

### Architecture Contract & Guarantees
1. **Checkpoint DocType (`Spheronix Sync Checkpoint`)**:
   Keyed by `provider = "spheronix_hrms"` and `feed` (`employees`, `attendance`, `attendance-events`). Tracks `last_synced_watermark` and `acknowledged_audience_version`.
2. **Sliding Distributed Redis Lock**:
   Uses `frappe.cache().lock("spheronix_sync_lock", timeout=900)`. To prevent long sync cycles on initial backfills from stalling or duplicating, the lock is refreshed before fetching each page: `lock.extend(900, replace_ttl=True)`.
3. **Authoritative Cycle Watermark**:
   Query `GET /ping` to obtain `serverTime`. Compute $T_{\text{watermark}} = \text{serverTime} - 30\text{ seconds}$. This prevents clock-drift issues and safely satisfies the 10-second `WATERMARK_TOO_RECENT` guard.
4. **Audience Expansion Detection & Backfill**:
   If `/ping` reports `audienceVersion > acknowledged_audience_version`, an administrator has added employees or expanded scope to Org-Wide in Spheronix. The connector immediately executes a historical backfill across `/employees` $\rightarrow$ `/attendance` $\rightarrow$ `/attendance-events` without an `updated_since` lower bound, then updates `acknowledged_audience_version = audienceVersion`.
5. **Soft-Delete vs. Scope Omission Contract**:
   * If `deletedAt != null` in `/employees`: set Frappe Employee `status = "Left"` and `relieving_date = deletedAt`.
   * **CRITICAL**: If an employee is simply absent from the feed (because the integration key has restricted audience scope), Frappe must **NEVER** mark them as "Left". Absence represents an access boundary, not a company termination.
6. **Punch Event Upsert**:
   Deduplicate by `custom_spheronix_log_id = eventId`. Convert UTC `eventTime` to Frappe system timezone. Handle duplicate race collisions gracefully.

### Frappe Scheduled Task Configuration

```python
# In your custom frappe app hooks.py:
scheduler_events = {
    "cron": {
        "*/5 * * * *": [
            "spheronix_connector.sync.run_spheronix_5min_sync"
        ]
    }
}
```

### Complete Reference Implementation (`spheronix_connector/sync.py`)

```python
import os
import requests
import urllib.parse
from datetime import datetime, timezone, timedelta
import frappe
from frappe.utils import get_datetime, now_datetime

BASE_URL = os.environ.get("SPHERONIX_API_URL", "http://localhost:5000/api/integrations/v1")
API_KEY = os.environ.get("SPHERONIX_API_KEY", "shk_live_05df7a0121040a35_d1dfebcbb0b530c771c171e4c2edf26addffcaf70ecafd620112b6e90a0c4e0b")

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "Accept": "application/json"
}

def get_checkpoint(feed: str):
    """Retrieve or initialize persistent synchronization checkpoint for this feed."""
    name = f"spheronix_hrms_{feed}"
    if not frappe.db.exists("Spheronix Sync Checkpoint", name):
        doc = frappe.get_doc({
            "doctype": "Spheronix Sync Checkpoint",
            "name": name,
            "provider": "spheronix_hrms",
            "feed": feed,
            "last_synced_watermark": None,
            "acknowledged_audience_version": 1,
            "status": "idle"
        })
        doc.insert(ignore_permissions=True)
        return doc
    return frappe.get_doc("Spheronix Sync Checkpoint", name)

def run_spheronix_5min_sync():
    """Main scheduler job executed every 5 minutes by Frappe worker."""
    # Step 1: Distributed Lock with 15-minute TTL to prevent concurrent overlaps
    lock = frappe.cache().lock("spheronix_sync_lock", timeout=900)
    if not lock.acquire(blocking=False):
        frappe.logger("spheronix").info("Prior Spheronix sync job still running; skipping cycle.")
        return

    try:
        # Step 2: Gateway Handshake & Clock Extraction
        res = requests.get(f"{BASE_URL}/ping", headers=HEADERS, timeout=15)
        res.raise_for_status()
        ping_data = res.json()["data"]

        server_time_str = ping_data.get("serverTime")
        server_dt = get_datetime(server_time_str) if server_time_str else datetime.now(timezone.utc)
        
        # Authoritative cycle watermark with 30s safety buffer
        cycle_watermark = (server_dt - timedelta(seconds=30)).isoformat()
        audience_version = ping_data.get("audienceVersion", 1)

        # Step 3: Check Audience Expansion Across Checkpoints
        emp_cp = get_checkpoint("employees")
        audience_expanded = audience_version > (emp_cp.acknowledged_audience_version or 1)

        if audience_expanded:
            frappe.logger("spheronix").info(
                f"Spheronix audience expanded (v{audience_version} > v{emp_cp.acknowledged_audience_version}). Triggering historical backfill."
            )

        # Step 4: Sequentially Sync Feeds (Employees -> Attendance -> Punch Events)
        sync_employees(lock, cycle_watermark, force_backfill=audience_expanded)
        sync_attendance(lock, cycle_watermark, force_backfill=audience_expanded)
        sync_punch_events(lock, cycle_watermark, force_backfill=audience_expanded)

        # Step 5: Update Acknowledged Audience Version After Complete Pass
        if audience_expanded:
            for feed in ["employees", "attendance", "attendance-events"]:
                cp = get_checkpoint(feed)
                cp.acknowledged_audience_version = audience_version
                cp.save(ignore_permissions=True)
            frappe.db.commit()

        frappe.logger("spheronix").info(f"Spheronix 5-minute sync completed successfully at {cycle_watermark}.")

    except Exception as e:
        frappe.log_error(f"Spheronix 5-Min Sync Failed: {str(e)}", "Spheronix Sync Error")
        raise
    finally:
        try:
            lock.release()
        except Exception:
            pass

def sync_feed_stream(feed: str, lock, watermark: str, updated_since: str = None, page_handler = None):
    """Paginates an endpoint stream with sliding lock renewal and atomic checkpointing."""
    cursor = None
    total_records = 0

    while True:
        # Sliding renewal: extend lock TTL by 15 minutes before fetching each page
        try:
            lock.extend(900, replace_ttl=True)
        except Exception:
            pass

        params = {"watermark": watermark, "limit": 100}
        if updated_since and not cursor:
            params["updated_since"] = updated_since
        if cursor:
            params["cursor"] = cursor

        url = f"{BASE_URL}/{feed}?" + urllib.parse.urlencode(params)
        res = requests.get(url, headers=HEADERS, timeout=25)
        res.raise_for_status()

        body = res.json()
        records = body.get("data", [])
        total_records += len(records)

        if page_handler and records:
            page_handler(records)
            frappe.db.commit()

        cursor = body.get("pagination", {}).get("nextCursor")
        if not cursor:
            break

    # Advance Checkpoint
    cp = get_checkpoint(feed)
    cp.last_synced_watermark = watermark
    cp.last_synced_at = now_datetime()
    cp.save(ignore_permissions=True)
    frappe.db.commit()
    return total_records

def sync_employees(lock, watermark: str, force_backfill: bool = False):
    cp = get_checkpoint("employees")
    updated_since = None if force_backfill else cp.last_synced_watermark

    def handle_page(records):
        for rec in records:
            user_id = rec.get("_id")
            emp_id = rec.get("employeeId") or user_id
            
            # Check if Employee exists by custom_spheronix_user_id or employeeId
            existing_name = frappe.db.get_value("Employee", {"custom_spheronix_user_id": user_id}, "name")
            if not existing_name and rec.get("employeeId"):
                existing_name = frappe.db.get_value("Employee", {"name": rec["employeeId"]}, "name")

            if existing_name:
                doc = frappe.get_doc("Employee", existing_name)
            else:
                doc = frappe.new_doc("Employee")
                doc.custom_spheronix_user_id = user_id
                doc.employee = emp_id

            # Sync fields
            doc.first_name = rec.get("name")
            doc.company_email = rec.get("email")
            if rec.get("department"):
                doc.department = rec["department"]
            if rec.get("designation"):
                doc.designation = rec["designation"]

            # Soft-delete vs Active
            is_deleted = rec.get("deletedAt") is not None
            if is_deleted:
                doc.status = "Left"
                doc.relieving_date = rec["deletedAt"]
            elif not rec.get("isActive", True):
                doc.status = "Inactive"
            else:
                doc.status = "Active"

            doc.save(ignore_permissions=True)

    sync_feed_stream("employees", lock, watermark, updated_since, handle_page)

def sync_attendance(lock, watermark: str, force_backfill: bool = False):
    cp = get_checkpoint("attendance")
    updated_since = None if force_backfill else cp.last_synced_watermark

    def handle_page(records):
        for rec in records:
            spheronix_id = rec.get("_id")
            emp_id = rec.get("employeeId")
            date_str = rec.get("date")

            if not emp_id or not date_str:
                continue

            existing = frappe.db.get_value(
                "Attendance",
                {"custom_spheronix_attendance_id": spheronix_id},
                ["name", "status"],
                as_dict=True
            )

            status = "Present" if rec.get("status") in ["present", "late", "half_day"] else "Absent"

            if existing:
                doc = frappe.get_doc("Attendance", existing.name)
                doc.status = status
            else:
                doc = frappe.new_doc("Attendance")
                doc.custom_spheronix_attendance_id = spheronix_id
                doc.employee = emp_id
                doc.attendance_date = date_str
                doc.status = status

            doc.save(ignore_permissions=True)

    sync_feed_stream("attendance", lock, watermark, updated_since, handle_page)

def sync_punch_events(lock, watermark: str, force_backfill: bool = False):
    cp = get_checkpoint("attendance-events")
    updated_since = None if force_backfill else cp.last_synced_watermark

    def handle_page(records):
        for event in records:
            event_id = event.get("eventId")
            if not event_id:
                continue

            # Check if Checkin exists by custom_spheronix_log_id
            existing = frappe.db.get_value(
                "Employee Checkin",
                {"custom_spheronix_log_id": event_id},
                ["name", "time"],
                as_dict=True
            )

            # Convert UTC event time to Frappe system timezone
            utc_time = get_datetime(event.get("eventTime"))
            system_time = utc_time.astimezone() if hasattr(utc_time, "astimezone") else utc_time

            try:
                if existing:
                    doc = frappe.get_doc("Employee Checkin", existing.name)
                    doc.time = system_time
                    doc.log_type = event.get("logType", "IN")
                    doc.save(ignore_permissions=True)
                else:
                    doc = frappe.new_doc("Employee Checkin")
                    doc.custom_spheronix_log_id = event_id
                    doc.employee = event.get("employeeId") or event.get("userId")
                    doc.time = system_time
                    doc.log_type = event.get("logType", "IN")
                    doc.device_id = event.get("device", "biometric")
                    doc.insert(ignore_permissions=True)
            except frappe.DuplicateEntryError:
                # Concurrent race handled cleanly
                pass

    sync_feed_stream("attendance-events", lock, watermark, updated_since, handle_page)
```

---

## 6. Standalone ETL Scripts
        params = {
            "watermark": watermark,
            "limit": 100
        }
        if updated_since and not cursor:
            params["updated_since"] = updated_since
        if cursor:
            params["cursor"] = cursor

        url = f"{BASE_URL}/{endpoint}?" + urllib.parse.urlencode(params)
        res = requests.get(url, headers=headers, timeout=15)
        res.raise_for_status()

        body = res.json()
        records = body.get("data", [])
        total_fetched += len(records)

        # Process / Ingest records into target system
        for record in records:
            # Process employee, attendance, or event record here
            pass

        print(f"  Fetched batch of {len(records)} records (Total so far: {total_fetched})")

        cursor = body.get("pagination", {}).get("nextCursor")
        if not cursor:
            break

    print(f"🎉 Completed sync for /{endpoint}. Total records: {total_fetched}")
    return watermark

if __name__ == "__main__":
    verify_handshake()
    
    # Sync all employees
    sync_feed("employees")
    
    # Sync all daily attendance
    sync_feed("attendance")
```

---

### Node.js / TypeScript Extraction Script

```typescript
import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/integrations/v1';
const API_KEY = 'shk_live_05df7a0121040a35_d1dfebcbb0b530c771c171e4c2edf26addffcaf70ecafd620112b6e90a0c4e0b';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

async function extractAllAttendance() {
  const watermark = new Date().toISOString();
  let cursor: string | null = null;
  let allRecords: any[] = [];

  console.log(`Starting extraction at watermark: ${watermark}`);

  do {
    const params: Record<string, any> = { watermark, limit: 100 };
    if (cursor) params.cursor = cursor;

    const response = await client.get('/attendance', { params });
    const { data, pagination } = response.data;

    allRecords = allRecords.concat(data);
    cursor = pagination.nextCursor;

    console.log(`Received ${data.length} records. Next cursor: ${cursor ? 'YES' : 'NONE'}`);
  } while (cursor);

  console.log(`✅ Successfully extracted ${allRecords.length} attendance records.`);
  return allRecords;
}

extractAllAttendance().catch(console.error);
```
