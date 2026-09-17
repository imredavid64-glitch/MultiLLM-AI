import { createServerSupabaseClient } from '@/lib/supabase/client';
import type { Database } from '@/types/supabase';

type Profile = Database['public']['Tables']['profiles']['Row'];
type ApiKey = Database['public']['Tables']['api_keys']['Row'];
type Query = Database['public']['Tables']['queries']['Row'];
type TrainingJob = Database['public']['Tables']['training_jobs']['Row'];
type Subscription = Database['public']['Tables']['subscriptions']['Row'];
type PlatformApiKey = Database['public']['Tables']['platform_api_keys']['Row'];
type ClientProject = Database['public']['Tables']['client_projects']['Row'];

export const supabaseServer = createServerSupabaseClient();

// Profile operations
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
  const { data, error } = await supabaseServer
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function incrementCredits(userId: string, amount: number): Promise<Profile | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;
  return updateProfile(userId, { credits: profile.credits + amount });
}

export async function decrementCredits(userId: string, amount: number): Promise<Profile | null> {
  const profile = await getProfile(userId);
  if (!profile) return null;
  const newCredits = Math.max(0, profile.credits - amount);
  return updateProfile(userId, { credits: newCredits });
}

// API Key operations
export async function getApiKeys(userId: string): Promise<ApiKey[]> {
  const { data, error } = await supabaseServer
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) return [];
  return data;
}

export async function getApiKey(userId: string, provider: string): Promise<ApiKey | null> {
  const { data, error } = await supabaseServer
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider)
    .eq('is_active', true)
    .single();
  if (error) return null;
  return data;
}

export async function createApiKey(
  userId: string,
  provider: string,
  name: string,
  encryptedKey: string
): Promise<ApiKey | null> {
  const { data, error } = await supabaseServer
    .from('api_keys')
    .insert({ user_id: userId, provider, name, encrypted_key: encryptedKey })
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function updateApiKey(id: string, updates: Partial<ApiKey>): Promise<ApiKey | null> {
  const { data, error } = await supabaseServer
    .from('api_keys')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function deleteApiKey(id: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('api_keys')
    .delete()
    .eq('id', id);
  return !error;
}

export async function incrementApiKeyUsage(id: string): Promise<void> {
  await supabaseServer
    .from('api_keys')
    .update({ usage_count: supabaseServer.rpc('increment', { x: 1 }), last_used_at: new Date().toISOString() })
    .eq('id', id);
}

// Platform API Key operations (gateway keys for programmatic access)
export async function createPlatformApiKey(
  userId: string,
  name: string,
  tier: 'free' | 'pro' | 'enterprise',
  keyPrefix: string,
  keyHash: string
): Promise<PlatformApiKey | null> {
  const { data, error } = await supabaseServer
    .from('platform_api_keys')
    .insert({ user_id: userId, name, tier, key_prefix: keyPrefix, key_hash: keyHash })
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function getPlatformApiKeys(userId: string): Promise<PlatformApiKey[]> {
  const { data, error } = await supabaseServer
    .from('platform_api_keys')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

export async function getPlatformApiKeyByHash(keyHash: string): Promise<PlatformApiKey | null> {
  const { data, error } = await supabaseServer
    .from('platform_api_keys')
    .select('*')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();
  if (error) return null;
  return data;
}

export async function getPlatformApiKeyById(id: string): Promise<PlatformApiKey | null> {
  const { data, error } = await supabaseServer
    .from('platform_api_keys')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function deletePlatformApiKey(id: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('platform_api_keys')
    .delete()
    .eq('id', id);
  return !error;
}

export async function touchPlatformApiKeyUsage(id: string, currentUsageCount: number): Promise<void> {
  await supabaseServer
    .from('platform_api_keys')
    .update({ usage_count: currentUsageCount + 1, last_used_at: new Date().toISOString() })
    .eq('id', id);
}

// Client project operations (multi-tenant: one row per end-client an agency
// user serves; queries can be tagged against a project for per-client
// reporting).
export const CLIENT_PROJECT_LIMITS: Record<'free' | 'pro' | 'enterprise', number> = {
  free: 5,
  pro: 25,
  enterprise: Infinity,
};

export async function createClientProject(userId: string, name: string): Promise<ClientProject | null> {
  const { data, error } = await supabaseServer
    .from('client_projects')
    .insert({ user_id: userId, name })
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function getClientProjects(userId: string): Promise<ClientProject[]> {
  const { data, error } = await supabaseServer
    .from('client_projects')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

export async function getClientProject(id: string): Promise<ClientProject | null> {
  const { data, error } = await supabaseServer
    .from('client_projects')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function countActiveClientProjects(userId: string): Promise<number> {
  const { count, error } = await supabaseServer
    .from('client_projects')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) return 0;
  return count ?? 0;
}

export async function deleteClientProject(id: string): Promise<boolean> {
  const { error } = await supabaseServer
    .from('client_projects')
    .update({ is_active: false })
    .eq('id', id);
  return !error;
}

// Query History operations
export async function createQuery(query: Database['public']['Tables']['queries']['Insert']): Promise<Query | null> {
  const { data, error } = await supabaseServer
    .from('queries')
    .insert(query)
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function getQueries(userId: string, limit = 50, offset = 0): Promise<Query[]> {
  const { data, error } = await supabaseServer
    .from('queries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return data;
}

export async function getQueryStats(userId: string): Promise<{
  totalQueries: number;
  totalCreditsUsed: number;
  avgLatency: number;
  totalCarbonSaved: number;
}> {
  const { data, error } = await supabaseServer
    .from('queries')
    .select('latency_ms, carbon_saved')
    .eq('user_id', userId);
  if (error || !data.length) {
    return { totalQueries: 0, totalCreditsUsed: 0, avgLatency: 0, totalCarbonSaved: 0 };
  }
  return {
    totalQueries: data.length,
    totalCreditsUsed: data.length,
    avgLatency: data.reduce((a: number, b: Query) => a + b.latency_ms, 0) / data.length,
    totalCarbonSaved: data.reduce((a: number, b: Query) => a + b.carbon_saved, 0),
  };
}

// Training Job operations
export async function createTrainingJob(job: Database['public']['Tables']['training_jobs']['Insert']): Promise<TrainingJob | null> {
  const { data, error } = await supabaseServer
    .from('training_jobs')
    .insert(job)
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function getTrainingJobs(userId: string): Promise<TrainingJob[]> {
  const { data, error } = await supabaseServer
    .from('training_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return data;
}

export async function getTrainingJob(id: string): Promise<TrainingJob | null> {
  const { data, error } = await supabaseServer
    .from('training_jobs')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function updateTrainingJob(id: string, updates: Partial<TrainingJob>): Promise<TrainingJob | null> {
  const { data, error } = await supabaseServer
    .from('training_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) return null;
  return data;
}

// Subscription operations
export async function getSubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabaseServer
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function getSubscriptionByCustomer(customerId: string): Promise<Subscription | null> {
  const { data, error } = await supabaseServer
    .from('subscriptions')
    .select('*')
    .eq('stripe_customer_id', customerId)
    .single();
  if (error) return null;
  return data;
}

export async function upsertSubscription(subscription: Database['public']['Tables']['subscriptions']['Insert']): Promise<Subscription | null> {
  const { data, error } = await supabaseServer
    .from('subscriptions')
    .upsert(subscription, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) return null;
  return data;
}

export async function updateSubscription(userId: string, updates: Partial<Subscription>): Promise<Subscription | null> {
  const { data, error } = await supabaseServer
    .from('subscriptions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .select()
    .single();
  if (error) return null;
  return data;
}

// Storage operations
export async function uploadModelArtifact(userId: string, fileName: string, file: Buffer): Promise<string | null> {
  const { data, error } = await supabaseServer.storage
    .from('model-artifacts')
    .upload(`${userId}/${fileName}`, file, { contentType: 'application/octet-stream', upsert: true });
  if (error) return null;
  return data.path;
}

export async function downloadModelArtifact(path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseServer.storage
    .from('model-artifacts')
    .download(path);
  if (error) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function listModelArtifacts(userId: string): Promise<string[]> {
  const { data, error } = await supabaseServer.storage
    .from('model-artifacts')
    .list(userId);
  if (error) return [];
  return data.map((f: { name: string }) => f.name);
}

export async function uploadKnowledgeSource(userId: string, fileName: string, file: Buffer, contentType: string): Promise<string | null> {
  const { data, error } = await supabaseServer.storage
    .from('knowledge-sources')
    .upload(`${userId}/${fileName}`, file, { contentType, upsert: true });
  if (error) return null;
  return data.path;
}

export async function listKnowledgeSources(userId: string): Promise<string[]> {
  const { data, error } = await supabaseServer.storage
    .from('knowledge-sources')
    .list(userId);
  if (error) return [];
  return data.map((f: { name: string }) => f.name);
}