-- Tokens (1 row for your Gmail tokens)
create table if not exists tokens (
  id uuid primary key default gen_random_uuid(),
  access_token text,
  refresh_token text,
  expiry_date bigint,
  token_type text,
  scope text,
  updated_at timestamptz default now()
);

-- Drafts (matches StoredDraft)
create table if not exists drafts (
  id uuid primary key default gen_random_uuid(),
  email_id text not null,
  subject text not null,
  "from" text not null,
  "to" text not null,
  original_body text not null,
  draft_text text not null,
  created_at timestamptz not null default now()
);

-- Sync state (only one row used)
create table if not exists sync_state (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'idle',
  queued integer not null default 0,
  processed integer not null default 0,
  errors integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz
);create table if not exists public.emails (
  id text primary key,
  thread_id text,
  subject text,
  from_address text,
  to_address text,
  body text,
  date text,
  embedding double precision[],
  labels text[],
  is_sent boolean not null default true,
  is_reply boolean
);-- Add user_email column to all tables for per-user data scoping

-- Add user_email to tokens table (most important for auth)
ALTER TABLE public.tokens 
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Add user_email to emails table
ALTER TABLE public.emails 
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Add user_email to drafts table
ALTER TABLE public.drafts 
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Add user_email to sync_state table
ALTER TABLE public.sync_state 
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_emails_user_email ON public.emails(user_email);
CREATE INDEX IF NOT EXISTS idx_tokens_user_email ON public.tokens(user_email);
CREATE INDEX IF NOT EXISTS idx_drafts_user_email ON public.drafts(user_email);
CREATE INDEX IF NOT EXISTS idx_sync_state_user_email ON public.sync_state(user_email);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  thread_id text not null,
  customer_email text not null,
  customer_name text,
  subject text not null,
  status text not null default 'open',          -- open | pending | on_hold | closed
  priority text not null default 'medium',      -- low | medium | high | urgent
  assignee text,                                -- simple string name for now
  tags text[] default '{}',
  last_customer_reply_at timestamptz,
  last_agent_reply_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_email text
);

create index if not exists idx_tickets_thread_id on public.tickets(thread_id);
create index if not exists idx_tickets_status on public.tickets(status);
create index if not exists idx_tickets_assignee on public.tickets(assignee);
create index if not exists idx_tickets_user_email on public.tickets(user_email);
create index if not exists idx_tickets_last_customer_reply_at
  on public.tickets(last_customer_reply_at);

  -- Task 2: Role & Auth Layer - Supabase Schema
-- Run this SQL in your Supabase SQL editor

-- Create role enum type
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'agent');

-- Create users table for team members
-- All team members share the same Gmail account but have individual identities
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT, -- Optional: personal email (not the shared Gmail)
  role user_role NOT NULL DEFAULT 'agent',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- All users belong to the same shared Gmail account
  -- We'll use user_email from tokens table to link to shared account
  shared_gmail_email TEXT, -- The shared Gmail account email
  CONSTRAINT unique_name_per_account UNIQUE (name, shared_gmail_email)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_shared_gmail ON public.users(shared_gmail_email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON public.users(is_active) WHERE is_active = true;

-- Update tickets table to reference users.id instead of just assignee name
-- First, add user_id column if it doesn't exist
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Create index for assignee lookups
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_user_id ON public.tickets(assignee_user_id);

-- Add user_email to users table for linking to shared Gmail account
-- This allows us to scope users to the correct shared account
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS user_email TEXT;

CREATE INDEX IF NOT EXISTS idx_users_user_email ON public.users(user_email);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_users_updated_at 
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (you'll need to update shared_gmail_email after first login)
-- This is optional - you can create users via the API instead
-- INSERT INTO public.users (name, role, shared_gmail_email, user_email) 
-- VALUES ('Admin', 'admin', NULL, NULL)
-- ON CONFLICT DO NOTHING;

-- Create ticket_notes table for internal notes
-- Notes are only visible to team members, not customers

CREATE TABLE IF NOT EXISTS public.ticket_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_notes_ticket_id ON public.ticket_notes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_notes_user_id ON public.ticket_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_notes_created_at ON public.ticket_notes(created_at);

-- Create trigger to update updated_at
CREATE TRIGGER update_ticket_notes_updated_at 
BEFORE UPDATE ON public.ticket_notes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Make priority column nullable in tickets table
ALTER TABLE public.tickets 
ALTER COLUMN priority DROP NOT NULL;

create table public.ticket_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  unique (user_id, ticket_id)
);

create index ticket_views_user_ticket_idx on public.ticket_views (user_id, ticket_id);
create index ticket_views_ticket_idx on public.ticket_views (ticket_id);


create table if not exists public.ticket_updates (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_email text,
  last_customer_reply_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ticket_updates_ticket_idx on public.ticket_updates(ticket_id);


create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  can_paraphrase boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists knowledge_items_created_idx on public.knowledge_items(created_at desc);


-- Guardrails single-row table
create table if not exists public.guardrails (
  id integer primary key default 1,
  tone_style text,
  rules text,
  banned_words text[] default '{}',
  topic_rules jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- Allow only one row (id=1)
insert into public.guardrails (id)
values (1)
on conflict do nothing;




-- Quick Replies Table
-- Stores pre-written response templates for agents
CREATE TABLE IF NOT EXISTS public.quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT, -- For scoping to shared Gmail account
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_quick_replies_category ON public.quick_replies(category);
CREATE INDEX IF NOT EXISTS idx_quick_replies_tags ON public.quick_replies USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_quick_replies_user_email ON public.quick_replies(user_email);
CREATE INDEX IF NOT EXISTS idx_quick_replies_created_by ON public.quick_replies(created_by);

-- Create trigger to update updated_at (uses your existing function)
CREATE TRIGGER update_quick_replies_updated_at 
BEFORE UPDATE ON public.quick_replies
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();





-- Update INSERT policy to allow all authenticated users
DROP POLICY IF EXISTS "Admins can create quick replies" ON public.quick_replies;
CREATE POLICY "Users can create quick replies"
  ON public.quick_replies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

-- Update UPDATE policy to allow users to edit their own
DROP POLICY IF EXISTS "Admins can update quick replies" ON public.quick_replies;
CREATE POLICY "Users can update quick replies"
  ON public.quick_replies
  FOR UPDATE
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
    AND (
      created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'manager')
        AND users.user_email = quick_replies.user_email
      )
    )
  );

-- Update DELETE policy similarly
DROP POLICY IF EXISTS "Admins can delete quick replies" ON public.quick_replies;
CREATE POLICY "Users can delete quick replies"
  ON public.quick_replies
  FOR DELETE
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
    AND (
      created_by = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.users
        WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'manager')
        AND users.user_email = quick_replies.user_email
      )
    )
  );







-- SUPABASE SCHEMA UPDATES
-- Add these to your existing schema script
-- ============================================

-- ============================================
-- 1. Add created_by column to drafts table
-- ============================================
ALTER TABLE public.drafts 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 2. Add index on drafts.created_by for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_drafts_created_by ON public.drafts(created_by);

-- ============================================
-- 3. Add foreign key constraint (already included in ALTER TABLE above, but explicit for clarity)
-- ============================================
-- Note: The foreign key is already added in the ALTER TABLE statement above
-- If you need to add it separately, use:
-- ALTER TABLE public.drafts 
-- ADD CONSTRAINT fk_drafts_created_by 
-- FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ============================================
-- 4. Fix Quick Replies RLS Policies
-- The current policies use auth.uid() which won't work since we're using custom session cookies
-- We need to update them to work without Supabase Auth
-- ============================================

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can read quick replies" ON public.quick_replies;

-- Create new SELECT policy that filters by created_by (matching API behavior)
-- Since we can't use auth.uid(), we'll rely on API-level filtering
-- But we still need RLS for security - allow all authenticated users to read
-- The API will filter by created_by
CREATE POLICY "Users can read quick replies"
  ON public.quick_replies
  FOR SELECT
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

-- Note: The UPDATE and DELETE policies already check created_by, but they use auth.uid()
-- Since auth.uid() won't work, we need to update them to not rely on it
-- However, the API already does permission checks, so RLS just needs to ensure
-- users can only access quick replies for their shared Gmail account

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update quick replies" ON public.quick_replies;

-- Create new UPDATE policy (API will check created_by ownership)
CREATE POLICY "Users can update quick replies"
  ON public.quick_replies
  FOR UPDATE
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  )
  WITH CHECK (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

-- Drop existing DELETE policy
DROP POLICY IF EXISTS "Users can delete quick replies" ON public.quick_replies;

-- Create new DELETE policy (API will check created_by ownership)
CREATE POLICY "Users can delete quick replies"
  ON public.quick_replies
  FOR DELETE
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

-- ============================================
-- 5. Add RLS policies for drafts table (if RLS is enabled)
-- ============================================

-- Enable RLS on drafts table (if not already enabled)
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

-- SELECT policy: Users can only see their own drafts (filtered by created_by)
-- The API filters by created_by, but RLS provides additional security
CREATE POLICY "Users can read their own drafts"
  ON public.drafts
  FOR SELECT
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

-- INSERT policy: Users can create drafts
CREATE POLICY "Users can create drafts"
  ON public.drafts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

-- UPDATE policy: Users can update their own drafts
-- The API will check created_by ownership
CREATE POLICY "Users can update their own drafts"
  ON public.drafts
  FOR UPDATE
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  )
  WITH CHECK (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

-- DELETE policy: Users can delete their own drafts
-- The API will check created_by ownership
CREATE POLICY "Users can delete their own drafts"
  ON public.drafts
  FOR DELETE
  TO authenticated
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );







  -- Guardrails: scope per email account
ALTER TABLE public.guardrails
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guardrails_user_email ON public.guardrails(user_email);
CREATE INDEX IF NOT EXISTS idx_guardrails_created_by ON public.guardrails(created_by);

-- Optional: ensure only one row per email account
CREATE UNIQUE INDEX IF NOT EXISTS uniq_guardrails_per_email ON public.guardrails(user_email);

-- Enable RLS
ALTER TABLE public.guardrails ENABLE ROW LEVEL SECURITY;

-- RLS policies (match your other tables: allow authenticated for that account)
DROP POLICY IF EXISTS "Users can read guardrails" ON public.guardrails;
CREATE POLICY "Users can read guardrails" ON public.guardrails
  FOR SELECT TO authenticated
  USING (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));

DROP POLICY IF EXISTS "Users can insert guardrails" ON public.guardrails;
CREATE POLICY "Users can insert guardrails" ON public.guardrails
  FOR INSERT TO authenticated
  WITH CHECK (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));

DROP POLICY IF EXISTS "Users can update guardrails" ON public.guardrails;
CREATE POLICY "Users can update guardrails" ON public.guardrails
  FOR UPDATE TO authenticated
  USING (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL))
  WITH CHECK (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));

DROP POLICY IF EXISTS "Users can delete guardrails" ON public.guardrails;
CREATE POLICY "Users can delete guardrails" ON public.guardrails
  FOR DELETE TO authenticated
  USING (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));




-- Guardrails draft columns so saves work even if only tone is set
ALTER TABLE public.guardrails
  ADD COLUMN IF NOT EXISTS draft_tone_style TEXT,
  ADD COLUMN IF NOT EXISTS draft_rules TEXT,
  ADD COLUMN IF NOT EXISTS draft_banned_words TEXT[],
  ADD COLUMN IF NOT EXISTS draft_topic_rules JSONB,
  ADD COLUMN IF NOT EXISTS pending BOOLEAN DEFAULT false;

-- Backfill defaults for existing rows
UPDATE public.guardrails
SET
  draft_banned_words = COALESCE(draft_banned_words, '{}'),
  draft_topic_rules = COALESCE(draft_topic_rules, '[]'::jsonb),
  pending = COALESCE(pending, false);

UPDATE public.guardrails
SET pending = false
WHERE pending = true
  AND COALESCE(draft_tone_style, '') = ''
  AND COALESCE(draft_rules, '') = ''
  AND (draft_banned_words IS NULL OR array_length(draft_banned_words, 1) IS NULL OR draft_banned_words = '{}')
  AND (draft_topic_rules IS NULL OR draft_topic_rules = '[]'::jsonb);



  -- ============================================
-- Task 11: Analytics & Logging Tables
-- ============================================

-- 1. Guardrail Usage Logs
CREATE TABLE IF NOT EXISTS public.guardrail_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  draft_id TEXT,
  action TEXT NOT NULL, -- 'applied', 'blocked', 'topic_rule_triggered'
  guardrail_type TEXT, -- 'tone_style', 'rules', 'banned_words', 'topic_rule'
  details JSONB,
  draft_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardrail_logs_user_email ON public.guardrail_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_guardrail_logs_user_id ON public.guardrail_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_logs_ticket_id ON public.guardrail_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_guardrail_logs_action ON public.guardrail_logs(action);
CREATE INDEX IF NOT EXISTS idx_guardrail_logs_created_at ON public.guardrail_logs(created_at);

-- 2. AI Usage Logs
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'draft_generated', 'draft_regenerated', 'draft_edited', 'draft_sent', 'knowledge_used'
  draft_id TEXT,
  knowledge_item_ids UUID[],
  guardrail_applied BOOLEAN DEFAULT false,
  guardrail_blocked BOOLEAN DEFAULT false,
  response_time_ms INTEGER,
  draft_length INTEGER,
  was_edited BOOLEAN DEFAULT false,
  was_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_email ON public.ai_usage_logs(user_email);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_ticket_id ON public.ai_usage_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_action ON public.ai_usage_logs(action);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_knowledge_items ON public.ai_usage_logs USING GIN(knowledge_item_ids);

-- 3. Ticket Analytics (aggregated data)
CREATE TABLE IF NOT EXISTS public.ticket_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL, -- 'open', 'pending', 'on_hold', 'closed'
  count INTEGER NOT NULL DEFAULT 0,
  avg_response_time_minutes INTEGER,
  avg_resolution_time_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_email, date, status)
);

CREATE INDEX IF NOT EXISTS idx_ticket_analytics_user_email ON public.ticket_analytics(user_email);
CREATE INDEX IF NOT EXISTS idx_ticket_analytics_date ON public.ticket_analytics(date);
CREATE INDEX IF NOT EXISTS idx_ticket_analytics_status ON public.ticket_analytics(status);
CREATE INDEX IF NOT EXISTS idx_ticket_analytics_user_date ON public.ticket_analytics(user_email, date);

-- 4. Agent Performance Metrics
CREATE TABLE IF NOT EXISTS public.agent_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  tickets_assigned INTEGER DEFAULT 0,
  tickets_closed INTEGER DEFAULT 0,
  avg_response_time_minutes INTEGER,
  avg_resolution_time_minutes INTEGER,
  ai_drafts_generated INTEGER DEFAULT 0,
  drafts_sent INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_email, user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_agent_performance_user_email ON public.agent_performance(user_email);
CREATE INDEX IF NOT EXISTS idx_agent_performance_user_id ON public.agent_performance(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_performance_date ON public.agent_performance(date);
CREATE INDEX IF NOT EXISTS idx_agent_performance_user_date ON public.agent_performance(user_email, date);

-- 5. Triggers for updated_at
CREATE TRIGGER update_ticket_analytics_updated_at 
BEFORE UPDATE ON public.ticket_analytics
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_agent_performance_updated_at 
BEFORE UPDATE ON public.agent_performance
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 6. Enable RLS
ALTER TABLE public.guardrail_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_performance ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
CREATE POLICY "Users can read guardrail logs"
  ON public.guardrail_logs
  FOR SELECT
  TO authenticated
  USING (true); -- API will filter by user_email

CREATE POLICY "Users can read ai usage logs"
  ON public.ai_usage_logs
  FOR SELECT
  TO authenticated
  USING (true); -- API will filter by user_email

CREATE POLICY "Users can read ticket analytics"
  ON public.ticket_analytics
  FOR SELECT
  TO authenticated
  USING (true); -- API will filter by user_email

CREATE POLICY "Users can read agent performance"
  ON public.agent_performance
  FOR SELECT
  TO authenticated
  USING (true); -- API will filter by user_email




  ALTER TABLE public.knowledge_items
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_knowledge_items_user_email ON public.knowledge_items(user_email);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_created_by ON public.knowledge_items(created_by);

ALTER TABLE public.knowledge_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read knowledge items" ON public.knowledge_items;
CREATE POLICY "Users can read knowledge items"
  ON public.knowledge_items
  FOR SELECT TO authenticated
  USING (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));

DROP POLICY IF EXISTS "Users can insert knowledge items" ON public.knowledge_items;
CREATE POLICY "Users can insert knowledge items"
  ON public.knowledge_items
  FOR INSERT TO authenticated
  WITH CHECK (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));

DROP POLICY IF EXISTS "Users can update knowledge items" ON public.knowledge_items;
CREATE POLICY "Users can update knowledge items"
  ON public.knowledge_items
  FOR UPDATE TO authenticated
  USING (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL))
  WITH CHECK (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));

DROP POLICY IF EXISTS "Users can delete knowledge items" ON public.knowledge_items;
CREATE POLICY "Users can delete knowledge items"
  ON public.knowledge_items
  FOR DELETE TO authenticated
  USING (user_email IN (SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL));





  -- ============================================
-- Shopify Integration Schema
-- Add this section to your existing schema
-- ============================================

-- Shopify Configuration Table
-- Stores Shopify API credentials per Gmail account
CREATE TABLE IF NOT EXISTS public.shopify_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  shop_domain TEXT NOT NULL, -- e.g., "your-shop.myshopify.com"
  access_token TEXT NOT NULL, -- Private app access token
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_email)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_shopify_config_user_email ON public.shopify_config(user_email);

-- Trigger to update updated_at
CREATE TRIGGER update_shopify_config_updated_at 
  BEFORE UPDATE ON public.shopify_config 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE public.shopify_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Only allow users to access their own Shopify config
DROP POLICY IF EXISTS "Users can read their own Shopify config" ON public.shopify_config;
CREATE POLICY "Users can read their own Shopify config" 
  ON public.shopify_config 
  FOR SELECT 
  TO authenticated 
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Admins can manage Shopify config" ON public.shopify_config;
CREATE POLICY "Admins can manage Shopify config" 
  ON public.shopify_config 
  FOR ALL 
  TO authenticated 
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.user_email = shopify_config.user_email 
      AND users.role = 'admin'
    )
  )
  WITH CHECK (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.user_email = shopify_config.user_email 
      AND users.role = 'admin'
    )
  );

-- Customer Cache Table (optional - for performance)
-- Caches customer data to reduce API calls
CREATE TABLE IF NOT EXISTS public.shopify_customer_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  shopify_customer_id BIGINT,
  customer_data JSONB NOT NULL, -- Full customer data from Shopify
  orders_data JSONB, -- Recent orders data
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE(user_email, customer_email)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shopify_cache_user_email ON public.shopify_customer_cache(user_email);
CREATE INDEX IF NOT EXISTS idx_shopify_cache_customer_email ON public.shopify_customer_cache(customer_email);
CREATE INDEX IF NOT EXISTS idx_shopify_cache_expires_at ON public.shopify_customer_cache(expires_at);

-- Enable RLS
ALTER TABLE public.shopify_customer_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cache
DROP POLICY IF EXISTS "Users can read their own cached customer data" ON public.shopify_customer_cache;
CREATE POLICY "Users can read their own cached customer data" 
  ON public.shopify_customer_cache 
  FOR SELECT 
  TO authenticated 
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "Users can cache their own customer data" ON public.shopify_customer_cache;
CREATE POLICY "Users can cache their own customer data" 
  ON public.shopify_customer_cache 
  FOR ALL 
  TO authenticated 
  USING (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  )
  WITH CHECK (
    user_email IN (
      SELECT user_email FROM public.tokens WHERE user_email IS NOT NULL
    )
  );



  -- Run this in your Supabase SQL editor or migration
ALTER TABLE public.ticket_notes ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_ticket_notes_mentions_gin ON public.ticket_notes USING GIN (mentions);


-- Mentions field (if not already applied)
ALTER TABLE public.ticket_notes ADD COLUMN IF NOT EXISTS mentions JSONB NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_ticket_notes_mentions_gin ON public.ticket_notes USING GIN (mentions);

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('mention','assignment')),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE,
  note_id UUID REFERENCES public.ticket_notes(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);










































-- ============================================
-- DROP ALL RLS POLICIES FIRST
-- ============================================

-- Quick Replies policies
DROP POLICY IF EXISTS "Users can create quick replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Users can read quick replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Users can update quick replies" ON public.quick_replies;
DROP POLICY IF EXISTS "Users can delete quick replies" ON public.quick_replies;

-- Drafts policies
DROP POLICY IF EXISTS "Users can read their own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can create drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can update their own drafts" ON public.drafts;
DROP POLICY IF EXISTS "Users can delete their own drafts" ON public.drafts;

-- Guardrails policies
DROP POLICY IF EXISTS "Users can read guardrails" ON public.guardrails;
DROP POLICY IF EXISTS "Users can insert guardrails" ON public.guardrails;
DROP POLICY IF EXISTS "Users can update guardrails" ON public.guardrails;
DROP POLICY IF EXISTS "Users can delete guardrails" ON public.guardrails;

-- Knowledge Items policies
DROP POLICY IF EXISTS "Users can read knowledge items" ON public.knowledge_items;
DROP POLICY IF EXISTS "Users can insert knowledge items" ON public.knowledge_items;
DROP POLICY IF EXISTS "Users can update knowledge items" ON public.knowledge_items;
DROP POLICY IF EXISTS "Users can delete knowledge items" ON public.knowledge_items;

-- Shopify Config policies
DROP POLICY IF EXISTS "Users can read their own Shopify config" ON public.shopify_config;
DROP POLICY IF EXISTS "Admins can manage Shopify config" ON public.shopify_config;

-- Shopify Customer Cache policies
DROP POLICY IF EXISTS "Users can read their own cached customer data" ON public.shopify_customer_cache;
DROP POLICY IF EXISTS "Users can cache their own customer data" ON public.shopify_customer_cache;

-- Guardrail Logs policies
DROP POLICY IF EXISTS "Users can read guardrail logs" ON public.guardrail_logs;

-- AI Usage Logs policies
DROP POLICY IF EXISTS "Users can read ai usage logs" ON public.ai_usage_logs;

-- Ticket Analytics policies
DROP POLICY IF EXISTS "Users can read ticket analytics" ON public.ticket_analytics;

-- Agent Performance policies
DROP POLICY IF EXISTS "Users can read agent performance" ON public.agent_performance;

-- ============================================
-- DISABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE public.drafts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_replies DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardrails DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopify_customer_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardrail_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_analytics DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_performance DISABLE ROW LEVEL SECURITY;

-- ============================================
-- NOW DROP THE TABLES
-- ============================================

DROP TABLE IF EXISTS public.tokens CASCADE;
DROP TABLE IF EXISTS public.emails CASCADE;
DROP TABLE IF EXISTS public.sync_state CASCADE;

-- ============================================
-- ADD CRM FIELDS TO TICKETS
-- ============================================

ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS crm_message_id INTEGER,
ADD COLUMN IF NOT EXISTS client_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_tickets_crm_message ON public.tickets(crm_message_id);
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON public.tickets(client_id);

-- ============================================
-- REMOVE user_email COLUMNS AND INDEXES
-- ============================================

-- Drop indexes first
DROP INDEX IF EXISTS idx_drafts_user_email;
DROP INDEX IF EXISTS idx_quick_replies_user_email;
DROP INDEX IF EXISTS idx_guardrails_user_email;
DROP INDEX IF EXISTS idx_guardrails_created_by;
DROP INDEX IF EXISTS uniq_guardrails_per_email;
DROP INDEX IF EXISTS idx_knowledge_items_user_email;
DROP INDEX IF EXISTS idx_shopify_config_user_email;
DROP INDEX IF EXISTS idx_shopify_cache_user_email;

-- Drop columns
ALTER TABLE public.drafts DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.ticket_updates DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.quick_replies DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.guardrails DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.knowledge_items DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.guardrail_logs DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.ai_usage_logs DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.ticket_analytics DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.agent_performance DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.shopify_config DROP COLUMN IF EXISTS user_email;
ALTER TABLE public.shopify_customer_cache DROP COLUMN IF EXISTS user_email;

-- ============================================
-- CLEAN UP USERS TABLE
-- ============================================

DROP INDEX IF EXISTS idx_users_shared_gmail;
DROP INDEX IF EXISTS idx_users_user_email;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS unique_name_per_account;

ALTER TABLE public.users 
DROP COLUMN IF EXISTS shared_gmail_email,
DROP COLUMN IF EXISTS user_email;

-- Add simple unique constraint on name
-- ============================================
-- CLEAN UP USERS TABLE
-- ============================================

DROP INDEX IF EXISTS idx_users_shared_gmail;
DROP INDEX IF EXISTS idx_users_user_email;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS unique_name_per_account;

ALTER TABLE public.users 
DROP COLUMN IF EXISTS shared_gmail_email,
DROP COLUMN IF EXISTS user_email;

-- Add simple unique constraint on name
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS unique_user_name;
ALTER TABLE public.users ADD CONSTRAINT unique_user_name UNIQUE (name);
-- ============================================
-- DONE!
-- ============================================



-- ============================================
-- CRM Cache Layer for Supabase
-- Caches MySQL CRM data locally for faster access
-- ============================================

-- CRM Emails Cache Table
-- Stores emails fetched from MySQL CRM database
CREATE TABLE IF NOT EXISTS public.crm_emails_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_message_id INTEGER NOT NULL UNIQUE, -- ID from message_received table
  thread_id TEXT,
  client_id INTEGER,
  email_from TEXT NOT NULL,
  email_to TEXT,
  cc TEXT,
  subject TEXT,
  body TEXT,
  received_on TIMESTAMPTZ,
  archived BOOLEAN DEFAULT false,
  bounced BOOLEAN DEFAULT false,
  out_of_office BOOLEAN DEFAULT false,
  -- Cache metadata
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_crm_emails_cache_message_id ON public.crm_emails_cache(crm_message_id);
CREATE INDEX IF NOT EXISTS idx_crm_emails_cache_client_id ON public.crm_emails_cache(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_emails_cache_thread_id ON public.crm_emails_cache(thread_id);
CREATE INDEX IF NOT EXISTS idx_crm_emails_cache_received_on ON public.crm_emails_cache(received_on DESC);
CREATE INDEX IF NOT EXISTS idx_crm_emails_cache_from ON public.crm_emails_cache(email_from);
CREATE INDEX IF NOT EXISTS idx_crm_emails_cache_cached_at ON public.crm_emails_cache(cached_at DESC);

-- Trigger to update updated_at
CREATE TRIGGER update_crm_emails_cache_updated_at 
  BEFORE UPDATE ON public.crm_emails_cache 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- CRM Customers Cache Table
-- Stores customer data from client + iva_client tables
CREATE TABLE IF NOT EXISTS public.crm_customers_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id INTEGER NOT NULL UNIQUE, -- ID from client table
  email TEXT,
  firstname TEXT,
  lastname TEXT,
  phone TEXT,
  mobile TEXT,
  address1 TEXT,
  address2 TEXT,
  town TEXT,
  county TEXT,
  postcode TEXT,
  dob DATE,
  occupation TEXT,
  marital_status TEXT,
  -- IVA data from iva_client table
  iva_signing_date DATE,
  iva_completion_date DATE,
  total_debt DECIMAL(10, 2),
  monthly_payment DECIMAL(10, 2),
  arrears DECIMAL(10, 2),
  -- Cache metadata
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add missing columns if they don't exist (for backwards compatibility)
ALTER TABLE public.crm_customers_cache 
  ADD COLUMN IF NOT EXISTS firstname TEXT,
  ADD COLUMN IF NOT EXISTS lastname TEXT,
  ADD COLUMN IF NOT EXISTS dob DATE,
  ADD COLUMN IF NOT EXISTS occupation TEXT,
  ADD COLUMN IF NOT EXISTS marital_status TEXT;

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_crm_customers_cache_client_id ON public.crm_customers_cache(client_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_cache_email ON public.crm_customers_cache(email);
CREATE INDEX IF NOT EXISTS idx_crm_customers_cache_cached_at ON public.crm_customers_cache(cached_at DESC);

-- Trigger to update updated_at
CREATE TRIGGER update_crm_customers_cache_updated_at 
  BEFORE UPDATE ON public.crm_customers_cache 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Disable RLS (we're using session-based auth, not Supabase auth)
ALTER TABLE public.crm_emails_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_customers_cache DISABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to clean up old cache entries (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_crm_cache()
RETURNS void AS $$
BEGIN
  -- Delete emails older than 7 days
  DELETE FROM public.crm_emails_cache
  WHERE cached_at < NOW() - INTERVAL '7 days';
  
  -- Delete customer data older than 7 days
  DELETE FROM public.crm_customers_cache
  WHERE cached_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Function to get cache statistics
CREATE OR REPLACE FUNCTION get_crm_cache_stats()
RETURNS TABLE(
  total_emails BIGINT,
  total_customers BIGINT,
  emails_last_24h BIGINT,
  customers_last_24h BIGINT,
  oldest_email_cache TIMESTAMPTZ,
  newest_email_cache TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM public.crm_emails_cache) as total_emails,
    (SELECT COUNT(*) FROM public.crm_customers_cache) as total_customers,
    (SELECT COUNT(*) FROM public.crm_emails_cache WHERE cached_at > NOW() - INTERVAL '24 hours') as emails_last_24h,
    (SELECT COUNT(*) FROM public.crm_customers_cache WHERE cached_at > NOW() - INTERVAL '24 hours') as customers_last_24h,
    (SELECT MIN(cached_at) FROM public.crm_emails_cache) as oldest_email_cache,
    (SELECT MAX(cached_at) FROM public.crm_emails_cache) as newest_email_cache;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- NOTES
-- ============================================
-- 1. Cache emails after first fetch from MySQL
-- 2. Check cache first before querying MySQL
-- 3. Update cache when emails are fetched from MySQL
-- 4. Cache TTL: 7 days (configurable)
-- 5. Run cleanup_old_crm_cache() periodically (daily cron job)
-- 6. Use ON CONFLICT (crm_message_id) DO UPDATE for upserts
-- 7. Use ON CONFLICT (client_id) DO UPDATE for customer upserts
