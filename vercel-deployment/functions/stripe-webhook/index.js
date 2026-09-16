"""Vercel Node.js Function: Stripe Webhook Handler"""
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Client, Databases, Query } = require('node-appwrite');

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const DATABASE_ID = 'multi-llm';

const PLAN_CREDITS = {
  free: 100,
  pro: 10000,
  enterprise: 100000,
};

async function handleSubscriptionCreated(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const priceId = subscription.items.data[0]?.price?.id;
  
  // Find user by Stripe customer ID
  const users = await databases.listDocuments(DATABASE_ID, 'subscriptions', [
    Query.equal('stripeCustomerId', customerId),
  ]);
  
  if (users.total === 0) {
    console.log(`No user found for customer ${customerId}`);
    return;
  }
  
  const userSub = users.documents[0];
  const plan = getPlanFromPriceId(priceId);
  const credits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;
  
  await databases.updateDocument(DATABASE_ID, 'subscriptions', userSub.$id, {
    stripeSubscriptionId: subscriptionId,
    plan,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    creditsIncluded: credits,
  });
  
  // Update user credits
  await databases.updateDocument(DATABASE_ID, 'users', userSub.userId, {
    plan,
    credits: credits,
  });
  
  console.log(`Updated subscription for user ${userSub.userId} to ${plan}`);
}

async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const priceId = subscription.items.data[0]?.price?.id;
  
  const users = await databases.listDocuments(DATABASE_ID, 'subscriptions', [
    Query.equal('stripeCustomerId', customerId),
  ]);
  
  if (users.total === 0) return;
  
  const userSub = users.documents[0];
  const plan = getPlanFromPriceId(priceId);
  const credits = PLAN_CREDITS[plan] || PLAN_CREDITS.free;
  
  await databases.updateDocument(DATABASE_ID, 'subscriptions', userSub.$id, {
    stripeSubscriptionId: subscriptionId,
    plan,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
    creditsIncluded: credits,
  });
  
  await databases.updateDocument(DATABASE_ID, 'users', userSub.userId, {
    plan,
    credits: credits,
  });
  
  console.log(`Updated subscription for user ${userSub.userId} to ${plan} (${subscription.status})`);
}

async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  
  const users = await databases.listDocuments(DATABASE_ID, 'subscriptions', [
    Query.equal('stripeCustomerId', customerId),
  ]);
  
  if (users.total === 0) return;
  
  const userSub = users.documents[0];
  
  await databases.updateDocument(DATABASE_ID, 'subscriptions', userSub.$id, {
    plan: 'free',
    status: 'canceled',
    creditsIncluded: PLAN_CREDITS.free,
  });
  
  await databases.updateDocument(DATABASE_ID, 'users', userSub.userId, {
    plan: 'free',
    credits: PLAN_CREDITS.free,
  });
  
  console.log(`Downgraded user ${userSub.userId} to free`);
}

async function handleInvoicePaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;
  
  if (!subscriptionId) return;
  
  const users = await databases.listDocuments(DATABASE_ID, 'subscriptions', [
    Query.equal('stripeCustomerId', customerId),
  ]);
  
  if (users.total === 0) return;
  
  const userSub = users.documents[0];
  
  // Reset credits on successful payment (monthly renewal)
  await databases.updateDocument(DATABASE_ID, 'users', userSub.userId, {
    credits: userSub.creditsIncluded,
  });
  
  console.log(`Reset credits for user ${userSub.userId} on payment success`);
}

async function handleInvoicePaymentFailed(invoice) {
  const customerId = invoice.customer;
  
  const users = await databases.listDocuments(DATABASE_ID, 'subscriptions', [
    Query.equal('stripeCustomerId', customerId),
  ]);
  
  if (users.total === 0) return;
  
  const userSub = users.documents[0];
  
  await databases.updateDocument(DATABASE_ID, 'subscriptions', userSub.$id, {
    status: 'past_due',
  });
  
  console.log(`Marked subscription past_due for user ${userSub.userId}`);
}

function getPlanFromPriceId(priceId) {
  // Map your Stripe price IDs to plans
  const priceMap = {
    'price_pro_monthly': 'pro',
    'price_pro_yearly': 'pro',
    'price_enterprise_monthly': 'enterprise',
    'price_enterprise_yearly': 'enterprise',
  };
  return priceMap[priceId] || 'free';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};