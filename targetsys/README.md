# HonorPay Digital Banking Platform (`targetsys`)

> **Protected Banking Infrastructure & Security Telemetry Testbed**  
> Designed for **Ethio-Cyber-Shield (ECS)** closed-loop detection and incident-readiness verification.  
> **Institutional Submission**: Official Verification Target submitted to the **Information Network Security Administration (INSA)**, Federal Democratic Republic of Ethiopia.  
> **Official Monorepo**: [https://github.com/Rammiso/ethio-cybershield](https://github.com/Rammiso/ethio-cybershield) *(Directory: `targetsys/`)*  
> **Live Production Deployment**: [https://honorpay-banking.vercel.app](https://honorpay-banking.vercel.app)

---

## Project Authors & Research Engineering Team

This target banking platform and security outbox pipeline were engineered and submitted to **INSA** by:

| No. | Full Name | Institutional ID | Engineering Role & Specialization |
| :---: | :--- | :---: | :--- |
| **1** | **Musab Hassen Aliyi** | **CTC-384-26** | **Lead System Architect & Project Coordinator** — Full-stack architecture, outbox telemetry, and cloud infrastructure. |
| **2** | **Osman Mohammed Seid** | **CTC-2974-26** | **Lead Detection Engine & Threat Intelligence Engineer** — Threat event schemas and banking fraud velocity models. |
| **3** | **Kedist Eyasu Embaye** | **CTC-1247-26** | **Security Telemetry & Cryptographic Verification Engineer** — HMAC-SHA256 signature middleware and edge geolocation forwarding. |
| **4** | **Yoseph Abebe Ersedo** | **CTC-430-26** | **SOC Operations & Frontend Visualization Engineer** — Banking UI/UX, customer portal, and responsive transaction flows. |
| **5** | **Omer Mohammed Seid** | **CTC-3716-26** | **Core Backend & Multi-Tenancy Systems Engineer** — Banking ledger database schemas, migrations, and session management. |
| **6** | **Efrem Mola Genebo** | **CTC-4772-26** | **Red Team Operations & Attack Simulation Engineer** — Red team attack simulation lab (`/admin/lab`) and 112 automated test suites. |

---

## 1. System Overview

**HonorPay** is a production-grade Ethiopian commercial digital banking web application built with **TanStack Start**, **React 18**, **Vite**, **TypeScript**, and **Tailwind CSS**. It serves as the realistic financial target infrastructure monitored by Ethio-Cyber-Shield (ECS).

HonorPay operates with Ethiopian banking context:
- Currency: **Ethiopian Birr (ETB)**
- Payment Rails: **P2P Transfers**, **USSD / Mobile Money**, and **EthSwitch Interbank Clearing**
- Timezone: **Africa/Addis_Ababa (UTC+3)**
- Regulatory Alignment: **National Bank of Ethiopia (NBE)** and **INSA Proclamation No. 1426/2026**

---

## 2. Key Architecture & Features

```
┌────────────────────────────────────────────────────────────────────────┐
│                   HONORPAY BANKING PLATFORM (targetsys)                │
├───────────────────────────────────┬────────────────────────────────────┤
│         CUSTOMER PORTAL           │          SECURITY & OPS            │
│  • Account Overview & History     │  • Transactional Outbox Pattern    │
│  • P2P / Mobile Money Transfers   │  • Canonical HMAC-SHA256 Signatures│
│  • Device Fingerprint Tracking    │  • Closed-Loop Mitigation Receiver │
│  • Step-Up OTP Verification       │  • Red Team Attack Lab (/admin/lab)│
└───────────────────────────────────┴────────────────────────────────────┘
                                    │
                                    ▼ Telemetry Events (HMAC-SHA256)
┌────────────────────────────────────────────────────────────────────────┐
│                   ETHIO-CYBER-SHIELD DEFENSE PLATFORM                  │
│       Detects • Evaluates (0-100) • Alerts • Dispatches Containment    │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Transactional Security Outbox**:
   - Every financial transaction, authentication attempt, device switch, and administrative operation generates structured security telemetry stored in an outbox stream.
   - Outbox deliveries to ECS are cryptographically signed with HMAC-SHA256 and include monotonically increasing nonces to prevent replay attacks.
2. **Closed-Loop Mitigation Receiver**:
   - Exposes authenticated containment endpoints for ECS:
     - `FREEZE_ACCOUNT` / `FREEZE_TRANSACTION`
     - `TERMINATE_SESSION`
     - `REQUIRE_STEP_UP_OTP`
     - `BLOCK_IP`
   - All containment actions support safe, idempotent rollbacks (`REVERT`).
3. **Interactive Attack Simulation Lab**:
   - Dedicated administrative lab console (`/admin/lab`) providing 1-click simulation for 28 distinct financial fraud, account takeover (ATO), and web application attack vectors.

---

## 3. Technology Stack

- **Framework**: TanStack Start + React 18 + TypeScript
- **Bundler & Tooling**: Vite 5, Bun / Node.js
- **Styling**: Tailwind CSS, Lucide Icons, Radix UI primitives
- **ORM & Data**: Drizzle ORM, Web Crypto API
- **Cloud Hosting**: Vercel (Edge-ready Nitro output)

---

## 4. Getting Started Locally

### Prerequisites
- Node.js 18+ or Bun
- npm or bun package manager

### Installation & Run
```bash
cd targetsys

# Install dependencies
npm install

# Run development server (Port 8080)
npm run dev
```

Visit `http://localhost:8080` in your browser.

---

## 5. Test Suites

Run the automated test suite (109 unit & integration tests):
```bash
npm run test
```

---

## 6. Cloud Deployment & Connected Ecosystem

HonorPay Digital Banking is deployed in public cloud production on **Vercel Edge**:

| Endpoint / Service | Cloud Provider | Direct URL | Description |
| :--- | :--- | :--- | :--- |
| **Primary Banking Application** | **Vercel** | [https://honorpay-banking.vercel.app](https://honorpay-banking.vercel.app) | Live customer digital banking portal |
| • [Customer Login](https://honorpay-banking.vercel.app/login) | Vercel | `/login` | Retail banking sign-in with biometric mock |
| • [Employee Portal](https://honorpay-banking.vercel.app/employee) | Vercel | `/employee` | Teller / branch employee interface |
| • [Red Team Attack Lab](https://honorpay-banking.vercel.app/admin/lab) | Vercel | `/admin/lab` | 28-scenario interactive security attack lab |
| **Connected ECS Defense Platform** | **Render** | [https://ethio-cyber-shield.onrender.com](https://ethio-cyber-shield.onrender.com) | Central SOC threat detection & mitigation platform |
| **Vercel Project Dashboard** | **Vercel** | [Vercel Project Console](https://vercel.com/rammisos-projects/honorpay) | Project: `honorpay` (Team: `rammisos-projects`) |

