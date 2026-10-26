# HonorPay Digital Banking Platform — Developer & Engineering Guidelines

> **System Designation**: Protected Financial Target Infrastructure & Telemetry Testbed  
> **Institutional Submission**: Official Verification Target submitted to the **Information Network Security Administration (INSA)**, Federal Democratic Republic of Ethiopia.  
> **Project Authors**: Musab Hassen Aliyi (`CTC-384-26`), Osman Mohammed Seid (`CTC-2974-26`), Kedist Eyasu Embaye (`CTC-1247-26`), Yoseph Abebe Ersedo (`CTC-430-26`), Omer Mohammed Seid (`CTC-3716-26`), Efrem Mola Genebo (`CTC-4772-26`).  
> **Official Monorepo**: [https://github.com/Rammiso/ethio-cybershield](https://github.com/Rammiso/ethio-cybershield) *(Directory: `targetsys/`)*  
> **Production Deployment**: [https://honorpay-banking.vercel.app](https://honorpay-banking.vercel.app)

---

## 1. Engineering Principles

1. **Strict Type Safety**: All TypeScript files must compile cleanly under `strict` mode with zero `any` shortcuts.
2. **Deterministic Ledger Movement**: All financial operations must use atomic database functions with balance checks, idempotency keys, and explicit audit logging.
3. **Telemetry Completeness**: Any new route or API endpoint must be wrapped with the `withTelemetry` middleware to maintain 100% observability across customer and administrative actions.
4. **Edge Compatibility**: Keep server code compatible with Vercel Edge runtime (Web Crypto API, Web Streams, standard Fetch API).

---

## 2. Local Verification Commands

```bash
# Install dependencies
bun install   # or npm install

# Run automated test suites (112 tests across banking, security, and outbox telemetry)
npm run test

# Run local development server
npm run dev
```
