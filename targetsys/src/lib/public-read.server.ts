import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getAccountByRef(accountRef: string) {
  const { data: acc } = await supabaseAdmin
    .from("accounts")
    .select("id, public_id, account_number, balance_minor, currency, status, opened_at, created_at, daily_limit_minor, per_tx_limit_minor, user_id")
    .or(`public_id.eq.${accountRef},id.eq.${accountRef}`)
    .maybeSingle();

  if (!acc) return null;

  return {
    account_id: acc.public_id,
    account_number: acc.account_number,
    balance_minor: acc.balance_minor,
    balance: Math.round(acc.balance_minor / 100),
    currency: acc.currency,
    status: acc.status,
    opened_at: acc.opened_at,
    daily_limit_minor: acc.daily_limit_minor,
    per_tx_limit_minor: acc.per_tx_limit_minor,
  };
}

export async function getUserBaseline(userRef: string) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("user_id, public_id, email, full_name, phone, status, step_up_until, last_login_at, created_at")
    .or(`public_id.eq.${userRef},user_id.eq.${userRef}`)
    .maybeSingle();

  if (!prof) return null;

  const [{ data: account }, { data: devices }, { data: past30dTxs }] = await Promise.all([
    supabaseAdmin.from("accounts").select("id, opened_at").eq("user_id", prof.user_id).maybeSingle(),
    supabaseAdmin.from("target_devices").select("id, trusted").eq("user_id", prof.user_id).eq("status", "ACTIVE"),
    supabaseAdmin
      .from("transactions")
      .select("amount_minor")
      .eq("status", "COMPLETED")
      .gte("created_at", new Date(Date.now() - 30 * 86400 * 1000).toISOString()),
  ]);

  const now = Date.now();
  const accountAgeDays = account?.opened_at
    ? Math.max(0, Math.round((now - new Date(account.opened_at).getTime()) / (86400 * 1000)))
    : 0;

  const amounts = (past30dTxs ?? []).map((t) => Number(t.amount_minor));
  const avgTransfer30dMinor = amounts.length > 0 ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length) : 0;
  const maxTransfer30dMinor = amounts.length > 0 ? Math.max(...amounts) : 0;

  const trustedDeviceCount = (devices ?? []).filter((d) => d.trusted).length;

  return {
    user_id: prof.public_id,
    full_name: prof.full_name,
    email: prof.email,
    phone: prof.phone,
    status: prof.status,
    step_up_active: !!prof.step_up_until && new Date(prof.step_up_until).getTime() > now,
    step_up_until: prof.step_up_until,
    baseline: {
      account_age_days: accountAgeDays,
      avg_transfer_30d_minor: avgTransfer30dMinor,
      max_transfer_30d_minor: maxTransfer30dMinor,
      usual_active_hours: [8, 18],
      trusted_device_count: trustedDeviceCount,
      total_devices: devices?.length ?? 0,
    },
  };
}

export async function getUserSessions(userRef: string) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .or(`public_id.eq.${userRef},user_id.eq.${userRef}`)
    .maybeSingle();

  if (!prof) return [];

  const { data: sessions } = await supabaseAdmin
    .from("target_sessions")
    .select("public_id, status, source_ip, user_agent, created_at, last_seen_at, expires_at, revoked_by, revoked_reason, device:target_devices(label, trusted)")
    .eq("user_id", prof.user_id)
    .order("last_seen_at", { ascending: false });

  return sessions ?? [];
}

export async function getUserDevices(userRef: string) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .or(`public_id.eq.${userRef},user_id.eq.${userRef}`)
    .maybeSingle();

  if (!prof) return [];

  const { data: devices } = await supabaseAdmin
    .from("target_devices")
    .select("public_id, label, fingerprint_hash, trusted, user_agent, first_seen_at, last_seen_at, status")
    .eq("user_id", prof.user_id)
    .order("last_seen_at", { ascending: false });

  return devices ?? [];
}

export async function getAccountTransactions(accountRef: string, since?: string | null) {
  const { data: acc } = await supabaseAdmin
    .from("accounts")
    .select("id")
    .or(`public_id.eq.${accountRef},id.eq.${accountRef}`)
    .maybeSingle();

  if (!acc) return [];

  let query = supabaseAdmin
    .from("transactions")
    .select("public_id, amount_minor, currency, status, created_at, completed_at, note, beneficiary:beneficiaries(public_id, name, bank_name)")
    .eq("from_account_id", acc.id)
    .order("created_at", { ascending: false });

  if (since) {
    query = query.gte("created_at", since);
  }

  const { data } = await query;
  return data ?? [];
}

export async function getAccountBeneficiaries(accountRef: string) {
  const { data: acc } = await supabaseAdmin
    .from("accounts")
    .select("id")
    .or(`public_id.eq.${accountRef},id.eq.${accountRef}`)
    .maybeSingle();

  if (!acc) return [];

  const { data } = await supabaseAdmin
    .from("beneficiaries")
    .select("public_id, name, account_number, bank_name, is_internal, status, disabled_reason, created_at")
    .eq("account_id", acc.id)
    .neq("status", "REMOVED")
    .order("created_at", { ascending: false });

  return data ?? [];
}
