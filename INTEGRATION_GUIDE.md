# Ethio-Cyber-Shield (ECS) — Universal System Integration Guide

> **Target Audience**: Financial Technology Engineers, Core Banking Developers (CBE, Awash, Dashen, CoOP), Payment System Operators (EthSwitch, telebirr, M-PESA), and Critical Infrastructure Admins.  
> **Mandate**: Real-time fraud detection, account takeover (ATO) defense, and automated statutory 48-hour incident readiness under **INSA Proclamation No. 1426/2026** and **NBE Directives**.  
> **Live Cloud Integration Endpoint**: `https://ethio-cyber-shield.onrender.com/api/events`

---

## 1. Executive Summary: 3-Step Integration in 15 Minutes

Integrating **Ethio-Cyber-Shield (ECS)** into any external digital banking app, payment gateway, microservice, or web application requires three basic steps:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        YOUR APPLICATION / SERVICE                      │
├───────────────────────────────────┬────────────────────────────────────┤
│ 1. EMIT SECURITY TELEMETRY        │ 2. HANDLE MITIGATION ACTIONS       │
│    Send structured events         │    (Optional) Receive automated    │
│    (Login, Transfer, Device, OTP) │    containment webhooks            │
└─────────────────┬─────────────────┴──────────────────▲─────────────────┘
                  │                                    │
                  │ HTTPS POST /api/events             │ HTTPS POST /api/mitigate
                  │ (Canonical HMAC-SHA256)            │ (Freeze, Block, Kill)
                  ▼                                    │
┌──────────────────────────────────────────────────────┴─────────────────┐
│                   ETHIO-CYBER-SHIELD DEFENSE PLATFORM                  │
│     Real-Time Ingestion • L1-L4 Detection • 0-100 Risk Scoring         │
│         48-Hour Incident Dossiers • Immutable Audit Trail              │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Obtain API Credentials**: Acquire your tenant's `key_id` and `secret_key` from the ECS SOC console.
2. **Forward Security Telemetry**: Push signed canonical events via `POST /api/events` (or configure a generic inbound webhook via `POST /api/webhooks/inbound/<source_id>`).
3. **Expose Containment Webhook (Optional)**: Implement a lightweight webhook endpoint to receive automated or human-approved defense mitigations (e.g. freeze account, terminate session, require step-up OTP).

---

## 2. Integration Topologies

ECS supports four flexible ingestion topologies to suit any architecture or firewall policy:

| Topology | Best For | Transport / Protocol | Authentication |
| :--- | :--- | :--- | :--- |
| **Direction A: Telemetry Push** *(Recommended)* | Modern Web Apps, Mobile Backends, Microservices | `POST /api/events` | Canonical HMAC-SHA256 |
| **Direction B: Background Poller** | Air-gapped or Strict Inbound-Only Bank Firewalls | ECS pulls from `GET /api/public/security/events` | HMAC-SHA256 Poller Token |
| **Inbound Webhooks (No-Code Mapper)** | telebirr, EthSwitch, Temenos T24, Stripe, Core Banking | `POST /api/webhooks/inbound/<source_id>` | Webhook Signature / API Key |
| **Log Agent Collector** | Linux Syslog, NGINX / Apache Proxies, Auth Servers | `POST /api/log-agent/collect` | Bearer Agent Token |

---

## 3. The Canonical Event Contract (v1.1)

All security telemetry pushed to ECS follows the **Canonical Security Event Contract**. 

### Ethiopian Zero-PII Compliance Rule
Under the **Ethiopian Personal Data Protection Proclamation No. 1321/2024**, **never transmit plaintext customer phone numbers, Fayda National IDs, or sensitive account numbers**. Always apply SHA-256 keyed hashing:
- `msisdn_hash`: `SHA-256(phone_number)` (e.g. `+251911223344` &rarr; `e3b0c44298fc...`)
- `national_id_hash`: `SHA-256(fayda_kebele_id)`
- `counterparty_ref_hash`: `SHA-256(destination_account)`

### Standard Event Schema (JSON)

```json
{
  "event_id": "evt-77291a82-1234-4567-89ab-cdef01234567",
  "event_type": "transaction.transfer.created",
  "timestamp": "2026-10-24T19:25:00.000000Z",
  "severity": "HIGH",
  "result": "SUCCESS",
  "source_system": "cbe-mobile-banking",
  "channel": "mobile",
  "payment_rail": "wallet",
  "amount_minor": 25000000,
  "currency": "ETB",
  "user_id_pub": "USR_99281",
  "account_id_pub": "ACC_1002938475",
  "msisdn_hash": "a4b2c1d3e5f6...7890",
  "national_id_hash": "f8e7d6c5b4a3...2109",
  "counterparty_ref_hash": "c3d2e1f0...4567",
  "ip_address": "197.156.104.12",
  "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  "device_fingerprint": "dfp_a9928b12f4510",
  "attributes": {
    "step_up_mfa_performed": false,
    "device_is_new": true,
    "daily_velocity_count": 8,
    "payment_note": "Emergency business transfer"
  }
}
```

### Supported Event Types

| Category | Event Type String | Triggers in ECS Detection Engine |
| :--- | :--- | :--- |
| **Authentication** | `auth.login.success`<br>`auth.login.failed`<br>`auth.password_reset`<br>`auth.mfa_stepup` | L2 Credential Stuffing, Brute-Force, L4 Account Takeover (ATO) |
| **Financial / Fraud** | `transaction.transfer.created`<br>`transaction.high_value`<br>`transaction.rapid_drain`<br>`transaction.failed` | L2 High-Velocity Burst, L3 Structuring / Smurfing, Rapid Drain |
| **Session & Device** | `session.created`<br>`device.fingerprint_changed`<br>`session.sim_swap_detected` | L3 Cross-Tenant Device Sharing, L4 Multi-Stage ATO Chains |
| **Web & API Security** | `api.idor_attempt`<br>`web.sqli_detected`<br>`api.rate_limit_exceeded` | L1 Deterministic Payload Injection, API Parameter Tampering |
| **Privilege / Admin** | `admin.user_elevated`<br>`admin.audit_tamper_attempt`<br>`admin.mfa_bypass` | Insider Threat Escalation, High-Risk Role Tampering |

---

## 4. Cryptographic Authentication & Anti-Replay Handshake

All API calls to `POST /api/events` must supply four standard HTTP headers:

| Header Name | Type | Value & Rule |
| :--- | :--- | :--- |
| `X-ECS-Key-Id` | String | Public API key identifier assigned to your organization (e.g. `cbe_prod_key_01`) |
| `X-ECS-Timestamp` | Integer | Current UNIX epoch timestamp in seconds. Clock skew must be **&le; 300 seconds**. |
| `X-ECS-Nonce` | UUID | Unique cryptographically random UUID v4 string. Reused nonces are rejected (401). |
| `X-ECS-Signature` | Hex String | Hex-encoded HMAC-SHA256 signature calculated over the canonical string. |

### Canonical Signature String Format
The signature is generated by computing:
```
HMAC-SHA256(secret_key, canonical_string)
```
Where `canonical_string` is:
```
{timestamp}\n{nonce}\n{HTTP_METHOD}\n{REQUEST_PATH}\n{SHA256_HEX(request_body)}
```

---

## 5. Multi-Language Drop-In Code Examples

### 5.1 cURL / Shell (Immediate 10-Second Test)

```bash
# 1. Set credentials and timestamp
SECRET="super-secret-key-32b"
KEY_ID="demo_banking_key"
TIMESTAMP=$(date +%s)
NONCE=$(uuidgen)
PATH_URL="/api/events"

# 2. Formulate JSON payload
BODY='{"event_type":"transaction.transfer.created","amount_minor":5000000,"currency":"ETB","user_id_pub":"USR_101","device_fingerprint":"dev_iphone_15","ip_address":"197.156.104.5","severity":"HIGH","channel":"mobile","payment_rail":"p2p"}'

# 3. Calculate SHA256 of body and canonical signature
BODY_HASH=$(echo -n "$BODY" | sha256sum | awk '{print $1}')
CANONICAL="${TIMESTAMP}\n${NONCE}\nPOST\n${PATH_URL}\n${BODY_HASH}"
SIGNATURE=$(echo -en "$CANONICAL" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')

# 4. Dispatch to ECS Cloud
curl -X POST "https://ethio-cyber-shield.onrender.com${PATH_URL}" \
  -H "Content-Type: application/json" \
  -H "X-ECS-Key-Id: ${KEY_ID}" \
  -H "X-ECS-Timestamp: ${TIMESTAMP}" \
  -H "X-ECS-Nonce: ${NONCE}" \
  -H "X-ECS-Signature: ${SIGNATURE}" \
  -d "$BODY"
```

---

### 5.2 Node.js / TypeScript (Express, Next.js, Fastify)

Create an integration utility `ecsClient.ts`:

```typescript
import crypto from 'crypto';

interface ECSEventPayload {
  event_type: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  user_id_pub?: string;
  amount_minor?: number;
  currency?: string;
  device_fingerprint?: string;
  ip_address?: string;
  channel?: 'mobile' | 'web' | 'ussd' | 'branch';
  payment_rail?: 'p2p' | 'wallet' | 'interbank' | 'card';
  attributes?: Record<string, any>;
}

export class ECSClient {
  constructor(
    private ecsUrl: string,
    private keyId: string,
    private secretKey: string
  ) {}

  public hashPII(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  public async emitEvent(event: ECSEventPayload): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    const path = '/api/events';
    const bodyStr = JSON.stringify(event);

    const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
    const canonical = `${timestamp}\n${nonce}\nPOST\n${path}\n${bodyHash}`;
    const signature = crypto.createHmac('sha256', this.secretKey).update(canonical).digest('hex');

    try {
      const res = await fetch(`${this.ecsUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ECS-Key-Id': this.keyId,
          'X-ECS-Timestamp': timestamp,
          'X-ECS-Nonce': nonce,
          'X-ECS-Signature': signature,
        },
        body: bodyStr,
      });

      if (!res.ok) {
        console.error(`ECS Ingestion Warning: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('ECS Network Error (Enqueue in outbox recommended):', err);
    }
  }
}

// Example Usage in Banking Controller:
const ecs = new ECSClient(
  'https://ethio-cyber-shield.onrender.com',
  'honorpay_key_01',
  process.env.ECS_TARGET_SECRET!
);

export async function onTransferCreated(req: any) {
  await ecs.emitEvent({
    event_type: 'transaction.transfer.created',
    amount_minor: req.body.amount * 100, // ETB cents
    currency: 'ETB',
    user_id_pub: req.user.id,
    device_fingerprint: req.headers['x-device-fingerprint'],
    ip_address: req.ip,
    channel: 'mobile',
    payment_rail: 'p2p',
    attributes: { destination_account_hash: ecs.hashPII(req.body.destinationAccount) }
  });
}
```

---

### 5.3 Python (Flask, FastAPI, Django)

Create a lightweight client `ecs_client.py`:

```python
import time
import uuid
import hmac
import hashlib
import json
import requests
import logging

logger = logging.getLogger("ecs_client")

class ECSClient:
    def __init__(self, ecs_url: str, key_id: str, secret_key: str):
        self.ecs_url = ecs_url.rstrip('/')
        self.key_id = key_id
        self.secret_key = secret_key

    @staticmethod
    def hash_pii(value: str) -> str:
        """Hash sensitive PII (Phone, Fayda ID, Account) per Ethiopian PDPP."""
        return hashlib.sha256(value.encode('utf-8')).hexdigest()

    def send_event(self, event_data: dict) -> bool:
        timestamp = str(int(time.time()))
        nonce = str(uuid.uuid4())
        path = "/api/events"
        body_bytes = json.dumps(event_data).encode('utf-8')

        body_hash = hashlib.sha256(body_bytes).hexdigest()
        canonical = f"{timestamp}\n{nonce}\nPOST\n{path}\n{body_hash}"
        signature = hmac.new(self.secret_key.encode('utf-8'), canonical.encode('utf-8'), hashlib.sha256).hexdigest()

        headers = {
            "Content-Type": "application/json",
            "X-ECS-Key-Id": self.key_id,
            "X-ECS-Timestamp": timestamp,
            "X-ECS-Nonce": nonce,
            "X-ECS-Signature": signature
        }

        try:
            resp = requests.post(f"{self.ecs_url}{path}", data=body_bytes, headers=headers, timeout=3.0)
            return resp.status_code == 200
        except Exception as e:
            logger.warning(f"ECS Event dispatch failed: {e}")
            return False

# Usage in Flask / FastAPI Route:
client = ECSClient("https://ethio-cyber-shield.onrender.com", "cbe_key", "secret-32b")

client.send_event({
    "event_type": "auth.login.failed",
    "user_id_pub": "USR_88291",
    "ip_address": "197.156.104.99",
    "device_fingerprint": "dfp_android_14",
    "channel": "mobile",
    "attributes": {"failure_reason": "invalid_pin", "attempt_count": 3}
})
```

---

### 5.4 Java / Spring Boot (Ethiopian Enterprise Banking Standard)

```java
package et.bank.security;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.http.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.UUID;
import java.util.Map;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class ECSService {
    private final String ecsUrl = "https://ethio-cyber-shield.onrender.com";
    private final String keyId = "awash_core_key";
    private final String secretKey = "your-32-byte-secret-key";
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper mapper = new ObjectMapper();

    public void emitSecurityEvent(Map<String, Object> event) {
        try {
            String timestamp = String.valueOf(Instant.now().getEpochSecond());
            String nonce = UUID.randomUUID().toString();
            String path = "/api/events";
            String jsonBody = mapper.writeValueAsString(event);

            // 1. Calculate SHA-256 of body
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = sha.digest(jsonBody.getBytes(StandardCharsets.UTF_8));
            StringBuilder bodyHash = new StringBuilder();
            for (byte b : hashBytes) bodyHash.append(String.format("%02x", b));

            // 2. Canonical string
            String canonical = timestamp + "\n" + nonce + "\nPOST\n" + path + "\n" + bodyHash;

            // 3. HMAC-SHA256 signature
            Mac hmac = Mac.getInstance("HmacSHA256");
            hmac.init(new SecretKeySpec(secretKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] sigBytes = hmac.doFinal(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder signature = new StringBuilder();
            for (byte b : sigBytes) signature.append(String.format("%02x", b));

            // 4. Send Request
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            headers.set("X-ECS-Key-Id", keyId);
            headers.set("X-ECS-Timestamp", timestamp);
            headers.set("X-ECS-Nonce", nonce);
            headers.set("X-ECS-Signature", signature.toString());

            HttpEntity<String> request = new HttpEntity<>(jsonBody, headers);
            restTemplate.postForEntity(ecsUrl + path, request, String.class);
        } catch (Exception e) {
            System.err.println("Failed to forward telemetry to ECS: " + e.getMessage());
        }
    }
}
```

---

### 5.5 Go (Golang) — Payment Switches & High-Throughput APIs

```go
package ecs

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type Client struct {
	BaseURL   string
	KeyID     string
	SecretKey string
	HTTP      *http.Client
}

func (c *Client) SendEvent(event map[string]interface{}) error {
	bodyBytes, err := json.Marshal(event)
	if err != nil {
		return err
	}

	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	nonce := uuid.New().String()
	path := "/api/events"

	// 1. SHA256 of Body
	bodyHash := sha256.Sum256(bodyBytes)
	bodyHashHex := hex.EncodeToString(bodyHash[:])

	// 2. Canonical String & HMAC-SHA256
	canonical := fmt.Sprintf("%s\n%s\nPOST\n%s\n%s", timestamp, nonce, path, bodyHashHex)
	mac := hmac.New(sha256.New, []byte(c.SecretKey))
	mac.Write([]byte(canonical))
	sigHex := hex.EncodeToString(mac.Sum(nil))

	req, err := http.NewRequest("POST", c.BaseURL+path, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-ECS-Key-Id", c.KeyID)
	req.Header.Set("X-ECS-Timestamp", timestamp)
	req.Header.Set("X-ECS-Nonce", nonce)
	req.Header.Set("X-ECS-Signature", sigHex)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("ECS responded with status: %d", resp.StatusCode)
	}
	return nil
}
```

---

## 6. Closed-Loop Automated Mitigation Webhook

When ECS identifies high-confidence attacks, it dispatches an automated or analyst-approved mitigation payload to your registered webhook:

### Target Mitigation Endpoint: `POST /api/security/mitigate`

ECS calls your application with:

```json
{
  "action": "FREEZE_ACCOUNT",
  "target_identifier": "ACC_1002938475",
  "user_id": "USR_99281",
  "reason": "Account Takeover (ATO) chain detected: rapid password reset followed by high-value transfer",
  "incident_id": "inc-4a91b2c3-1234-5678-abcd-0123456789ab",
  "risk_score": 92,
  "requires_approval": false,
  "rollback_token": "rbk-9918274a"
}
```

### Supported Actions & Handling

| Action Code | Recommended Handling in Your Application |
| :--- | :--- |
| `FREEZE_ACCOUNT` | Set account status to `LOCKED_SUSPICIOUS`. Prevent debit transactions while allowing inquiries. |
| `FREEZE_TRANSACTION` | Put transaction in `HELD_FOR_AML_REVIEW` before dispatching to EthSwitch. |
| `TERMINATE_SESSION` | Invalidate JWT tokens / active Redis sessions for the compromised device fingerprint. |
| `REQUIRE_STEP_UP_OTP`| Force mandatory SMS / Authenticator OTP challenge on next action. |
| `BLOCK_IP` | Drop requests from the attacker IP at the API Gateway or WAF level. |

### Reversibility / Rollback Guarantee
If an analyst dismisses a false positive, ECS calls `POST /api/security/mitigate/revert` with the `rollback_token`. Your application can revert the account back to `ACTIVE` state with 100% idempotency.

---

## 7. No-Code Inbound Webhook Integration (telebirr, EthSwitch, Stripe, Temenos)

If you use third-party payment gateways or core banking engines that emit predefined webhook payloads, you do **not** need to write custom integration code.

Use the **Inbound Webhook Mapper**:
1. Open the ECS SOC Console &rarr; **Settings & Rules** &rarr; **Webhook Sources**.
2. Click **Create Webhook Source** and select your provider (telebirr, EthSwitch, Temenos, Custom).
3. ECS generates a public inbound URL:
   `https://ethio-cyber-shield.onrender.com/api/webhooks/inbound/<source_id>`
4. Enter the JSON field path mappings in the ECS UI:
   - `amount_minor` &rarr; `payload.transaction.amount * 100`
   - `user_id_pub` &rarr; `payload.customer_id`
   - `event_type` &rarr; `"transaction.transfer.created"`
5. Paste the webhook URL into your provider's developer portal. ECS will normalize and detect incoming events automatically.

---

## 8. Verification & 60-Second Sanity Test

Once integrated, test end-to-end detection:

1. **Send a High-Velocity Transfer Event**: Use the cURL command in Section 5.1 with `amount_minor: 95000000` (950,000 ETB).
2. **Open the SOC Console**: Navigate to [https://ethio-cyber-shield.onrender.com/alerts.html](https://ethio-cyber-shield.onrender.com/alerts.html).
3. **Verify Detection**:
   - The alert will immediately appear in the alert feed with its explainable risk score (e.g. `Score: 88 - High Value Transfer + Velocity`).
   - The browser Web Audio API will chime/siren with the threat severity level.
   - The real-time ticking clock will display elapsed time (`Just now`, `5s ago`).
4. **Inspect Attack Dossier**: Click **Inspect Dossier** to view the full condition breakdown, raw signed payload, and automated containment options.
