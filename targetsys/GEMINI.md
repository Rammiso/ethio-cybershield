# HonorPay Digital Banking Platform — Architecture & Engineering Specification

> **System Designation**: Protected Financial Target Infrastructure & Telemetry Testbed  
> **Institutional Submission**: Official Verification Target submitted to the **Information Network Security Administration (INSA)**, Federal Democratic Republic of Ethiopia.  
> **Project Authors**: Musab Hassen Aliyi (`CTC-384-26`), Osman Mohammed Seid (`CTC-2974-26`), Kedist Eyasu Embaye (`CTC-1247-26`), Yoseph Abebe Ersedo (`CTC-430-26`), Omer Mohammed Seid (`CTC-3716-26`), Efrem Mola Genebo (`CTC-4772-26`).  
> **Official Monorepo**: [https://github.com/Rammiso/ethio-cybershield](https://github.com/Rammiso/ethio-cybershield) *(Directory: `targetsys/`)*  
> **Production Deployment**: [https://honorpay-banking.vercel.app](https://honorpay-banking.vercel.app)

---

## 1. Architectural Mandates & Principles

HonorPay represents a production-grade Ethiopian commercial digital banking web application engineered to generate realistic banking operations and emit structured, cryptographically signed security telemetry to Ethio-Cyber-Shield (ECS).

### Core Engineering Standards
1. **Defensive Programming & Type Safety**:
   - Strict TypeScript configuration across all components, API functions, and database models.
   - Comprehensive boundary validation using Zod schemas for all client and server inputs.
2. **High-Performance Financial Ledger**:
   - Atomic PostgreSQL ledger functions (`SECURITY DEFINER`) with row-level locking for financial balance modifications and transfer settlements.
   - Integer minor units (`santim`) used exclusively for monetary representations, eliminating floating-point rounding errors.
3. **Edge-Compatible Cryptography**:
   - Web Crypto API (`crypto.subtle`) utilized exclusively for cryptographic operations (HMAC-SHA256 signatures, nonce tracking, and token hashing) ensuring zero external binary dependencies on serverless edge environments.
4. **Ethiopian Operational Context**:
   - Display timestamps formatted in `Africa/Addis_Ababa` local time (`UTC+03:00`) stored as `timestamptz`.
   - Native support for Ethiopian Birr (`ETB`) and national payment rails (P2P, USSD, mobile money, and EthSwitch).

---

## 2. Technology Stack

- **Frontend & Fullstack Framework**: TanStack Start (React 18 + TypeScript), TanStack Router (file-based routing), TanStack Query, TanStack Form / Zod.
- **UI & Design System**: Tailwind CSS, Lucide Icons, Radix UI accessible primitives.
- **Backend & Database**: PostgreSQL with Row-Level Security (RLS) and connection pooling.
- **Edge Deployment**: Vercel Serverless Edge (Nitro engine preset).

---

## 3. Security Architecture & Telemetry Pipeline

### Central Telemetry Middleware (`withTelemetry`)
Every server function, transfer route, and authentication endpoint passes through a central telemetry interceptor:
- Automatically extracts request metadata: source IP (`x-forwarded-for`, `x-vercel-forwarded-for`), user agent, device fingerprint hash (`x-device-id`), and session state.
- Edge Geolocation Forwarding: Extracts Vercel and Cloudflare edge headers (`x-vercel-ip-city`, `x-vercel-ip-country-region`, `x-vercel-ip-latitude`, `x-vercel-ip-longitude`) and binds them into event context.
- Enforces active IP blocklists, session revocation states, and velocity rate limits.
- Performs parameter pattern scanning for web application attack vectors (SQLi, XSS, path traversal) and emits structured telemetry events without halting safe transaction flow.

### Transactional Security Outbox
- Telemetry events are queued in an append-only outbox table within the same atomic database transaction as the business operation.
- An asynchronous worker dispatches pending events to ECS via HMAC-SHA256 signed HTTP requests with exponential backoff and replay protection (`X-ECS-Timestamp`, `X-ECS-Nonce`).

### Closed-Loop Mitigation Receiver
Exposes authenticated containment endpoints for ECS:
- `FREEZE_TRANSACTION` / `FREEZE_ACCOUNT`: Immediately locks affected funds or account state.
- `TERMINATE_SESSION`: Invalidates user sessions and authentication tokens.
- `REQUIRE_STEP_UP_OTP`: Enforces secondary authentication challenges on suspicious activity.
- `BLOCK_IP`: Denies network access to abusive source IPs at the application perimeter.
- All containment operations support safe, idempotent rollbacks (`REVERT`).
