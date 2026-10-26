
-- ===== Enums =====
create type public.app_role as enum ('customer','admin');

-- ===== Sequences for public ids =====
create sequence public.seq_user_pub start 201;
create sequence public.seq_account_pub start 201;
create sequence public.seq_session_pub start 8801;
create sequence public.seq_device_pub start 70;
create sequence public.seq_beneficiary_pub start 90;
create sequence public.seq_tx_pub start 10400;
create sequence public.seq_account_number start 1000201;

-- ===== updated_at helper =====
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.block_mutation() returns trigger
language plpgsql set search_path = public as $$
begin raise exception 'append-only table: % not allowed on %', tg_op, tg_table_name; end $$;

-- ===== profiles =====
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_id text not null unique default ('U' || nextval('public.seq_user_pub')),
  email text not null unique,
  full_name text not null default '',
  phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','LOCKED')),
  step_up_until timestamptz,
  locked_until timestamptz,
  failed_login_count int not null default 0,
  last_login_at timestamptz,
  last_failed_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ===== accounts =====
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('ACC' || nextval('public.seq_account_pub')),
  user_id uuid,
  account_number text not null unique default ('1000' || nextval('public.seq_account_number')),
  balance_minor bigint not null default 0,
  currency text not null default 'ETB',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','LOCKED','CLOSED')),
  is_system boolean not null default false,
  daily_limit_minor bigint not null default 20000000,
  per_tx_limit_minor bigint not null default 10000000,
  opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.accounts(user_id);

create table public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('BEN' || nextval('public.seq_beneficiary_pub')),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  account_number text not null,
  bank_name text not null,
  is_internal boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED','REMOVED')),
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.beneficiaries(account_id);

create table public.target_devices (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('DEV' || nextval('public.seq_device_pub')),
  user_id uuid not null,
  fingerprint_hash text not null,
  label text,
  user_agent text,
  trusted boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REMOVED')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.target_devices(user_id);
create index on public.target_devices(fingerprint_hash);

create table public.target_sessions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('S' || nextval('public.seq_session_pub')),
  user_id uuid not null,
  device_id uuid references public.target_devices(id),
  source_ip text,
  user_agent text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED','EXPIRED','LOGGED_OUT')),
  revoked_reason text,
  revoked_by text check (revoked_by in ('SELF','ADMIN','ECS')),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.target_sessions(user_id);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique default ('TX' || nextval('public.seq_tx_pub')),
  from_account_id uuid not null references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  beneficiary_id uuid references public.beneficiaries(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'ETB',
  note text,
  status text not null default 'PROCESSING' check (status in ('PROCESSING','COMPLETED','FROZEN','FAILED','CANCELLED')),
  hold_until timestamptz,
  idempotency_key text unique,
  session_id uuid,
  device_id uuid,
  source_ip text,
  failure_reason text,
  completed_at timestamptz,
  frozen_at timestamptz,
  frozen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.transactions(from_account_id, created_at desc);
create index on public.transactions(to_account_id);

create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  transaction_id uuid not null references public.transactions(id),
  direction text not null check (direction in ('DEBIT','CREDIT')),
  amount_minor bigint not null check (amount_minor > 0),
  balance_after_minor bigint not null,
  created_at timestamptz not null default now()
);
create index on public.ledger_entries(account_id, created_at desc);

create table public.otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid,
  purpose text not null check (purpose in ('LOGIN_NEW_DEVICE','STEP_UP','TRANSFER')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','FAILED','EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ip_blocklist (
  ip text primary key,
  reason text,
  source text not null check (source in ('ADMIN','ECS')),
  alert_ref text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.security_events (
  seq bigserial unique,
  event_id uuid primary key default gen_random_uuid(),
  event_type text not null,
  occurred_at timestamptz not null default now(),
  source_system text not null default 'shieldbank-testbed',
  user_id_pub text,
  account_id_pub text,
  session_id_pub text,
  device_id_pub text,
  source_ip text,
  endpoint text,
  result text not null check (result in ('SUCCESS','FAILURE','DENIED','BLOCKED','PENDING')),
  amount_minor bigint,
  currency text,
  beneficiary_id_pub text,
  transaction_id_pub text,
  attributes jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'PENDING' check (delivery_status in ('PENDING','DELIVERED','FAILED')),
  delivered_at timestamptz,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.security_events(event_type, occurred_at desc);
create index on public.security_events(source_ip, occurred_at desc);
create index on public.security_events(user_id_pub, occurred_at desc);
create index on public.security_events(delivery_status) where delivery_status <> 'DELIVERED';
create index on public.security_events((attributes->>'identifier'), occurred_at desc);

create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('OUTBOUND_TO_ECS','INBOUND_FROM_ECS')),
  key_id text not null unique,
  secret_ciphertext text not null,
  scopes text[] not null default '{}',
  label text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED')),
  ip_allowlist text[],
  last_used_at timestamptz,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.integration_settings (
  id int primary key default 1 check (id = 1),
  ecs_base_url text,
  source_system text not null default 'shieldbank-testbed',
  delivery_enabled boolean not null default false,
  last_health_check_at timestamptz,
  last_health_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.api_nonces (
  key_id text not null,
  nonce text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (key_id, nonce)
);

create table public.control_actions (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_public_id text,
  reason text,
  alert_ref text,
  incident_ref text,
  idempotency_key text unique,
  requested_by_key_id text,
  status text not null check (status in ('CONFIRMED','REJECTED','FAILED','REVERTED')),
  target_state jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('USER','ADMIN','ECS','SYSTEM')),
  actor_ref text,
  action text not null,
  entity text,
  entity_ref text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.security_posture (
  id int primary key default 1 check (id = 1),
  lab_mode boolean not null default true,
  lockout_enabled boolean not null default false,
  lockout_threshold int not null default 5,
  rate_limit_enabled boolean not null default false,
  rate_limit_per_min int not null default 120,
  new_device_requires_otp boolean not null default false,
  high_value_threshold_minor bigint not null default 5000000,
  hold_seconds_for_high_value int not null default 20,
  off_hours_start text not null default '22:00',
  off_hours_end text not null default '06:00',
  show_otp_in_ui boolean not null default true,
  api_request_telemetry text not null default 'ALL' check (api_request_telemetry in ('ALL','SENSITIVE_ONLY')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== updated_at triggers =====
do $$ declare t text; begin
  foreach t in array array['profiles','accounts','beneficiaries','target_devices','target_sessions','transactions','otp_challenges','ip_blocklist','security_events','integration_credentials','integration_settings','control_actions','security_posture'] loop
    execute format('create trigger trg_touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ===== append-only =====
create trigger trg_ledger_no_update before update or delete on public.ledger_entries for each row execute function public.block_mutation();
create trigger trg_audit_no_update before update or delete on public.audit_logs for each row execute function public.block_mutation();

create or replace function public.security_events_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'security_events is append-only'; end if;
  if new.event_id <> old.event_id or new.seq <> old.seq or new.event_type <> old.event_type
     or new.occurred_at <> old.occurred_at or new.result <> old.result
     or new.attributes <> old.attributes
     or coalesce(new.user_id_pub,'') <> coalesce(old.user_id_pub,'')
     or coalesce(new.source_ip,'') <> coalesce(old.source_ip,'') then
    raise exception 'security_events: only delivery columns may change';
  end if;
  return new;
end $$;
create trigger trg_security_events_guard before update or delete on public.security_events for each row execute function public.security_events_guard();

-- ===== GRANTS =====
grant select on public.profiles, public.user_roles, public.accounts, public.beneficiaries,
  public.target_devices, public.target_sessions, public.transactions, public.ledger_entries,
  public.security_events, public.control_actions, public.ip_blocklist, public.audit_logs,
  public.security_posture to authenticated;
grant all on public.profiles, public.user_roles, public.accounts, public.beneficiaries,
  public.target_devices, public.target_sessions, public.transactions, public.ledger_entries,
  public.otp_challenges, public.ip_blocklist, public.security_events, public.integration_credentials,
  public.integration_settings, public.api_nonces, public.control_actions, public.audit_logs,
  public.security_posture to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.accounts enable row level security;
alter table public.beneficiaries enable row level security;
alter table public.target_devices enable row level security;
alter table public.target_sessions enable row level security;
alter table public.transactions enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.otp_challenges enable row level security;
alter table public.ip_blocklist enable row level security;
alter table public.security_events enable row level security;
alter table public.integration_credentials enable row level security;
alter table public.integration_settings enable row level security;
alter table public.api_nonces enable row level security;
alter table public.control_actions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.security_posture enable row level security;

create policy "own or admin profile" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own or admin roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own or admin accounts" on public.accounts for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own or admin beneficiaries" on public.beneficiaries for select to authenticated
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
         or public.has_role(auth.uid(),'admin'));
create policy "own or admin devices" on public.target_devices for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own or admin sessions" on public.target_sessions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own or admin transactions" on public.transactions for select to authenticated
  using (exists (select 1 from public.accounts a where a.id in (from_account_id, to_account_id) and a.user_id = auth.uid())
         or public.has_role(auth.uid(),'admin'));
create policy "own or admin ledger" on public.ledger_entries for select to authenticated
  using (exists (select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid())
         or public.has_role(auth.uid(),'admin'));
create policy "admin events" on public.security_events for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin controls" on public.control_actions for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin blocklist" on public.ip_blocklist for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin audit" on public.audit_logs for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
create policy "admin posture" on public.security_posture for select to authenticated
  using (public.has_role(auth.uid(),'admin'));
-- otp_challenges, integration_credentials, integration_settings, api_nonces: no client policies (deny-all)

-- ===== singletons + system settlement account =====
insert into public.security_posture (id) values (1);
insert into public.integration_settings (id) values (1);
insert into public.accounts (public_id, user_id, account_number, balance_minor, is_system, daily_limit_minor, per_tx_limit_minor)
values ('ACC_SETTLEMENT', null, '9999000001', 0, true, 9000000000000, 9000000000000);
