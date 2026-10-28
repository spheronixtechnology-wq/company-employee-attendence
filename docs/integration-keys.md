# Frappe HRMS Integration Keys — Technical Specification & Operational Runbook

**Spheronix Attendance System**  
**Component:** External Integration Gateway (Stage 1: Credential Management)  
**Security Standard:** Zero-Cache Instant Revocation, Environment Binding, HMAC-SHA256, Step-Up Guarded  

---

## 1. Overview & Scope

Stage 1 establishes the credential management foundation for synchronizing employee attendance data with Frappe HRMS. In Stage 1, the external gateway exposes only the heartbeat/verification route:
```http
GET /api/integrations/v1/ping
```
All data synchronization endpoints (employee directory, punch logs, attendance daily records) remain deferred to Stage 2, gated by Track B (attendance security hardening) and Track C (attendance database migration).

---

## 2. Token Architecture & Cryptography

### 2.1 Key Format
Every integration key adheres strictly to the following syntax:
```
shk_<environment>_<keyId:16 hex>_<secret:64 hex>
```
* **Prefix:** `shk_` (Spheronix HRMS Key)
* **Environment:** `live` (Production) or `test` (Sandbox/Staging)
* **Key ID:** 16 lowercase hex characters (`crypto.randomBytes(8).toString('hex')`)
* **Secret:** 64 lowercase hex characters (`crypto.randomBytes(32).toString('hex')`, 256 bits of entropy)
* **Regex Pattern:** `^shk_(live|test)_([0-9a-f]{16})_([0-9a-f]{64})$`

### 2.2 Storage Model (`IntegrationCredential`)
* The raw secret is **never stored** in the database.
* The database stores only the HMAC-SHA256 digest (`secretHash`), which is excluded from standard queries via `select: false`.
* **HMAC Input with Strict Environment Binding:**
  $$\text{secretHash} = \text{HMAC-SHA256}(\text{pepper}, \text{environment} + '.' + \text{keyId} + '.' + \text{secret})$$

### 2.3 Zero-Cache Verification Flow
To ensure that revoked keys stop working instantaneously across the entire infrastructure, key verification never uses an in-memory authentication cache:
1. Regex format validation.
2. Database lookup by `keyId`.
3. Strict check: `stored.environment === token.environment`.
4. Pepper resolution: retrieves pepper matching `stored.pepperVersion`.
5. Constant-time comparison: `crypto.timingSafeEqual(storedHashBuffer, computedHashBuffer)`.
6. Status check: `stored.status === 'active'`.
7. Expiry check: `stored.expiresAt > now`.

---

## 3. HMAC Pepper Rotation Procedure

### 3.1 Environment Configuration
Peppers are configured via environment variables:
* `INTEGRATION_KEY_PEPPERS="v1:secret_alpha,v2:secret_beta"`
* `INTEGRATION_KEY_PEPPER_CURRENT="v1"`

### 3.2 Startup Safety Validation
During server initialization (`validatePeppersAtStartup`):
1. The server checks that `INTEGRATION_KEY_PEPPER_CURRENT` is defined and maps to a valid secret in `INTEGRATION_KEY_PEPPERS`.
2. The server queries MongoDB for all pepper versions currently used by active, unexpired keys:
   ```javascript
   IntegrationCredential.distinct('pepperVersion', {
     status: 'active',
     expiresAt: { $gt: new Date() }
   });
   ```
3. If any active credential requires a pepper version that is missing from the environment, **the server halts immediately with a fatal configuration error**.

### 3.3 Four-Step Pepper Rotation Protocol
When rotating cryptographic peppers from `v1` to `v2`:
1. **Step 1 (Add v2 Secret):** Update deployment secrets to include both versions:
   `INTEGRATION_KEY_PEPPERS="v1:<secret1>,v2:<secret2>"`
   Keep `INTEGRATION_KEY_PEPPER_CURRENT=v1`. Deploy.
2. **Step 2 (Switch Current):** Switch `INTEGRATION_KEY_PEPPER_CURRENT=v2`. Deploy. All newly issued and rotated keys now use `v2`. Existing `v1` keys continue validating seamlessly.
3. **Step 3 (Migrate / Rotate Keys):** Re-issue or rotate all existing `v1` keys.
4. **Step 4 (Retire v1):** Once all `v1` keys have either expired or been revoked, remove `v1` from `INTEGRATION_KEY_PEPPERS`:
   `INTEGRATION_KEY_PEPPERS="v2:<secret2>"`. Deploy.

---

## 4. Multi-Tier Rate Limiting Architecture

The integration gateway (`/api/integrations/v1/*`) implements four coordinated rate limit tiers:

| Tier | Limiter | Threshold | Key Generator | Defense Target |
|------|---------|-----------|---------------|----------------|
| **1** | **Route-Wide Failed-Auth** | 100 failures / 5 min | Global static key | Distributed botnet key-ID spraying |
| **2** | **Client IP Failed-Auth** | 20 failures / 15 min | `getClientIp(req)` | Single-source brute force |
| **3** | **Per-KeyId Failed-Auth** | 10 failures / 10 min | Parsed `keyId` | Targeted brute-force of a known key ID |
| **4** | **Authenticated Per-Key** | 300 req / min | Authenticated `keyId` | Tenant throughput and resource exhaustion |

---

## 5. Step-Up Authentication & Admin Key Operations

Sensitive key actions (**Create**, **Rotate**, **Revoke**) require administrator Step-Up verification:

```
Admin Portal -> POST /api/admin/auth/step-up { password, otp?, operation, targetKeyId? }
             <- { token: stepUpJwt, mfaUsed: bool }
             -> POST /api/admin/integrations/... (Header: X-Step-Up-Token: stepUpJwt)
```

1. **Pre-Validation:** The requested operation and target key ID are validated before a grant is issued.
2. **Dual MFA Mode:**
   - Admins with `mfaEnabled: false`: verified via password only.
   - Admins with `mfaEnabled: true`: verified via password AND 6-digit TOTP code.
3. **Single-Use Consumption:**
   Grants are stored in `StepUpGrant` and consumed atomically:
   ```javascript
   StepUpGrant.findOneAndUpdate(
     { jti, userId, operation, targetKeyId, consumedAt: null, expiresAt: { $gt: now } },
     { $set: { consumedAt: now } }
   );
   ```
   A token cannot be replayed, used across operations, or used after 5 minutes.

---

## 6. Key Rotation & Failure Remediation

### 6.1 Normal Rotation
* **Lifetime:** 1 to 180 days (default: old key's original lifetime).
* **Overlap Window:** 0 to 24 hours (default: 24h).
  * Calculated as $\min(\text{old.expiresAt}, \text{now} + \text{overlapHours})$.
  * **Inviolable Rule:** Overlap never extends the old key's existing expiry.
  * **Zero-Hour Overlap:** If `overlapHours === 0`, the old key is immediately revoked (`status: 'revoked'`, `revokeReason: 'rotated'`).

### 6.2 Compromised Rotation (Fail-Safe Revoke-First)
If an API key is leaked or compromised:
1. **Revoke First:** The old key is updated to `status: 'revoked'`, `revokeReason: 'compromised'`.
2. **Read-Back Verification:** The service reads back the document. If `status !== 'revoked'`, execution halts immediately with HTTP 500 (`INTEGRATION_KEY_COMPROMISE_REVOKE_FAILED`). No new key is issued!
3. **Replacement Issuance:** If revocation is confirmed, a new replacement key is issued.
4. **Partial Failure Remediation:** If replacement creation fails after successful revocation, the service returns **HTTP 500** with code `KEY_REVOKED_REPLACEMENT_FAILED` and payload `{ revoked: true, replacementIssued: false }`. The admin UI prompts the administrator to generate a fresh key manually.

---

## 7. Audit Logging & Compliance

All key lifecycle events generate immutable audit entries in `AuditLog`:
* `INTEGRATION_KEY_CREATED`
* `INTEGRATION_KEY_ROTATED`
* `INTEGRATION_KEY_REVOKED`
* `INTEGRATION_KEY_COMPROMISED`
* `INTEGRATION_KEY_COMPROMISE_REVOKE_FAILED`
* `STEP_UP_SUCCESS`
* `STEP_UP_FAILED`

Raw keys, HMAC peppers, passwords, and OTPs are redacted from all logs and error responses via `redactSensitive()`. Responses containing newly generated raw keys include `Cache-Control: no-store, no-cache, must-revalidate`.
