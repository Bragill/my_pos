# 📑 System Specification: Admin/Manager Two-Factor Biometric Authentication

| Metadata | Details |
| :--- | :--- |
| **Feature Name** | Two-Factor Biometric Authentication (Face ID / Fingerprint + Quick PIN) |
| **Target Audience** | Store Owners, System Administrators, Store Managers |
| **Target Platform** | iOS Safari / PWA, Android Chrome / PWA, Desktop (Edge/Chrome/Safari) |
| **Branch** | `feat/biometric-login` |
| **Backend Runtime** | Cloudflare Workers + Cloudflare D1 (`pos_system`) |
| **Status** | Specification Approved |
| **Date** | 2026-09-18 |

---

## 1. Executive Summary & Problem Statement

### 1.1 Context
In a fast-paced retail and restaurant POS environment, managers frequently need to log into the terminal to review real-time sales, adjust stock, or approve overrides. Typing long passwords or full credentials repeatedly is cumbersome and slows down operations.

### 1.2 The Shared POS Problem & Core Solution
When a counter terminal (e.g., an iPad or Android tablet) is shared among staff:
- **Biometric Limitations**: Mobile OS biometric engines (Face ID / Touch ID) do not differentiate between multiple users enrolled on the device; they only emit a binary "Scan Passed / Failed".
- **Risk**: A cashier could select a manager's name and use their enrolled face or an unlocked terminal to access administrative functions.
- **Specification Decision**: 
  1. **Strict Role Boundary**: Biometric login is exclusively available for **Admin and Manager** roles. Frontline **Cashiers continue using their unique 6-digit PIN**, preventing impersonation.
  2. **Two-Factor Fast Login (Biometrics + Quick PIN)**: Managers verify device biometric hardware presence, then instantly confirm with a short **Quick PIN**, achieving a 2-second secure sign-in while eliminating accidental or unauthorized access.

---

## 2. Roles & Permissions Matrix

| Role | PIN (6-digit) Login | Password Login | Biometric Enrollment | Biometric Fast Login | Access Store Settings |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Admin** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes (with 2FA PIN) | ✅ Full Access |
| **Manager** | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes (with 2FA PIN) | ⚠️ Store Ops Only |
| **Cashier / Staff** | ✅ Yes (Mandatory) | ❌ Disabled | ❌ Disabled | ❌ Disabled | ❌ Blocked |

---

## 3. Architecture & Functional Requirements

```mermaid
flowchart TD
    subgraph Client [Client Application - React PWA]
        LP[LoginPage]
        BP[BiometricsProfileModal]
        AP[Auto-Enrollment Banner]
        WAH[webAuthnHelper.js]
    end

    subgraph Hardware [Mobile / Device Secure Enclave]
        FID[Face ID / Touch ID / Fingerprint]
        SEC[Cryptographic Private Key Storage]
    end

    subgraph Server [Cloudflare Workers Backend]
        API[/api/biometrics]
        AUTH[/api/auth]
        WCA[Web Cryptography API - crypto.subtle]
    end

    subgraph Storage [Cloudflare D1 Database]
        UB[(user_biometrics)]
        DS[(device_security)]
        USR[(users)]
    end

    LP -->|1. Request Options| API
    API -->|Check Status| DS
    API -->|Generate Challenge| WCA
    API -->|Challenge & Credential IDs| LP
    LP -->|2. Prompt Hardware| WAH
    WAH -->|3. Native Prompt| FID
    FID -->|4. Signature| WAH
    LP -->|5. Quick PIN + Signature| API
    API -->|6. Verify Signature| WCA
    API -->|7. Verify PIN| USR
    API -->|8. Issue JWT| LP

    BP -->|Enrollment Flow| API
    API -->|Store Credential| UB
```

### 3.1 Device Capability Detection (FR-01)
- The application MUST check `window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`.
- If unsupported (e.g. desktop browser without biometric hardware), the biometric option is hidden gracefully.

### 3.2 Post-Login Auto-Enrollment (FR-02)
- Upon successful password or PIN login by an Admin or Manager:
  - If the device supports biometrics AND the user has no registered credential on this device's MAC address:
  - The UI presents an unobtrusive banner:
    > *"ต้องการเปิดใช้งาน Face ID / ลายนิ้วมือ สำหรับเข้าใช้งานอย่างรวดเร็วบนเครื่องนี้หรือไม่?"*
  - Actions: **"เปิดใช้งาน" (Enable)** or **"ไว้คราวหน้า" (Dismiss)**.

### 3.3 Standalone Profile & Biometrics Management (FR-03)
- Accessible from the top navigation bar (clicking the user avatar/profile).
- **Security Boundary**: Accessible without exposing confidential system settings (cost prices, revenue reports, tax/VAT settings).
- Capabilities:
  - View biometric support status of current device.
  - View list of enrolled devices (Device Name, Registered Date, Last Used Date).
  - One-click Register button.
  - Delete / revoke registered biometric devices.

### 3.4 Two-Factor Biometric Sign-In (FR-04)
- When clicking `🧬 สแกน Face ID / ลายนิ้วมือ` on `LoginPage`:
  1. Frontend fetches authentication options with device MAC address.
  2. Backend verifies device is not `LOCKED_TEMP` or `BLACKLISTED`.
  3. Browser invokes native biometric prompt (`Face ID` on iOS, `BiometricPrompt` on Android, `Windows Hello` on PC).
  4. Upon biometric success, a fast Quick PIN modal prompts for 4 digits.
  5. Backend cryptographically verifies the WebAuthn signature against the public key stored in D1 AND validates the PIN.
  6. Returns standard JWT and store list, redirecting to `/pos`.

---

## 4. Data Specifications (Cloudflare D1)

### 4.1 Table: `user_biometrics`
```sql
CREATE TABLE IF NOT EXISTS user_biometrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mac_address TEXT,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  algorithm TEXT DEFAULT 'ES256',
  counter INTEGER DEFAULT 0,
  device_name TEXT,
  created_at TEXT DEFAULT (datetime('now', '+7 hours')),
  last_used_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_biometrics_user ON user_biometrics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_biometrics_cred ON user_biometrics(credential_id);
CREATE INDEX IF NOT EXISTS idx_user_biometrics_mac ON user_biometrics(mac_address);
```

### 4.2 Data Dictionary
| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `TEXT PRIMARY KEY` | UUID v4. |
| `user_id` | `TEXT` | References `users.id` (Admin/Manager). |
| `mac_address` | `TEXT` | Hardware MAC fingerprint of the registered device. |
| `credential_id` | `TEXT` | Base64URL-encoded unique credential ID from authenticator. |
| `public_key` | `TEXT` | Base64URL-encoded SubjectPublicKeyInfo (SPKI) or COSE public key. |
| `algorithm` | `TEXT` | Signature algorithm (`ES256` or `RS256`). |
| `counter` | `INTEGER` | Authenticator usage counter for replay detection. |
| `device_name` | `TEXT` | Friendly device name (e.g. "iPad Pro · Safari", "Samsung Tab · Chrome"). |
| `created_at` | `TEXT` | Timestamp of enrollment (UTC+7). |
| `last_used_at` | `TEXT` | Timestamp of last successful biometric sign-in (UTC+7). |

---

## 5. API Interface Contract

### 5.1 Registration Endpoints (Authenticated - Admin/Manager)

#### `POST /api/biometrics/register-options`
- **Auth**: Bearer JWT (Role must be `admin` or `manager`).
- **Response**:
```json
{
  "success": true,
  "data": {
    "challenge": "base64url_random_32_bytes",
    "rp": {
      "name": "POS System",
      "id": "pos-backend.bragill2012.workers.dev"
    },
    "user": {
      "id": "user_id_base64",
      "name": "admin",
      "displayName": "ผู้จัดการร้าน"
    },
    "pubKeyCredParams": [
      { "type": "public-key", "alg": -7 },
      { "type": "public-key", "alg": -257 }
    ],
    "authenticatorSelection": {
      "authenticatorAttachment": "platform",
      "userVerification": "required",
      "residentKey": "preferred"
    },
    "timeout": 60000
  }
}
```

#### `POST /api/biometrics/register-verify`
- **Auth**: Bearer JWT.
- **Request Body**:
```json
{
  "credential_id": "base64url_credential_id",
  "client_data_json": "base64url_client_data",
  "attestation_object": "base64url_attestation",
  "device_name": "iPad Pro · Safari"
}
```
- **Response**:
```json
{
  "success": true,
  "message": "ลงทะเบียนชีวมาตรสำเร็จ",
  "credential": {
    "id": "uuid",
    "device_name": "iPad Pro · Safari",
    "created_at": "2026-09-18 13:30:00"
  }
}
```

---

### 5.2 Authentication Endpoints (Pre-Login / Public)

#### `POST /api/biometrics/login-options`
- **Headers**: `x-device-mac: MAC: ...`
- **Request Body**:
```json
{
  "mac_address": "MAC: 75:01:C0:D3:60:3D"
}
```
- **Response**:
```json
{
  "success": true,
  "data": {
    "challenge": "base64url_random_32_bytes",
    "timeout": 60000,
    "allowCredentials": [
      { "type": "public-key", "id": "cred_id_1" }
    ],
    "userVerification": "required"
  }
}
```

#### `POST /api/biometrics/login-verify`
- **Request Body**:
```json
{
  "mac_address": "MAC: 75:01:C0:D3:60:3D",
  "credential_id": "cred_id_1",
  "authenticator_data": "base64url_auth_data",
  "client_data_json": "base64url_client_data",
  "signature": "base64url_signature",
  "quick_pin": "1234"
}
```
- **Response (Success 200)**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "user": {
      "id": "e6375492-...",
      "username": "admin",
      "fullName": "ผู้จัดการร้าน",
      "role": "admin"
    },
    "stores": [{ "id": "store-1", "name": "สาขาหลัก" }]
  }
}
```
- **Response (Error 429 - Device Locked)**:
```json
{
  "success": false,
  "error": {
    "message": "อุปกรณ์นี้อยู่ในช่วงหน่วงเวลาชั่วคราว กรุณารออีกประมาณ 4 นาที",
    "remaining_seconds": 240,
    "status": "LOCKED_TEMP"
  }
}
```

---

## 6. Security & Failure Mode Handling

| Scenario | System Behavior |
| :--- | :--- |
| **Device is in `LOCKED_TEMP`** | Biometric button disabled in UI; API immediately rejects with HTTP 429 and countdown timer. |
| **Device is in `BLACKLISTED`** | Biometric button disabled; API immediately returns HTTP 403 Forbidden. |
| **Biometric scan fails 3 times** | Native iOS/Android prompts fallback to device passcode. No server failed-attempt penalty. |
| **Wrong Quick PIN entered** | Increments `failed_attempts` on `device_security`. 5 wrong attempts trigger 5-minute `LOCKED_TEMP`. |
| **Expired Challenge (> 60s)** | API rejects with `400 Bad Request: Challenge expired`. Client silently requests new options. |
| **Stolen Device / Employee Dismissal** | Admin clicks "ลบสิทธิ์ Face ID" in Settings; credential is instantly deleted from D1; login attempts immediately fail. |

---

## 7. Verification & Acceptance Criteria

1. **AC-01 (Admin Registration)**: Admin can successfully register biometrics on iOS Safari, Android Chrome, and Windows Hello.
2. **AC-02 (Cashier Rejection)**: Non-admin/manager roles are prevented from accessing biometric enrollment and informed to use their 6-digit PIN.
3. **AC-03 (Two-Factor Verification)**: Successful login strictly requires BOTH valid biometric assertion AND matching Quick PIN.
4. **AC-04 (Device Lock Persistence)**: If a device is locked, biometric login is blocked and countdown is displayed.
5. **AC-05 (Revocation)**: Deleted credentials cannot be used to authenticate.
