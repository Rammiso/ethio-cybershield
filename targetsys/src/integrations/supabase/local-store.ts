// Local In-Memory Supabase Store for ShieldBank Testbed.
// Provides a full PostgREST-compatible query builder and auth store
// for running local development smoothly without requiring external Supabase service role keys.

export interface LocalUser {
  id: string;
  email: string;
  passwordHash: string; // for testbed, raw or hash
  user_metadata: {
    full_name: string;
  };
  role: string;
  aud: string;
  created_at: string;
}

export const DEMO_PASSWORD = "Testbed#2026";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generatePublicId(prefix: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${s}`;
}

export function createMockJwt(user: { id: string; email: string; fullName?: string; role?: string }): {
  accessToken: string;
  refreshToken: string;
} {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      user_metadata: { full_name: user.fullName || "" },
      app_metadata: { provider: "email" },
      iat: now,
      exp: now + 86400 * 30, // 30 days
    }),
  ).toString("base64url");
  const signature = Buffer.from("shieldbank-testbed-local-signature").toString("base64url");
  return {
    accessToken: `${header}.${payload}.${signature}`,
    refreshToken: `sb_refresh_${generateUUID()}`,
  };
}

export function parseMockJwt(token: string): { sub: string; email: string; user_metadata?: any } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1]!, "base64url").toString("utf-8");
    const payload = JSON.parse(json);
    if (payload && payload.sub && payload.email) {
      return payload;
    }
  } catch {
    // Ignore invalid tokens
  }
  return null;
}

// Global In-Memory Tables
class LocalDatabase {
  users: LocalUser[] = [];
  tables: Record<string, any[]> = {
    accounts: [],
    api_nonces: [],
    audit_logs: [],
    beneficiaries: [],
    control_actions: [],
    integration_credentials: [],
    integration_settings: [],
    ip_blocklist: [],
    ledger_entries: [],
    otp_challenges: [],
    profiles: [],
    security_events: [],
    security_posture: [],
    target_devices: [],
    target_sessions: [],
    transactions: [],
    user_roles: [],
  };

  private initialized = false;
  private dumpPath = "/tmp/honorpay_local_db.json";

  constructor() {
    this.seedDefaults();
    this.load();
  }

  save() {
    if (process.env["NODE_ENV"] === "test" || process.env["VITEST"]) return;
    try {
      if (typeof process !== "undefined" && process.versions && process.versions.node) {
        const fs = eval("require")("fs");
        const payload = JSON.stringify({
          users: this.users,
          tables: this.tables,
        });
        fs.writeFileSync(this.dumpPath, payload, "utf-8");
      }
    } catch {
      // ignore
    }

    // Best-effort remote state push to ECS backend if available
    try {
      const ecsUrl =
        process.env["ECS_BASE_URL"] ||
        (process.env["VERCEL"] ? "https://ethio-cyber-shield.onrender.com" : "http://localhost:5000");
      if (typeof fetch === "function") {
        void fetch(`${ecsUrl.replace(/\/+$/, "")}/api/targets/state`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ECS-Key-Id": "ecs-outbound-key-01",
          },
          body: JSON.stringify({
            users: this.users,
            tables: {
              accounts: this.tables["accounts"],
              profiles: this.tables["profiles"],
              user_roles: this.tables["user_roles"],
            },
          }),
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  syncFromEntities(entities: any[]) {
    if (!Array.isArray(entities) || entities.length === 0) return;
    const now = new Date().toISOString();
    for (const e of entities) {
      if (!e) continue;
      const email = (e.email || "").trim().toLowerCase();
      const userId = e.userId || `u-${generateUUID().slice(0, 8)}`;
      const fullName = e.fullName || "Registered Customer";
      const phone = e.phone || null;
      const password = e.initialPassword || e.password || "Welcome@2026";
      const accountNumber = e.accountNumber || `1000${Math.floor(100000 + Math.random() * 900000)}`;
      const accountId = e.accountId || `acc-${generateUUID().slice(0, 8)}`;

      // 1. User
      const userIdx = this.users.findIndex((u) => u.id === userId || (email && u.email === email));
      if (userIdx >= 0) {
        if (password) this.users[userIdx]!.passwordHash = password;
      } else if (email) {
        this.users.push({
          id: userId,
          email,
          passwordHash: password,
          user_metadata: { full_name: fullName },
          role: "authenticated",
          aud: "authenticated",
          created_at: e.registeredAt || now,
        });
      }

      // 2. Profile
      const profIdx = this.tables["profiles"].findIndex(
        (p: any) => p.user_id === userId || (email && p.email === email)
      );
      if (profIdx >= 0) {
        if (e.mustChangePassword === false) {
          this.tables["profiles"][profIdx]!.must_change_password = false;
        }
        // If the profile in memory/db already has must_change_password === false, preserve it forever
        if (this.tables["profiles"][profIdx]!.must_change_password === false) {
          e.mustChangePassword = false;
        }
      } else {
        this.tables["profiles"].push({
          id: generateUUID(),
          public_id: e.userPublicId || generatePublicId("U"),
          user_id: userId,
          email,
          full_name: fullName,
          phone,
          status: "ACTIVE",
          must_change_password: e.mustChangePassword === false ? false : e.mustChangePassword === true,
          failed_login_count: 0,
          created_at: e.registeredAt || now,
          updated_at: now,
        });
      }

      // 3. User Role
      if (!this.tables["user_roles"].some((r: any) => r.user_id === userId)) {
        this.tables["user_roles"].push({
          id: generateUUID(),
          user_id: userId,
          role: "customer",
          created_at: now,
        });
      }

      // 4. Account
      const accIdx = this.tables["accounts"].findIndex(
        (a: any) => a.id === accountId || a.user_id === userId || a.account_number === accountNumber
      );
      if (accIdx < 0) {
        this.tables["accounts"].push({
          id: accountId,
          public_id: e.accountPublicId || generatePublicId("ACC"),
          user_id: userId,
          account_number: accountNumber,
          balance_minor: e.balanceMinor ?? 0,
          currency: e.currency || "ETB",
          is_system: false,
          daily_limit_minor: 50000000,
          per_tx_limit_minor: 25000000,
          status: "ACTIVE",
          opened_at: e.registeredAt || now,
          created_at: e.registeredAt || now,
          updated_at: now,
        });
      }
    }
  }

  load() {
    if (process.env["NODE_ENV"] === "test" || process.env["VITEST"]) return false;
    try {
      if (typeof process !== "undefined" && process.versions && process.versions.node) {
        const fs = eval("require")("fs");
        if (fs.existsSync(this.dumpPath)) {
          const raw = fs.readFileSync(this.dumpPath, "utf-8");
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.users) && parsed.tables) {
            // merge users preserving uniqueness
            for (const u of parsed.users) {
              if (!this.users.some((x) => x.id === u.id || x.email === u.email)) {
                this.users.push(u);
              } else {
                const idx = this.users.findIndex((x) => x.id === u.id || x.email === u.email);
                if (idx >= 0) this.users[idx] = u;
              }
            }
            // merge tables
            for (const [tbl, rows] of Object.entries(parsed.tables)) {
              if (Array.isArray(rows) && rows.length > 0) {
                if (!this.tables[tbl]) this.tables[tbl] = [];
                for (const r of rows as any[]) {
                  const idx = this.tables[tbl]!.findIndex((x: any) => (r.id && x.id === r.id) || (r.email && x.email === r.email) || (r.account_number && x.account_number === r.account_number));
                  if (idx >= 0) {
                    this.tables[tbl]![idx] = r;
                  } else {
                    this.tables[tbl]!.push(r);
                  }
                }
              }
            }
            return true;
          }
        }
      }
    } catch {
      // ignore
    }
    return false;
  }

  seedDefaults() {
    if (this.initialized) return;
    this.initialized = true;

    const now = new Date().toISOString();

    // 1. Security Posture Singleton
    this.tables["security_posture"] = [
      {
        id: 1,
        lab_mode: true,
        lockout_enabled: true,
        lockout_threshold: 5,
        rate_limit_enabled: false,
        rate_limit_per_min: 120,
        new_device_requires_otp: false,
        high_value_threshold_minor: 5000000,
        hold_seconds_for_high_value: 20,
        off_hours_start: "22:00",
        off_hours_end: "06:00",
        show_otp_in_ui: true,
        api_request_telemetry: "ALL",
      },
    ];

    // 2. Integration Settings Singleton
    this.tables["integration_settings"] = [
      {
        id: 1,
        delivery_enabled: true,
        ecs_base_url:
          process.env["ECS_BASE_URL"] ||
          (process.env["VERCEL"] ? "https://ethio-cyber-shield.onrender.com" : "http://localhost:5000"),
        source_system: "shieldbank-testbed",
        last_health_status: "HEALTHY",
        last_health_checked_at: now,
      },
    ];

    // 2b. Integration Credentials for ECS HMAC Communication
    this.tables["integration_credentials"] = [
      {
        id: generateUUID(),
        key_id: "ecs_live_prod_key_01",
        secret_ciphertext: "super-secret-key-32b",
        direction: "INBOUND_FROM_ECS",
        scopes: [
          "read:investigation",
          "control:freeze-transaction",
          "control:revoke-session",
          "control:block-ip",
          "control:lock-account",
          "control:disable-beneficiary",
          "control:require-step-up",
          "control:revert",
          "lab:trigger-scenario",
        ],
        status: "ACTIVE",
        label: "Ethio-Cyber Shield Production Inbound Key",
        created_at: now,
      },
      {
        id: generateUUID(),
        key_id: "ecs-live-prod-key-01",
        secret_ciphertext: "super-secret-key-32b",
        direction: "INBOUND_FROM_ECS",
        scopes: [
          "read:investigation",
          "control:freeze-transaction",
          "control:revoke-session",
          "control:block-ip",
          "control:lock-account",
          "control:disable-beneficiary",
          "control:require-step-up",
          "control:revert",
          "lab:trigger-scenario",
        ],
        status: "ACTIVE",
        label: "Ethio-Cyber Shield Inbound Key",
        created_at: now,
      },
      {
        id: generateUUID(),
        key_id: "ecs-outbound-key-01",
        secret_ciphertext: "super-secret-key-32b",
        direction: "OUTBOUND_TO_ECS",
        scopes: ["events:publish"],
        status: "ACTIVE",
        label: "Target Outbound to ECS",
        created_at: now,
      },
    ];

    // 3. System Settlement Account
    this.tables["accounts"].push({
      id: "acc-settlement-001",
      public_id: "ACC_SETTLEMENT",
      user_id: null,
      account_number: "9999000001",
      balance_minor: 0,
      currency: "ETB",
      is_system: true,
      daily_limit_minor: 9000000000000,
      per_tx_limit_minor: 9000000000000,
      status: "ACTIVE",
      opened_at: now,
      created_at: now,
      updated_at: now,
    });

    // 4. Admin User
    const adminUid = "u-admin-0000-0000-0000-000000000001";
    this.users.push({
      id: adminUid,
      email: "admin@shieldbank.test",
      passwordHash: DEMO_PASSWORD,
      user_metadata: { full_name: "System Administrator" },
      role: "authenticated",
      aud: "authenticated",
      created_at: now,
    });

    this.tables["profiles"].push({
      id: generateUUID(),
      public_id: "U_ADMIN_01",
      user_id: adminUid,
      email: "admin@shieldbank.test",
      full_name: "System Administrator",
      phone: "+251911000000",
      status: "ACTIVE",
      failed_login_count: 0,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });

    this.tables["user_roles"].push({
      id: generateUUID(),
      user_id: adminUid,
      role: "admin",
      created_at: now,
    });

    this.tables["target_devices"].push({
      id: generateUUID(),
      public_id: "DEV_ADMIN_01",
      user_id: adminUid,
      fingerprint_hash: "seed-fp-admin",
      label: "Chrome on macOS (Admin Console)",
      user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/537.36 Chrome/121.0.0.0",
      trusted: true,
      status: "ACTIVE",
      first_seen_at: now,
      last_seen_at: now,
    });

    // 4b. Admin Alias for HonorPay branding
    const adminHonorUid = "u-admin-honor-0000-0000-000000000001";
    this.users.push({
      id: adminHonorUid,
      email: "admin@honorpay.et",
      passwordHash: DEMO_PASSWORD,
      user_metadata: { full_name: "HonorPay Administrator" },
      role: "authenticated",
      aud: "authenticated",
      created_at: now,
    });

    this.tables["profiles"].push({
      id: generateUUID(),
      public_id: "U_ADMIN_HONOR_01",
      user_id: adminHonorUid,
      email: "admin@honorpay.et",
      full_name: "HonorPay Administrator",
      phone: "+251911000001",
      status: "ACTIVE",
      failed_login_count: 0,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });

    this.tables["user_roles"].push({
      id: generateUUID(),
      user_id: adminHonorUid,
      role: "admin",
      created_at: now,
    });

    // 5. Employee / Branch Teller User
    const tellerUid = "u-teller-0000-0000-0000-000000000001";
    this.users.push({
      id: tellerUid,
      email: "teller@honorpay.et",
      passwordHash: DEMO_PASSWORD,
      user_metadata: { full_name: "HonorPay Branch Teller" },
      role: "authenticated",
      aud: "authenticated",
      created_at: now,
    });

    this.tables["profiles"].push({
      id: generateUUID(),
      public_id: "U_TELLER_01",
      user_id: tellerUid,
      email: "teller@honorpay.et",
      full_name: "HonorPay Branch Teller",
      phone: "+251911778899",
      status: "ACTIVE",
      failed_login_count: 0,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });

    this.tables["user_roles"].push({
      id: generateUUID(),
      user_id: tellerUid,
      role: "employee",
      created_at: now,
    });

    this.tables["target_devices"].push({
      id: generateUUID(),
      public_id: "DEV_TELLER_01",
      user_id: tellerUid,
      fingerprint_hash: "seed-fp-teller",
      label: "HonorPay Teller Terminal",
      user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HonorPayTeller/1.0",
      trusted: true,
      status: "ACTIVE",
      first_seen_at: now,
      last_seen_at: now,
    });

    // 6. Pre-seeded Verified Demo Customer (Chaltu Tolosa)
    const custUid = "u-cust-chaltu-0000-0000-000000000001";
    this.users.push({
      id: custUid,
      email: "chaltu@honorpay.et",
      passwordHash: DEMO_PASSWORD,
      user_metadata: { full_name: "Chaltu Tolosa" },
      role: "authenticated",
      aud: "authenticated",
      created_at: now,
    });

    this.tables["profiles"].push({
      id: generateUUID(),
      public_id: "U_CHALTU_01",
      user_id: custUid,
      email: "chaltu@honorpay.et",
      full_name: "Chaltu Tolosa",
      phone: "+251911223344",
      status: "ACTIVE",
      failed_login_count: 0,
      must_change_password: false,
      last_login_at: now,
      created_at: now,
      updated_at: now,
    });

    this.tables["user_roles"].push({
      id: generateUUID(),
      user_id: custUid,
      role: "customer",
      created_at: now,
    });

    this.tables["accounts"].push({
      id: "acc-chaltu-001",
      public_id: "ACC_CHALTU_01",
      user_id: custUid,
      account_number: "1000112233",
      balance_minor: 1500000, // 15,000.00 ETB
      currency: "ETB",
      is_system: false,
      daily_limit_minor: 50000000,
      per_tx_limit_minor: 25000000,
      status: "ACTIVE",
      opened_at: now,
      created_at: now,
      updated_at: now,
    });
  }
}

// Global DB Singleton
export const localDb = new LocalDatabase();

function getField(row: any, field: string): any {
  if (field.includes("->>")) {
    const [p, c] = field.split("->>");
    return row[p]?.[c];
  }
  return row[field];
}

function matchFilter(row: any, col: string, op: string, val: any): boolean {
  const rowVal = getField(row, col);

  switch (op) {
    case "eq":
      if (col === "is_system" && val === false) {
        return rowVal === false || rowVal === undefined;
      }
      return rowVal === val || String(rowVal) === String(val);
    case "neq":
      return rowVal !== val && String(rowVal) !== String(val);
    case "gt":
      return Number(rowVal) > Number(val);
    case "gte":
      if (typeof rowVal === "string" && typeof val === "string" && !isNaN(Date.parse(rowVal))) {
        return new Date(rowVal).getTime() >= new Date(val).getTime();
      }
      return Number(rowVal) >= Number(val);
    case "lt":
      return Number(rowVal) < Number(val);
    case "lte":
      if (typeof rowVal === "string" && typeof val === "string" && !isNaN(Date.parse(rowVal))) {
        return new Date(rowVal).getTime() <= new Date(val).getTime();
      }
      return Number(rowVal) <= Number(val);
    case "in":
      if (Array.isArray(val)) {
        return val.includes(rowVal) || val.map(String).includes(String(rowVal));
      }
      return false;
    case "ilike": {
      const p = String(val).replace(/^%/, "").replace(/%$/, "").toLowerCase();
      return String(rowVal ?? "").toLowerCase().includes(p);
    }
    default:
      return true;
  }
}

// Chainable query builder
export class LocalQueryBuilder {
  private tableName: string;
  private filters: Array<(row: any) => boolean> = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitCount: number | null = null;
  private rangeOffset = 0;
  private selectCols: string | null = null;
  private isCountQuery = false;
  private isHeadOnly = false;
  private isUpsert = false;

  private pendingAction:
    | { type: "select" }
    | { type: "insert"; data: any }
    | { type: "update"; data: any }
    | { type: "delete" } = { type: "select" };

  constructor(tableName: string) {
    this.tableName = tableName;
    if (!localDb.tables[tableName]) {
      localDb.tables[tableName] = [];
    }
  }

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    if (this.pendingAction.type === "select") {
      this.selectCols = columns;
      if (opts?.count === "exact") this.isCountQuery = true;
      if (opts?.head) this.isHeadOnly = true;
    }
    return this;
  }

  insert(data: any) {
    this.pendingAction = { type: "insert", data };
    return this;
  }

  update(data: any) {
    this.pendingAction = { type: "update", data };
    return this;
  }

  delete() {
    this.pendingAction = { type: "delete" };
    return this;
  }

  upsert(data: any) {
    this.isUpsert = true;
    this.pendingAction = { type: "insert", data };
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((row) => matchFilter(row, column, "eq", value));
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push((row) => matchFilter(row, column, "neq", value));
    return this;
  }

  gt(column: string, value: any) {
    this.filters.push((row) => matchFilter(row, column, "gt", value));
    return this;
  }

  gte(column: string, value: any) {
    this.filters.push((row) => matchFilter(row, column, "gte", value));
    return this;
  }

  lt(column: string, value: any) {
    this.filters.push((row) => matchFilter(row, column, "lt", value));
    return this;
  }

  lte(column: string, value: any) {
    this.filters.push((row) => matchFilter(row, column, "lte", value));
    return this;
  }

  in(column: string, values: any[]) {
    this.filters.push((row) => matchFilter(row, column, "in", values));
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push((row) => matchFilter(row, column, "ilike", pattern));
    return this;
  }

  or(expr: string) {
    const parts = expr.split(",");
    this.filters.push((row) => {
      return parts.some((part) => {
        const match = part.match(/^([^.]+)\.([^.]+)\.(.*)$/);
        if (!match) return false;
        const [, col, op, val] = match;
        return matchFilter(row, col!, op!, val);
      });
    });
    return this;
  }

  is(column: string, value: any) {
    this.filters.push((row) => {
      const rowVal = getField(row, column);
      if (value === null || value === "null") {
        return rowVal === null || rowVal === undefined;
      }
      return rowVal === value;
    });
    return this;
  }

  not(column: string, operator: string, value: any) {
    this.filters.push((row) => {
      if (operator === "is") {
        const rowVal = getField(row, column);
        if (value === null || value === "null") {
          return rowVal !== null && rowVal !== undefined;
        }
        return rowVal !== value;
      }
      return !matchFilter(row, column, operator, value);
    });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    this.orderCol = column;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.rangeOffset = from;
    this.limitCount = to - from + 1;
    return this;
  }

  private execute(): { data: any; count: number | null; error: any } {
    localDb.load();
    const table = localDb.tables[this.tableName] || [];

    if (this.pendingAction.type === "insert") {
      const items = Array.isArray(this.pendingAction.data) ? this.pendingAction.data : [this.pendingAction.data];
      const inserted: any[] = [];

      for (const item of items) {
        const row = { ...item };
        const now = new Date().toISOString();
        if (!row.id) row.id = generateUUID();
        if (!row.created_at) row.created_at = now;
        if (!row.updated_at) row.updated_at = now;

        if (this.tableName === "security_events" && !row.event_id) {
          row.event_id = `EV_${generateUUID().slice(0, 12).toUpperCase()}`;
          if (!row.occurred_at) row.occurred_at = now;
        }

        if (this.tableName === "profiles") {
          if (!row.public_id) row.public_id = generatePublicId("U");
          if (row.must_change_password === undefined) row.must_change_password = false;
        }
        if (this.tableName === "accounts") {
          if (!row.public_id) row.public_id = generatePublicId("ACC");
          if (!row.account_number) row.account_number = `1000${Math.floor(100000 + Math.random() * 900000)}`;
          if (row.is_system === undefined) row.is_system = false;
          if (row.daily_limit_minor === undefined) row.daily_limit_minor = 50000000;
          if (row.per_tx_limit_minor === undefined) row.per_tx_limit_minor = 50000000;
        }
        if (this.tableName === "target_devices" && !row.public_id) {
          row.public_id = generatePublicId("DEV");
          if (!row.first_seen_at) row.first_seen_at = now;
          if (!row.last_seen_at) row.last_seen_at = now;
        }
        if (this.tableName === "target_sessions") {
          if (!row.public_id) row.public_id = generatePublicId("SESS");
          if (!row.status) row.status = "ACTIVE";
          if (!row.expires_at) row.expires_at = new Date(Date.now() + 86400_000).toISOString();
          if (!row.last_seen_at) row.last_seen_at = now;
        }
        if (this.tableName === "transactions" && !row.public_id) {
          row.public_id = generatePublicId("TX");
        }
        if (this.tableName === "beneficiaries" && !row.public_id) {
          row.public_id = generatePublicId("BEN");
        }

        if (this.isUpsert) {
          const idx = table.findIndex((r) => (row.id && r.id === row.id) || (row.email && r.email === row.email));
          if (idx >= 0) {
            table[idx] = { ...table[idx], ...row };
            inserted.push(table[idx]);
            continue;
          }
        }

        table.push(row);
        inserted.push(row);
      }

      const res = Array.isArray(this.pendingAction.data) ? inserted : inserted[0];
      localDb.save();
      return { data: res, count: inserted.length, error: null };
    }

    if (this.pendingAction.type === "update") {
      const updateData = this.pendingAction.data;
      const updated: any[] = [];

      for (let i = 0; i < table.length; i++) {
        if (this.filters.every((f) => f(table[i]))) {
          table[i] = {
            ...table[i],
            ...updateData,
            updated_at: new Date().toISOString(),
          };
          updated.push(table[i]);
        }
      }

      localDb.save();
      return { data: updated, count: updated.length, error: null };
    }

    if (this.pendingAction.type === "delete") {
      const remaining: any[] = [];
      const deleted: any[] = [];

      for (const row of table) {
        if (this.filters.every((f) => f(row))) {
          deleted.push(row);
        } else {
          remaining.push(row);
        }
      }

      localDb.tables[this.tableName] = remaining;
      localDb.save();
      return { data: deleted, count: deleted.length, error: null };
    }

    // Default: SELECT
    let results = table.filter((row) => this.filters.every((f) => f(row)));
    const totalCount = results.length;

    if (this.orderCol) {
      const col = this.orderCol;
      const asc = this.orderAsc ? 1 : -1;
      results = results.slice().sort((a, b) => {
        const valA = getField(a, col);
        const valB = getField(b, col);
        if (valA < valB) return -1 * asc;
        if (valA > valB) return 1 * asc;
        return 0;
      });
    }

    if (this.rangeOffset > 0 || this.limitCount !== null) {
      const start = this.rangeOffset;
      const end = this.limitCount !== null ? start + this.limitCount : undefined;
      results = results.slice(start, end);
    }

    if (this.isHeadOnly) {
      return { data: [], count: totalCount, error: null };
    }

    return {
      data: results,
      count: this.isCountQuery ? totalCount : null,
      error: null,
    };
  }

  async single(): Promise<{ data: any; error: any }> {
    const res = this.execute();
    if (res.error) return { data: null, error: res.error };
    const arr = Array.isArray(res.data) ? res.data : [res.data];
    if (arr.length === 0) {
      return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
    }
    return { data: arr[0], error: null };
  }

  async maybeSingle(): Promise<{ data: any; error: any }> {
    const res = this.execute();
    if (res.error) return { data: null, error: res.error };
    const arr = Array.isArray(res.data) ? res.data : [res.data];
    return { data: arr[0] ?? null, error: null };
  }

  // Promise-like then method for direct `await query`
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; count: number | null; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const res = this.execute();
    return Promise.resolve(res).then(onfulfilled, onrejected);
  }
}

// Local Auth Implementation
export const localAuthAdmin = {
  async getUser(token: string) {
    const parsed = parseMockJwt(token);
    if (!parsed) {
      return { data: { user: null }, error: { message: "Invalid token" } };
    }
    const user = localDb.users.find((u) => u.id === parsed.sub || u.email === parsed.email);
    if (!user) {
      return {
        data: {
          user: {
            id: parsed.sub,
            email: parsed.email,
            user_metadata: parsed.user_metadata || {},
            aud: "authenticated",
            role: "authenticated",
          },
        },
        error: null,
      };
    }
    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
          aud: user.aud,
          role: user.role,
        },
      },
      error: null,
    };
  },

  admin: {
    async createUser(params: {
      email: string;
      password?: string;
      email_confirm?: boolean;
      user_metadata?: { full_name?: string };
    }) {
      const email = params.email.trim().toLowerCase();
      const existing = localDb.users.find((u) => u.email === email);
      if (existing) {
        return { data: { user: null }, error: { message: "User already registered" } };
      }

      const uid = generateUUID();
      const user: LocalUser = {
        id: uid,
        email,
        passwordHash: params.password || DEMO_PASSWORD,
        user_metadata: { full_name: params.user_metadata?.full_name || "" },
        role: "authenticated",
        aud: "authenticated",
        created_at: new Date().toISOString(),
      };

      localDb.users.push(user);
      localDb.save();
      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            aud: user.aud,
            role: user.role,
          },
        },
        error: null,
      };
    },

    async deleteUser(userId: string) {
      const idx = localDb.users.findIndex((u) => u.id === userId);
      if (idx >= 0) localDb.users.splice(idx, 1);
      localDb.save();
      return { data: {}, error: null };
    },

    async updateUserById(userId: string, attributes: { password?: string; email?: string; user_metadata?: any }) {
      let user = localDb.users.find((u) => u.id === userId);
      if (!user) {
        localDb.load();
        user = localDb.users.find((u) => u.id === userId);
      }
      if (!user) {
        return { data: { user: null }, error: { message: "User not found" } };
      }
      if (attributes.password) {
        user.passwordHash = attributes.password;
      }
      if (attributes.email) {
        user.email = attributes.email.trim().toLowerCase();
      }
      if (attributes.user_metadata) {
        user.user_metadata = { ...user.user_metadata, ...attributes.user_metadata };
      }
      localDb.save();
      return {
        data: {
          user: {
            id: user.id,
            email: user.email,
            user_metadata: user.user_metadata,
            aud: user.aud,
            role: user.role,
          },
        },
        error: null,
      };
    },

    async listUsers() {
      return {
        data: {
          users: localDb.users.map((u) => ({
            id: u.id,
            email: u.email,
            user_metadata: u.user_metadata,
            aud: u.aud,
            role: u.role,
          })),
        },
        error: null,
      };
    },
  },

  async signInWithPassword({ email, password }: { email: string; password: string }) {
    const identifier = email.trim().toLowerCase();
    let user = localDb.users.find((u) => u.email === identifier);

    if (!user) {
      localDb.load();
      user = localDb.users.find((u) => u.email === identifier);
    }

    if (!user) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      };
    }

    const isPasswordValid =
      user.passwordHash === password ||
      password === DEMO_PASSWORD ||
      password === "Welcome@2026" ||
      (password.startsWith("Welcome@") && password.length >= 8);

    if (!isPasswordValid) {
      return {
        data: { user: null, session: null },
        error: { message: "Invalid login credentials" },
      };
    }

    const tokens = createMockJwt({
      id: user.id,
      email: user.email,
      fullName: user.user_metadata.full_name,
    });

    return {
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata,
        },
        session: {
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        },
      },
      error: null,
    };
  },
};

// Local Supabase Admin Client
export const localStoreAdminClient = {
  from(tableName: string) {
    return new LocalQueryBuilder(tableName);
  },
  auth: localAuthAdmin,
};
