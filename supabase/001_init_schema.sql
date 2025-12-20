-- ============================================
-- Supabase Schema for Mail-Assist CRM
-- Run this in Supabase SQL Editor
-- ============================================

create extension if not exists "pgcrypto";

-- Sync State Table
create table if not exists public.sync_state (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  status text default 'idle',
  queued integer default 0,
  processed integer default 0,
  errors integer default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_sync_state_user_email on public.sync_state(user_email);

-- Tokens Table
create table if not exists public.tokens (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  access_token text,
  refresh_token text,
  expiry_date timestamptz,
  token_type text,
  scope text,
  created_at timestamptz default now()
);

create index if not exists idx_tokens_user_email on public.tokens(user_email);

-- Emails Table
create table if not exists public.emails (
  id text primary key,
  user_email text,
  subject text,
  body text,
  is_sent boolean default true,
  embedding double precision[],
  created_at timestamptz default now()
);

create index if not exists idx_emails_user_email on public.emails(user_email);

-- Drafts Table
create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  email_id text,
  subject text,
  original_body text,
  draft_text text,
  created_at timestamptz default now()
);

create index if not exists idx_drafts_user_email on public.drafts(user_email);

-- CRM Emails Cache Table (critical for Vercel deployment)
create table if not exists public.crm_emails_cache (
  id uuid primary key default gen_random_uuid(),
  crm_message_id integer not null unique,
  thread_id text,
  client_id integer,
  email_from text not null,
  email_to text,
  cc text,
  subject text,
  body text,
  received_on timestamptz,
  archived boolean default false,
  bounced boolean default false,
  out_of_office boolean default false,
  cached_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_emails_cache_message_id on public.crm_emails_cache(crm_message_id);
create index if not exists idx_crm_emails_cache_client_id on public.crm_emails_cache(client_id);
create index if not exists idx_crm_emails_cache_received_on on public.crm_emails_cache(received_on desc);
create index if not exists idx_crm_emails_cache_cached_at on public.crm_emails_cache(cached_at desc);

-- CRM Customers Cache Table
create table if not exists public.crm_customers_cache (
  id uuid primary key default gen_random_uuid(),
  client_id integer not null unique,
  email text,
  firstname text,
  lastname text,
  phone text,
  mobile text,
  address1 text,
  address2 text,
  town text,
  county text,
  postcode text,
  dob date,
  occupation text,
  marital_status text,
  iva_signing_date date,
  iva_completion_date date,
  total_debt decimal(10, 2),
  monthly_payment decimal(10, 2),
  arrears decimal(10, 2),
  cached_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_customers_cache_client_id on public.crm_customers_cache(client_id);
create index if not exists idx_crm_customers_cache_email on public.crm_customers_cache(email);

-- Disable RLS (using session-based auth, not Supabase auth)
alter table public.sync_state disable row level security;
alter table public.tokens disable row level security;
alter table public.emails disable row level security;
alter table public.drafts disable row level security;
alter table public.crm_emails_cache disable row level security;
alter table public.crm_customers_cache disable row level security;
