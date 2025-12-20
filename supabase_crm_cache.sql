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
