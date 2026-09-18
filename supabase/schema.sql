-- Supabase Schema for MultiLLM
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    credits INTEGER NOT NULL DEFAULT 100,
    plan_expires_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API Keys table (encrypted)
CREATE TABLE IF NOT EXISTS public.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini', 'mistral', 'openrouter')),
    name TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Query History
CREATE TABLE IF NOT EXISTS public.queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    top_provider TEXT NOT NULL,
    top_model TEXT NOT NULL,
    confidence_score DOUBLE PRECISION NOT NULL,
    latency_ms DOUBLE PRECISION NOT NULL,
    carbon_saved DOUBLE PRECISION NOT NULL,
    emissions DOUBLE PRECISION NOT NULL,
    candidates JSONB,
    sources JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Training Jobs
CREATE TABLE IF NOT EXISTS public.training_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    kind TEXT NOT NULL DEFAULT 'both' CHECK (kind IN ('generator', 'scorer', 'both')),
    epochs INTEGER NOT NULL DEFAULT 20,
    batch_size INTEGER NOT NULL DEFAULT 16,
    n_layer INTEGER NOT NULL DEFAULT 6,
    n_head INTEGER NOT NULL DEFAULT 4,
    n_embd INTEGER NOT NULL DEFAULT 128,
    learning_rate DOUBLE PRECISION NOT NULL DEFAULT 0.003,
    logs TEXT,
    model_path TEXT,
    final_loss DOUBLE PRECISION,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Added after the initial release -- covers a fresh CREATE TABLE above (no-op
-- there) and backfills a pre-existing table on an already-provisioned project.
ALTER TABLE public.training_jobs ADD COLUMN IF NOT EXISTS learning_rate DOUBLE PRECISION NOT NULL DEFAULT 0.003;
ALTER TABLE public.training_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Subscriptions (Stripe)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    stripe_subscription_id TEXT UNIQUE,
    plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
    current_period_end TIMESTAMPTZ,
    credits_included INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_queries_user_created ON public.queries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_jobs_user_status ON public.training_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Profiles: users can read/update their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING ((SELECT auth.uid()) = id);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING ((SELECT auth.uid()) = id);

-- API Keys: users can CRUD their own keys
DROP POLICY IF EXISTS "Users can manage own API keys" ON public.api_keys;
CREATE POLICY "Users can manage own API keys" ON public.api_keys
    FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Queries: users can read/create their own queries
DROP POLICY IF EXISTS "Users can view own queries" ON public.queries;
CREATE POLICY "Users can view own queries" ON public.queries
    FOR SELECT USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Users can create queries" ON public.queries;
CREATE POLICY "Users can create queries" ON public.queries
    FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

-- Training Jobs: users can read/create/update their own jobs
DROP POLICY IF EXISTS "Users can manage own training jobs" ON public.training_jobs;
CREATE POLICY "Users can manage own training jobs" ON public.training_jobs
    FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Subscriptions: users can read their own subscription
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription" ON public.subscriptions
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, name, plan, credits)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'name', 'free', 100);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- This is SECURITY DEFINER (needs elevated rights to insert into profiles on
-- a new auth.users row) and only ever meant to run as the trigger below --
-- not to be called directly. Revoke the default PUBLIC/anon/authenticated
-- EXECUTE grant so it isn't exposed as a callable RPC
-- (/rest/v1/rpc/handle_new_user); the trigger itself doesn't need this grant
-- to fire since it runs as part of the INSERT, not via a role's own EXECUTE
-- privilege.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_api_keys_updated_at ON public.api_keys;
CREATE TRIGGER update_api_keys_updated_at
    BEFORE UPDATE ON public.api_keys
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_training_jobs_updated_at ON public.training_jobs;
CREATE TRIGGER update_training_jobs_updated_at
    BEFORE UPDATE ON public.training_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Platform-issued gateway API keys (for programmatic Authorization: Bearer
-- access to /api/query), separate from api_keys above (which stores each
-- user's own BYO provider keys, not platform keys). Only a SHA-256 hash of
-- the key is stored -- the plaintext is shown once at creation and never
-- persisted.
CREATE TABLE IF NOT EXISTS public.platform_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'enterprise')),
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_api_keys_user_id ON public.platform_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_key_hash ON public.platform_api_keys(key_hash);

ALTER TABLE public.platform_api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own platform API keys" ON public.platform_api_keys;
CREATE POLICY "Users can manage own platform API keys" ON public.platform_api_keys
    FOR ALL USING ((SELECT auth.uid()) = user_id);

-- Atomic usage-count increments for both key tables, called only by the
-- backend's service-role client (never a client-supplied key_id) --
-- read-modify-write from application code would lose updates under
-- concurrent requests on the same key.
CREATE OR REPLACE FUNCTION public.increment_api_key_usage(key_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.api_keys
    SET usage_count = usage_count + 1, last_used_at = now()
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.increment_api_key_usage(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_platform_api_key_usage(key_id uuid)
RETURNS void AS $$
BEGIN
    UPDATE public.platform_api_keys
    SET usage_count = usage_count + 1, last_used_at = now()
    WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.increment_platform_api_key_usage(uuid) FROM PUBLIC, anon, authenticated;

-- Multi-tenant client project tracking: an agency user creates one row per
-- end-client they serve, and queries can be tagged against a project so
-- usage/quality can be reported per end-client later.
CREATE TABLE IF NOT EXISTS public.client_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_projects_user_id ON public.client_projects(user_id);

ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own client projects" ON public.client_projects;
CREATE POLICY "Users can manage own client projects" ON public.client_projects
    FOR ALL USING ((SELECT auth.uid()) = user_id);

DROP TRIGGER IF EXISTS update_client_projects_updated_at ON public.client_projects;
CREATE TRIGGER update_client_projects_updated_at
    BEFORE UPDATE ON public.client_projects
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tag queries against a client project (nullable -- not every query needs
-- to belong to one).
ALTER TABLE public.queries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.client_projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_queries_project_id ON public.queries(project_id);

-- Storage buckets (run in Supabase Dashboard > Storage)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES 
--     ('model-artifacts', 'model-artifacts', false, 104857600, ARRAY['application/octet-stream', 'application/json']),
--     ('knowledge-sources', 'knowledge-sources', false, 52428800, ARRAY['text/plain', 'text/markdown', 'application/json', 'text/csv']);