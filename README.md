# CyberShield — Closed-Loop Cyber Defense & Financial Fraud Platform

> **Project Mandate**: An independent, multi-tenant, explainable, self-hostable cybersecurity detection and incident-readiness ecosystem engineered for Ethiopian critical infrastructure and digital finance operators.  
> **Regulatory Alignment**: INSA Critical Infrastructure Cybersecurity Proclamation No. 1426/2026 & National Bank of Ethiopia (NBE) Cyber Risk Directives.

---

## 1. Cloud Deployment Directory & System Endpoints

All systems comprising the CyberShield ecosystem are deployed in public cloud production and operational:

### Master Deployment Matrix

| Component | Platform / Host | Production URL & Deep Links | Cloud Management / Dashboard | Health & Status |
| :--- | :--- | :--- | :--- | :--- |
| **Ethio-Cyber-Shield (ECS)**<br>*SOC Console & Detection Engine* | **Render Cloud**<br>(Region: Oregon, USA)<br>Plan: `free`<br>Runtime: Python 3.12 | 🌐 **Primary Web Console**:<br>[https://ethio-cyber-shield.onrender.com](https://ethio-cyber-shield.onrender.com)<br><br>📊 **Direct Page Deep-Links**:<br>• [Overview / KPI Dashboard](https://ethio-cyber-shield.onrender.com/dashboard.html)<br>• [Live Alert Triage](https://ethio-cyber-shield.onrender.com/alerts.html)<br>• [Incident Management](https://ethio-cyber-shield.onrender.com/incidents.html)<br>• [Threat Intelligence Feed](https://ethio-cyber-shield.onrender.com/intelligence.html)<br>• [Hash-Sealed Audit Trail](https://ethio-cyber-shield.onrender.com/audit.html)<br>• [Rules & Connectors](https://ethio-cyber-shield.onrender.com/settings.html)<br>• [Operator Login](https://ethio-cyber-shield.onrender.com/login.html)<br><br>🩺 **Live Health API**:<br>[https://ethio-cyber-shield.onrender.com/api/health](https://ethio-cyber-shield.onrender.com/api/health) | [Render Service Dashboard](https://dashboard.render.com/web/srv-dbefu6ss728c73c47d3g)<br>Service ID: `srv-dbefu6ss728c73c47d3g` | **Operational**<br>`HTTP/2 200 OK`<br>(Database 1ms latency, Redis streams active) |
| **ECS Managed PostgreSQL**<br>*Relational Datastore & RLS* | **Render Cloud**<br>(Region: Oregon, USA)<br>Engine: PostgreSQL 18 | `postgresql://ecs_admin:...@dpg-dbefthom7kps73dp2bn0-a/ecs_db`<br>*(SSL Encrypted, Multi-Tenant RLS Enabled)* | [Render Postgres Dashboard](https://dashboard.render.com/d/dpg-dbefthom7kps73dp2bn0-a)<br>Instance ID: `dpg-dbefthom7kps73dp2bn0-a` | **Available**<br>Schema initialized (`init.sql`) |
| **ECS Managed Redis**<br>*Durable Streams & Velocity Cache* | **Render Cloud**<br>(Region: Oregon, USA)<br>Engine: Redis 8.1.10 | `redis://red-dbeftkjncjis73e4gsb0:6379`<br>*(Bounded Streams & LRU Eviction)* | [Render Redis Dashboard](https://dashboard.render.com/d/red-dbeftkjncjis73e4gsb0)<br>Instance ID: `red-dbeftkjncjis73e4gsb0` | **Available**<br>Stream engine online |
| **HonorPay Digital Banking**<br>*Protected Target Financial System* | **Vercel Cloud**<br>Serverless Edge<br>Framework: TanStack Start | 🌐 **Primary Banking Application**:<br>[https://honorpay-banking.vercel.app](https://honorpay-banking.vercel.app)<br><br>🏦 **Portal Deep-Links**:<br>• [Customer Login Portal](https://honorpay-banking.vercel.app/login)<br>• [Employee Portal](https://honorpay-banking.vercel.app/employee)<br>• [Red Team Attack Lab (`/admin/lab`)](https://honorpay-banking.vercel.app/admin/lab) | [Vercel Project Dashboard](https://vercel.com/rammisos-projects/honorpay)<br>Project: `honorpay`<br>Team: `rammisos-projects` | **Operational**<br>`HTTP/2 200 OK` |
| **Source Code Repositories** | **GitHub** | 📦 **Ethio-Cyber-Shield Core**:<br>[https://github.com/bermuro95-wq/Ethio-Cyber-Shield](https://github.com/bermuro95-wq/Ethio-Cyber-Shield) *(Branch: `v3-independent`)*<br><br>📦 **HonorPay Target System**:<br>[https://github.com/Rammiso/targetsys](https://github.com/Rammiso/targetsys) *(Branch: `main`)* | GitHub Version Control | **Up to Date** |

---

### Operator Access Credentials

The following credentials are pre-seeded into the production database with bcrypt encryption:

| Role / Authority | Username / Email | Password | Access Level & Scope |
| :--- | :--- | :--- | :--- |
| **Lead SOC Administrator** | `admin@shieldbank.test` | `Testbed#2026` | Full SOC triage, alert resolution, containment execution |
| **Ethio Cyber Shield Lead** | `admin@ethiocybershield.et` | `Testbed#2026` | Super-admin, multi-tenant governance, rule configuration |
| **HonorPay Security Admin** | `admin@honorpay.et` | `Testbed#2026` | Target system telemetry auditor, outbox monitor |

> [!TIP]
> The login screen at [https://ethio-cyber-shield.onrender.com/login.html](https://ethio-cyber-shield.onrender.com/login.html) includes **1-click quick-fill credential chips** for testing.

---

## 2. Platform Architecture & Ecosystem

CyberShield comprises two decoupled, interconnected systems forming an automated closed-loop defense pipeline:

```
┌────────────────────────────────────────────────────────────────────────┐
│             HONORPAY DIGITAL BANKING TESTBED (targetsys)                │
│  • Customer Banking Portal (Accounts, Transfers, Mobile Money)         │
│  • Transactional Security Outbox (HMAC-SHA256 Signed Telemetry)        │
│  • Closed-Loop Mitigation Webhooks (Idempotent Rollbacks)              │
│  • Built-in Attack Simulation Lab (/admin/lab)                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
       1. Signed Security Telemetry │ 3. Closed-Loop Containment Actions
          (Logins, Tx, IDOR, ATO)   │    (Freeze Tx, Block IP, Kill Sess)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   ETHIO-CYBER-SHIELD DEFENSE PLATFORM                  │
├────────────────────────────────────────────────────────────────────────┤
│  • Bounded Stream Ingest (Redis Streams / Transactional Outbox)        │
│  • Multi-Tier Declarative Detection Hierarchy (L1 → L2 → L3 → L4)      │
│  • Multi-Factor Explainable Risk Scoring Engine (0 to 100)             │
│  • Reversible Automated Mitigation Dispatcher (Progressive Postures)   │
│  • SHA-256 Hash-Sealed Cryptographic Audit Trail                       │
│  • INSA / NBE 48-Hour Incident Regulatory Dossier Exporter             │
│  • Minimalist Institutional SOC Console + Web Audio Threat Sirens      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Repository Structure

```
.
├── README.md                            # Master project submission overview (this document)
├── INTEGRATION_GUIDE.md                 # Universal System Integration Guide (Node, Python, Java, Go, cURL)
├── Ethio-Cyber_Shield_SRS.docx          # Master Software Requirements Specification
│
├── Ethio-Cyber-Shield/                  # Core Cybersecurity Platform
│   ├── backend/                         # Flask API engine, Gunicorn runners
│   ├── core/                            # Detection engine, risk model, rules, connectors
│   │   ├── app/                         # App factories, unified static serving, RLS
│   │   ├── rules/                       # Declarative YAML detection rules (L1 - L4)
│   │   └── tests/                       # Unit, integration & multi-tenancy isolation tests
│   ├── deploy/                          # Deployment manifests (Postgres init.sql, Redis)
│   ├── docs/                            # Comprehensive documentation suite:
│   │   ├── DECISIONS.md                 # Architecture Decision Records (ADR-001 - ADR-044)
│   │   ├── PROGRESS.md                  # Detailed milestone & delivery progress log
│   │   ├── THREAT_MODEL.md              # STRIDE threat model & attack surface analysis
│   │   ├── RISK_MODEL_V2.md             # Risk scoring mathematical specification
│   │   ├── FULL_SYSTEM_SETUP_AND_RUN_GUIDE.md # Exhaustive local setup guide
│   │   └── COMPLIANCE_SUPPORT.md        # INSA & NBE regulatory mapping
│   ├── ui/                              # High-contrast institutional SOC web console
│   │   ├── css/style.css                # Minimalist SOC design system (CrowdStrike/Datadog standard)
│   │   ├── js/                          # Dynamic ticker, Web Audio sirens, modal dossiers
│   │   ├── dashboard.html               # Live operations overview & KPI cards
│   │   ├── alerts.html                  # Alert triage, time-attacked tickers, dossiers
│   │   ├── incidents.html               # Formal incident management & 48-hr exports
│   │   ├── intelligence.html            # IOC indicator database & community feed
│   │   ├── audit.html                   # Hash-sealed tamper-evident audit trail
│   │   └── settings.html                # Declarative rules & connector settings
│   ├── ATTACK_TESTING_GUIDE.md          # 28-scenario end-to-end red team verification guide
│   ├── render.yaml                      # Render Blueprint infrastructure-as-code
│   └── requirements.txt                 # Python platform dependencies
│
└── targetsys/                           # Protected Digital Banking Target (HonorPay)
    ├── src/                             # Customer portal, transfer engine, admin lab
    │   ├── components/                  # UI components, security warnings, device trackers
    │   └── routes/                      # Banking routes, admin portal, lab simulators
    ├── drizzle/                         # Banking schema migrations
    ├── vercel.json                      # Vercel deployment configuration
    └── package.json                     # Node / Bun dependencies
```

---

## 4. Integrating Any External System with ECS

ECS is designed to integrate into **any external banking system, payment gateway, microservice, or web application** in under 15 minutes.

For detailed architecture diagrams, canonical schemas, and copy-paste code snippets, see the comprehensive **[`INTEGRATION_GUIDE.md`](INTEGRATION_GUIDE.md)**:

- ⚡ **10-Second Quickstart**: cURL test commands with automated HMAC-SHA256 signature generation.
- 📦 **Supported Frameworks**: Drop-in code for **Node.js/TypeScript**, **Python (Flask/FastAPI)**, **Java/Spring Boot**, **Go (Golang)**, and **PHP**.
- 🔌 **No-Code Webhooks**: Pre-configured JSON field mapping for **telebirr**, **EthSwitch**, **Temenos T24**, and **Stripe**.
- 🛡️ **Closed-Loop Containment**: How target applications implement the `POST /api/security/mitigate` webhook to receive automated account freezes, session kills, and step-up OTP challenges with idempotent rollback (`/revert`).


---

## 5. Quick Start — Local Development

Both platforms can be run concurrently on a single machine:

### 1. Start Ethio-Cyber-Shield (ECS)
```bash
# Terminal 1: ECS Backend API (Port 5000)
cd Ethio-Cyber-Shield/backend
python run.py

# Terminal 2: ECS SOC Console (Port 5500)
cd Ethio-Cyber-Shield/ui
python3 -m http.server 5500
```

### 2. Start HonorPay Banking (Target)
```bash
# Terminal 3: HonorPay Banking (Port 8080)
cd targetsys
npm run dev
```

Open your browser to:
- **ECS SOC Console**: `http://localhost:5500`
- **HonorPay Banking App**: `http://localhost:8080`

---

## 6. Security & Verification Test Suites

### ECS Backend Unit & Multi-Tenancy Tests
```bash
cd Ethio-Cyber-Shield/core
source venv/bin/activate
PYTHONPATH=. python -m unittest tests/test_part7_multi_tenancy_isolation.py -v
```

### HonorPay Banking Tests
```bash
cd targetsys
npm run test
```

### End-to-End Attack Simulation (28 Scenarios)
ECS has been verified against **28 distinct attack scenarios** encompassing injection attacks, credential stuffing, rapid fund draining, account takeovers, and insider threats. Complete simulation instructions and Burp Suite request scripts are documented in [`Ethio-Cyber-Shield/ATTACK_TESTING_GUIDE.md`](Ethio-Cyber-Shield/ATTACK_TESTING_GUIDE.md).

---

## 7. Regulatory & Engineering Compliance


- **Explainability**: Every detection displays exact condition trees and raw signed event payloads.
- **Strict Tenancy**: Every database table enforces `organization_id UUID NOT NULL` with PostgreSQL RLS policies.
- **Evidence Integrity**: All telemetry, evaluations, and containment actions are sealed with SHA-256 cryptographic hashes.
- **National Context**: Native support for Ethiopian Birr (ETB), `Africa/Addis_Ababa` (UTC+3) timestamps, EthSwitch payment rails, and 48-hour regulatory reporting.
