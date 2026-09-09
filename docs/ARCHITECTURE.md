# Spheronix Technology — Attendance System

# Architecture & Technology Reference

Version: 1.0  ·  Date: 2026-09-09  ·  Status: Living document

An enterprise employee attendance & performance tracking platform: biometric / QR / WiFi-IP based check-in with GPS geofencing, device trust, mandatory daily work logs, leave management, and role-based portals for Employees, Managers, and Admins.

## 1. Repository Layout

npm monorepo (per-app package.json + lockfiles, orchestrated by root --prefix scripts — no npm workspaces):

attendance-system/

├── apps/

│   ├── api/        Express 4 REST API + Socket.IO + node-cron      (port 5000)

│   ├── employee/   React SPA — check-in / check-out portal         (port 3002, HTTPS dev)

│   ├── manager/    React SPA — team management portal              (port 3001)

│   └── admin/      React SPA — system configuration                (port 3000)

├── packages/shared/   auditActions.js — shared audit-action constants

├── docs/              project documentation

├── nginx.conf         production reverse proxy (4 subdomains)

├── ecosystem.config.json   PM2 process configuration (Ubuntu VPS)

└── package.json       root scripts: dev:api|admin|manager|employee, build:all, seed

## 2. Technology Stack

| Layer | Technology | Details |

| --- | --- | --- |

| Runtime | Node.js | CommonJS backend; ESM ("type": "module") frontends |

| Backend framework | Express 4 | apps/api/src/app.js — helmet, CORS allowlist, rate limiting, trust proxy |

| Database | MongoDB Atlas + Mongoose 8 | 21 collections, schema-validated models |

| Realtime | Socket.IO 4 | Server + client; per-role rooms (emitToTeam / Managers / User / Admins) |

| Auth | JWT in httpOnly cookies | Per-portal cookie token_<role>; tokenVersion session revocation |

| Biometrics | WebAuthn / FIDO2 | @simplewebauthn/server v10 + @simplewebauthn/browser — platform authenticators (fingerprint / Face ID) |

| QR codes | html5-qrcode + qrcode | Interactive checkout: PC shows QR, phone scans |

| Device identity | @fingerprintjs/fingerprintjs v5 + custom lib/fingerprint.js | Canvas/UA fingerprint via x-device-fingerprint header |

| Geofencing | Custom haversine (utils/haversine.js) | Radius math in meters |

| IP / network | ipaddr.js | CIDR + IPv4/IPv6 + IPv4-mapped matching (utils/ipUtils.js) |

| Frontend | React 18 + Vite 5 | 3 independent SPAs, react-router v6 |

| Styling | Tailwind CSS 3 | Dark slate theme; shared utility classes (card, btn-primary, …) |

| Icons | lucide-react |  |

| Forms / validation | zod + react-hook-form (employee app) | API validates inline in controllers; express-validator installed but unused |

| Scheduling | node-cron | 3 jobs: log reminders, auto-checkout, temp-access cleanup |

| Process manager | PM2 | ecosystem.config.json — 512 MB memory-restart cap |

| Reverse proxy | Nginx + Certbot (Let's Encrypt) | nginx.conf — TLS, rate limits, SPA caching, HSTS |

| Dev tunneling | Cloudflare Tunnel (*.trycloudflare.com) | Mobile device testing over office WiFi |



## 3. Deployment Architecture

                     ┌─ Production (Ubuntu VPS) ──────────────────────────┐

 Internet ── Nginx ──┤  admin.spheronixtechnology.in   → apps/admin/dist  │

    (Certbot TLS)    ├─  manager.…                    → apps/manager/dist│

                     ├─  employee.…                  → apps/employee/dist│

                     └─  api.…  → PM2 → 127.0.0.1:5000 (Node API)       │

                                   └→ MongoDB Atlas (cloud)             │

                     └────────────────────────────────────────────────────┘



 Dev: Vite dev servers (proxy /api and /socket.io → :5000)

      + Cloudflare Tunnel for phone testing

Nginx serves the three built SPAs directly (try_files … /index.html) and proxies /api/ to the Node API on loopback.

Nginx forwards X-Forwarded-For $proxy_add_x_forwarded_for; Express runs with app.set('trust proxy', 1) — together these make getClientIp(req) return the true client IP, which the WiFi/IP attendance gate depends on.

Static uploads (/uploads/) are served by Nginx with a strict MIME whitelist.

Rate limiting at both layers: nginx (30 r/m API, 10 r/m auth) and Express (300/15 min global, 20/15 min auth — production only).

## 4. Backend Architecture (apps/api)

Layered monolith: server.js → app.js → routes → controllers → services → models.

Request

  ↓ helmet → CORS (origin allowlist, credentials) → rate-limit → cookieParser

  ↓ app.set('trust proxy', 1)

  ↓ middleware/authenticate.js   JWT cookie → req.user; tokenVersion revocation check

  ↓ middleware/authorize.js      role gate: 'employee' | 'manager' | 'admin'

  ↓ routes/*.routes.js

  ↓ controllers/*.controller.js  inline validation, early badRequest() returns

  ↓ services/*.service.js        business logic (auth, audit, leave, cleanup,

  │                               dailyLog, notification, upload, webauthn)

  ↓ models/*.js                  21 Mongoose collections

Response envelope: utils/response.js — success / badRequest / forbidden / notFound

### Route groups

| Mount | Purpose |

| --- | --- |

| /api/auth | Login, logout, session, profile bootstrap |

| /api/employee | Attendance check-in/out, daily logs, leaves, devices, biometrics, network-status |

| /api/manager | Team attendance/logs, leave & device & location request decisions, notifications |

| /api/admin | Attendance-method switch, office locations (incl. WiFi/IP allowlist), device requests, users/teams, audit logs |

| biometric routes | WebAuthn enroll / auth options + verification |



Cross-cutting: writeAuditLog (services/audit.service.js) writes actor, action, target, reason, and client IP to the AuditLog collection for every sensitive operation.

## 5. Domain Model (21 collections)

User ──┬── Team (managers / members)

       ├── RegisteredDevice      (fingerprint lock, IP trail, temporary windows)

       ├── BiometricCredential   (WebAuthn public keys)

       ├── Attendance            (per user+date: check-in/out times, method, breaks, work minutes)

       ├── DailyLog              (mandatory before check-out: team, project, hours)

       ├── LeaveRequest / LeaveType / LeaveBalance

       ├── Notification

       └── LocationRequest → EmployeeLocation  (temporary / exception access grants)



OfficeLocation             multi-office: lat/lng, radiusMeters, wifiSsid, allowedIps[]

GeofenceSetting            legacy single-office fallback

AttendanceMethodSetting    append-only: qr_code | wifi_ip | device_fingerprint | biometric

DeviceRequest              device registration / replacement approval workflow

ManagerPermission          per-manager capability flags (e.g. canManageLocationRequests)

PerformanceNote, AuditLog

## 6. Core Business Flows

### 6.1 Check-in pipeline (4-gate cascade)

employee.controller.js → checkIn:

Duplicate gate — one Attendance document per user + date.

Geofence gate — GPS vs all active OfficeLocations (haversine), falling back to legacy GeofenceSetting when none exist.

Device gate — active RegisteredDevice required; hard fingerprint lock; mismatch throttled-alerts the manager.

Method gate (per active AttendanceMethodSetting): 

qr_code → QR value presence check

biometric → WebAuthn token verification (webauthn.service.js)

device_fingerprint → covered by gates 2–3

wifi_ip → request IP ∈ office allowedIps AND GPS inside that same office's radius (paired check — stricter than either condition alone)

### 6.2 Check-out

Mirrors check-in gates, plus:

Mandatory DailyLog gate — check-out is rejected until today's log is submitted.

Interactive QR ceremony — initiateCheckout issues a 90-second single-use token pushed via Socket.IO to the employee's phone; the phone scans the PC's QR to authorize check-out.

### 6.3 Auth & sessions

JWT stored in httpOnly SameSite cookies named token_<portalRole> (3 h expiry).

tokenVersion on the User document invalidates all existing sessions on password change.

Login records device + IP for the device-trust workflow.

## 7. Realtime & Background Jobs

Socket.IO events (bidirectional): attendance:update, checkout:initiate_scan (PC → phone), location:request_resolved, device:request_resolved, notification pushes, per-user / per-team / per-role rooms.

| Cron job | Schedule (IST) | Effect |

| --- | --- | --- |

| Daily log reminder | 18:00 | Notifies checked-in employees missing daily logs |

| Auto-checkout | 23:59 | Marks no-checkout records incomplete; finalizes duration/break metrics |

| Temp-access cleanup | hourly | Expires temporary device authorizations and location grants |



## 8. Security Architecture (defense in depth)

| Control | Implementation |

| --- | --- |

| Sessions | httpOnly SameSite cookies, 3 h expiry, tokenVersion revocation |

| Device trust | Fingerprint hard-lock + admin/manager approval workflow (DeviceRequest), revocable |

| Presence proof | GPS geofence ∩ authorized network IP ∩ registered device ∩ (biometric / QR) |

| Rate limiting | Express (production) + nginx layers |

| Audit trail | Every sensitive action → AuditLog with actor, target, reason, IP |

| Headers | helmet, HSTS, nosniff, frame-guard (Express and nginx) |

| CORS | Origin allowlist with credentials; dev mode relaxes for LAN device testing |



Known limits (documented, by design): a client hitting the API directly (bypassing nginx) can spoof X-Forwarded-For when trust proxy = 1; production mitigates by binding the API to loopback behind nginx. Shared-egress NAT and ISP-delegated dynamic IPv6 prefixes are inherent limits of IP-based presence.

## 9. Configuration & Environments

apps/api/.env (see .env.example): MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN, CORS_ORIGINS, PORT, UPLOAD_DIR, seed defaults. config/env.js validates required vars at boot.

Dev ports: API 5000 · admin 3000 · manager 3001 · employee 3002 (HTTPS via @vitejs/plugin-basic-ssl for camera/geolocation APIs on phones).

Vite dev proxies: /api and /socket.io (ws) → http://localhost:5000.

Seed scripts: npm run seed + focused scripts in apps/api/src/scripts/ (seed admin/manager/employee/team, data fixes, migrations).

## 10. Engineering Observations & Known Gaps

No automated test suite — verification is manual plus one-off scripts under apps/api/src/scripts/.

No CI/CD pipeline — build/deploy is manual (npm run build:all + PM2 restart).

Three duplicated axios API clients (apps/*/src/lib/api.js) — packages/shared is underused.

Controller-heavy API — employee.controller.js exceeds 1,000 lines; service extraction is partial.

Admin UX inconsistency — several admin pages are inline in App.jsx using alert() / prompt(); others are proper page components.

WiFi/IP attendance (in progress at time of writing): check-in gate, IP utilities, admin WiFi settings page, and employee network banners are implemented (uncommitted); deferred items — manager-approved exception requests, fail-closed guard when no allowlist is configured, server-side IP format validation, WiFi settings audit logging, exception expiry cleanup.

Generated from a full-codebase analysis on 2026-09-09. Update this document when the architecture changes.