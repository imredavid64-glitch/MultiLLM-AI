#!/usr/bin/env node
/**
 * Appwrite Provisioning Script for MultiLLM
 * 
 * Run with: node scripts/setup-appwrite.js
 * Requires: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY env vars
 */

const { Client, Databases, Functions, Storage, Account, ID, Permission, Role } = require('node-appwrite');
require('dotenv').config({ path: '../.env' });

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const API_KEY = process.env.APPWRITE_API_KEY;
const DATABASE_ID = 'multi-llm';

if (!PROJECT_ID || !API_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   APPWRITE_PROJECT_ID');
  console.error('   APPWRITE_API_KEY');
  console.error('   APPWRITE_ENDPOINT (optional, defaults to cloud)');
  process.exit(1);
}

const client = new Client()
  .setEndpoint(ENDPOINT)
  .setProject(PROJECT_ID)
  .setKey(API_KEY);

const databases = new Databases(client);
const functions = new Functions(client);
const storage = new Storage(client);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createDatabase() {
  console.log('📦 Creating database...');
  try {
    await databases.create(DATABASE_ID, 'MultiLLM');
    console.log('✅ Database created');
    await sleep(1000);
  } catch (e) {
    if (e.code === 409) {
      console.log('ℹ️ Database already exists');
    } else {
      throw e;
    }
  }
}

async function createCollections() {
  console.log('📂 Creating collections...');

  // Users collection (extended profile)
  try {
    await databases.createCollection(DATABASE_ID, 'users', 'Users', [
      Permission.read(Role.any()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ], false, true);
    console.log('✅ users collection created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ users collection exists');
  }

  // User attributes
  const userAttrs = [
    { type: 'string', key: 'email', required: true, size: 255 },
    { type: 'string', key: 'name', required: false, size: 100 },
    { type: 'string', key: 'plan', required: true, size: 20, default: 'free' }, // free, pro, enterprise
    { type: 'integer', key: 'credits', required: true, default: 100 },
    { type: 'datetime', key: 'planExpiresAt', required: false },
    { type: 'boolean', key: 'isActive', required: true, default: true },
  ];

  for (const attr of userAttrs) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DATABASE_ID, 'users', attr.key, attr.size, attr.required, attr.default || undefined);
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(DATABASE_ID, 'users', attr.key, attr.required, false, undefined, undefined, attr.default);
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(DATABASE_ID, 'users', attr.key, attr.required, attr.default || undefined);
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(DATABASE_ID, 'users', attr.key, attr.required, attr.default);
      }
      console.log(`  ✅ users.${attr.key}`);
      await sleep(500);
    } catch (e) {
      if (e.code !== 409) throw e;
      console.log(`  ℹ️ users.${attr.key} exists`);
    }
  }

  // API Keys collection
  try {
    await databases.createCollection(DATABASE_ID, 'api_keys', 'API Keys', [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ], false, true);
    console.log('✅ api_keys collection created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ api_keys collection exists');
  }

  const apiKeyAttrs = [
    { type: 'string', key: 'userId', required: true, size: 36 },
    { type: 'string', key: 'provider', required: true, size: 50 }, // openai, gemini, mistral, openrouter
    { type: 'string', key: 'name', required: true, size: 100 },
    { type: 'string', key: 'encryptedKey', required: true, size: 2000 },
    { type: 'boolean', key: 'isActive', required: true, default: true },
    { type: 'integer', key: 'usageCount', required: true, default: 0 },
    { type: 'datetime', key: 'lastUsedAt', required: false },
  ];

  for (const attr of apiKeyAttrs) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DATABASE_ID, 'api_keys', attr.key, attr.size, attr.required, attr.default || undefined);
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(DATABASE_ID, 'api_keys', attr.key, attr.required, false, undefined, undefined, attr.default);
      } else if (attr.type === 'boolean') {
        await databases.createBooleanAttribute(DATABASE_ID, 'api_keys', attr.key, attr.required, attr.default);
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(DATABASE_ID, 'api_keys', attr.key, attr.required, attr.default || undefined);
      }
      console.log(`  ✅ api_keys.${attr.key}`);
      await sleep(500);
    } catch (e) {
      if (e.code !== 409) throw e;
      console.log(`  ℹ️ api_keys.${attr.key} exists`);
    }
  }

  // Query History collection
  try {
    await databases.createCollection(DATABASE_ID, 'queries', 'Query History', [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.delete(Role.users()),
    ], false, true);
    console.log('✅ queries collection created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ queries collection exists');
  }

  const queryAttrs = [
    { type: 'string', key: 'userId', required: true, size: 36 },
    { type: 'string', key: 'prompt', required: true, size: 5000 },
    { type: 'string', key: 'answer', required: true, size: 10000 },
    { type: 'string', key: 'topProvider', required: true, size: 100 },
    { type: 'string', key: 'topModel', required: true, size: 100 },
    { type: 'double', key: 'confidenceScore', required: true },
    { type: 'double', key: 'latencyMs', required: true },
    { type: 'double', key: 'carbonSaved', required: true },
    { type: 'double', key: 'emissions', required: true },
    { type: 'string', key: 'candidates', required: false, size: 10000 }, // JSON
    { type: 'string', key: 'sources', required: false, size: 5000 }, // JSON
    { type: 'datetime', key: 'createdAt', required: true },
  ];

  for (const attr of queryAttrs) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DATABASE_ID, 'queries', attr.key, attr.size, attr.required, attr.default || undefined);
      } else if (attr.type === 'double') {
        await databases.createFloatAttribute(DATABASE_ID, 'queries', attr.key, attr.required, undefined, undefined, attr.default);
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(DATABASE_ID, 'queries', attr.key, attr.required, attr.default || undefined);
      }
      console.log(`  ✅ queries.${attr.key}`);
      await sleep(500);
    } catch (e) {
      if (e.code !== 409) throw e;
      console.log(`  ℹ️ queries.${attr.key} exists`);
    }
  }

  // Training Jobs collection
  try {
    await databases.createCollection(DATABASE_ID, 'training_jobs', 'Training Jobs', [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
    ], false, true);
    console.log('✅ training_jobs collection created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ training_jobs collection exists');
  }

  const trainingAttrs = [
    { type: 'string', key: 'userId', required: true, size: 36 },
    { type: 'string', key: 'status', required: true, size: 20 }, // pending, running, completed, failed
    { type: 'string', key: 'kind', required: true, size: 20 }, // generator, scorer, both
    { type: 'integer', key: 'epochs', required: true, default: 20 },
    { type: 'integer', key: 'batchSize', required: true, default: 16 },
    { type: 'integer', key: 'nLayer', required: false, default: 6 },
    { type: 'integer', key: 'nHead', required: false, default: 4 },
    { type: 'integer', key: 'nEmbd', required: false, default: 128 },
    { type: 'string', key: 'logs', required: false, size: 10000 },
    { type: 'string', key: 'modelPath', required: false, size: 500 },
    { type: 'double', key: 'finalLoss', required: false },
    { type: 'datetime', key: 'startedAt', required: false },
    { type: 'datetime', key: 'completedAt', required: false },
    { type: 'datetime', key: 'createdAt', required: true },
  ];

  for (const attr of trainingAttrs) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DATABASE_ID, 'training_jobs', attr.key, attr.size, attr.required, attr.default || undefined);
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(DATABASE_ID, 'training_jobs', attr.key, attr.required, false, undefined, undefined, attr.default);
      } else if (attr.type === 'double') {
        await databases.createFloatAttribute(DATABASE_ID, 'training_jobs', attr.key, attr.required, undefined, undefined, attr.default);
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(DATABASE_ID, 'training_jobs', attr.key, attr.required, attr.default || undefined);
      }
      console.log(`  ✅ training_jobs.${attr.key}`);
      await sleep(500);
    } catch (e) {
      if (e.code !== 409) throw e;
      console.log(`  ℹ️ training_jobs.${attr.key} exists`);
    }
  }

  // Subscriptions/Billing collection
  try {
    await databases.createCollection(DATABASE_ID, 'subscriptions', 'Subscriptions', [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
    ], false, true);
    console.log('✅ subscriptions collection created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ subscriptions collection exists');
  }

  const subAttrs = [
    { type: 'string', key: 'userId', required: true, size: 36 },
    { type: 'string', key: 'stripeCustomerId', required: true, size: 100 },
    { type: 'string', key: 'stripeSubscriptionId', required: false, size: 100 },
    { type: 'string', key: 'plan', required: true, size: 20 }, // free, pro, enterprise
    { type: 'string', key: 'status', required: true, size: 20 }, // active, canceled, past_due, trialing
    { type: 'datetime', key: 'currentPeriodEnd', required: false },
    { type: 'integer', key: 'creditsIncluded', required: true, default: 100 },
    { type: 'datetime', key: 'createdAt', required: true },
  ];

  for (const attr of subAttrs) {
    try {
      if (attr.type === 'string') {
        await databases.createStringAttribute(DATABASE_ID, 'subscriptions', attr.key, attr.size, attr.required, attr.default || undefined);
      } else if (attr.type === 'integer') {
        await databases.createIntegerAttribute(DATABASE_ID, 'subscriptions', attr.key, attr.required, false, undefined, undefined, attr.default);
      } else if (attr.type === 'datetime') {
        await databases.createDatetimeAttribute(DATABASE_ID, 'subscriptions', attr.key, attr.required, attr.default || undefined);
      }
      console.log(`  ✅ subscriptions.${attr.key}`);
      await sleep(500);
    } catch (e) {
      if (e.code !== 409) throw e;
      console.log(`  ℹ️ subscriptions.${attr.key} exists`);
    }
  }

  // Create indexes
  console.log('🔍 Creating indexes...');
  const indexes = [
    { collection: 'users', key: 'email_idx', attributes: ['email'], type: 'unique' },
    { collection: 'api_keys', key: 'user_provider_idx', attributes: ['userId', 'provider'], type: 'key' },
    { collection: 'queries', key: 'user_created_idx', attributes: ['userId', 'createdAt'], type: 'key' },
    { collection: 'training_jobs', key: 'user_status_idx', attributes: ['userId', 'status'], type: 'key' },
    { collection: 'subscriptions', key: 'user_idx', attributes: ['userId'], type: 'unique' },
    { collection: 'subscriptions', key: 'stripe_customer_idx', attributes: ['stripeCustomerId'], type: 'unique' },
  ];

  for (const idx of indexes) {
    try {
      await databases.createIndex(DATABASE_ID, idx.collection, idx.key, idx.type, idx.attributes);
      console.log(`  ✅ ${idx.collection}.${idx.key}`);
      await sleep(500);
    } catch (e) {
      if (e.code !== 409) throw e;
      console.log(`  ℹ️ ${idx.collection}.${idx.key} exists`);
    }
  }
}

async function createStorage() {
  console.log('💾 Creating storage buckets...');
  try {
    await storage.createBucket('model-artifacts', 'Model Artifacts', [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.delete(Role.users()),
    ], false, 100 * 1024 * 1024, ['application/octet-stream', 'application/json']); // 100MB
    console.log('✅ model-artifacts bucket created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ model-artifacts bucket exists');
  }

  try {
    await storage.createBucket('knowledge-sources', 'Knowledge Sources', [
      Permission.read(Role.users()),
      Permission.create(Role.users()),
      Permission.delete(Role.users()),
    ], false, 50 * 1024 * 1024, ['text/plain', 'text/markdown', 'application/json', 'text/csv']);
    console.log('✅ knowledge-sources bucket created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ knowledge-sources bucket exists');
  }
}

async function createFunctions() {
  console.log('⚡ Creating Appwrite Functions...');
  
  // Query Ensemble Function
  try {
    await functions.create(
      'query-ensemble',
      'Query Ensemble',
      'python:3.11',
      [
        Permission.execute(Role.users()),
      ],
      '', // code - will be deployed separately
      '', // entrypoint
      [], // commands
      [], // install commands
      300, // timeout
      false, // enabled
      'multi-llm-ensemble', // path
    );
    console.log('✅ query-ensemble function created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ query-ensemble function exists');
  }

  // Training Job Function
  try {
    await functions.create(
      'training-job',
      'Training Job',
      'python:3.11',
      [
        Permission.execute(Role.users()),
      ],
      '', '', [], [], 3600, false, 'train-model',
    );
    console.log('✅ training-job function created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ training-job function exists');
  }

  // Stripe Webhook Function
  try {
    await functions.create(
      'stripe-webhook',
      'Stripe Webhook',
      'node:20',
      [
        Permission.execute(Role.any()), // Called by Stripe
      ],
      '', '', [], [], 60, false, 'stripe-webhook',
    );
    console.log('✅ stripe-webhook function created');
  } catch (e) {
    if (e.code !== 409) throw e;
    console.log('ℹ️ stripe-webhook function exists');
  }
}

async function main() {
  console.log('🚀 Provisioning Appwrite for MultiLLM...\n');
  console.log(`   Endpoint: ${ENDPOINT}`);
  console.log(`   Project: ${PROJECT_ID}\n`);

  try {
    await createDatabase();
    await createCollections();
    await createStorage();
    await createFunctions();
    
    console.log('\n✅ Appwrite provisioning complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Deploy function code: appwrite deploy function --all');
    console.log('   2. Set function environment variables in Appwrite Console');
    console.log('   3. Configure Stripe webhook URL: https://<endpoint>/functions/stripe-webhook/executions');
    console.log('   4. Add environment variables to Vercel:');
    console.log('      - NEXT_PUBLIC_APPWRITE_ENDPOINT');
    console.log('      - NEXT_PUBLIC_APPWRITE_PROJECT_ID');
    console.log('      - APPWRITE_API_KEY (server-side only)');
    console.log('      - STRIPE_SECRET_KEY');
    console.log('      - STRIPE_WEBHOOK_SECRET');
    console.log('      - ENCRYPTION_KEY (for API key encryption)');
  } catch (error) {
    console.error('\n❌ Provisioning failed:', error.message);
    process.exit(1);
  }
}

main();