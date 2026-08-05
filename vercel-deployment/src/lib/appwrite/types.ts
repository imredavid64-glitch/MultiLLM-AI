export interface User {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  name: string;
  email: string;
  prefs: UserPrefs;
}

export interface UserPrefs {
  subscriptionTier: "free" | "pro" | "enterprise";
  apiKeys: ApiKey[];
  models: string[];
  monthlyQueries: number;
  totalQueries: number;
  totalCarbonSaved: number;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  hashed: string;
  tier: "free" | "pro" | "enterprise";
  rateLimit: number;
  monthlyUsage: number;
  lastUsed?: string;
  createdAt: string;
  expiresAt?: string;
}

export interface QueryRecord {
  $id: string;
  userId: string;
  prompt: string;
  answer: string;
  model: string;
  provider: string;
  latency: number;
  carbonSaved: number;
  emissions: number;
  accuracy: number;
  tokensUsed: number;
  createdAt: string;
}

export interface TrainingJob {
  $id: string;
  userId: string;
  name: string;
  status: "pending" | "training" | "completed" | "failed";
  baseModel: string;
  trainingData: string[];
  epochs: number;
  learningRate: number;
  accuracy?: number;
  loss?: number;
  modelPath?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  queriesPerMonth: number;
  rateLimit: number;
  models: string[];
  features: string[];
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    queriesPerMonth: 100,
    rateLimit: 10,
    models: ["gemma-2b", "qwen-1.8b"],
    features: ["Ensemble scoring", "Basic analytics", "API access"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    queriesPerMonth: 10000,
    rateLimit: 100,
    models: ["gemma-2b", "qwen-1.8b", "mistral-7b", "llama-3-8b"],
    features: ["All Free features", "Priority queue", "Custom models", "Model training", "Advanced analytics", "Export data"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 299,
    queriesPerMonth: -1,
    rateLimit: 1000,
    models: ["all"],
    features: ["All Pro features", "Dedicated infrastructure", "SLA", "Custom deployment", "On-premise option", "Priority support"],
  },
];

export const DATABASE_ID = "multi-llm";
export const COLLECTIONS = {
  USERS: "users",
  QUERIES: "queries",
  API_KEYS: "api_keys",
  TRAINING_JOBS: "training_jobs",
};