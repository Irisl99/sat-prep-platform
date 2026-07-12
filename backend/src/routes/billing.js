import { Router } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ── POST /api/billing/checkout ────────────────────────────────
// Creates a Stripe Checkout session → returns URL
router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    const { plan } = req.body; // 'monthly' | 'yearly'
    const priceId = plan === 'yearly'
      ? process.env.STRIPE_YEARLY_PRICE_ID
      : process.env.STRIPE_PREMIUM_PRICE_ID;

    // Create or retrieve Stripe customer
    let customerId = req.user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name:  req.user.name,
        metadata: { userId: String(req.user._id) },
      });
      customerId = customer.id;
      req.user.stripeCustomerId = customerId;
      await req.user.save();
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=success`,
      cancel_url:  `${process.env.FRONTEND_URL}/pricing?upgrade=cancelled`,
      allow_promotion_codes: true,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/billing/portal ──────────────────────────────────
// Opens Stripe customer portal (manage/cancel subscription)
router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing account found' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer:   req.user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard`,
    });
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/billing/webhook ─────────────────────────────────
// Stripe sends events here — MUST use raw body (mounted before express.json())
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).send('Webhook signature verification failed');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await activatePremium(session.customer, session.subscription);
      break;
    }
    case 'invoice.paid': {
      const invoice = event.data.object;
      await activatePremium(invoice.customer, invoice.subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await deactivatePremium(sub.customer);
      break;
    }
  }

  res.json({ received: true });
});

async function activatePremium(stripeCustomerId, subscriptionId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const expiresAt = new Date(sub.current_period_end * 1000);
  await User.findOneAndUpdate(
    { stripeCustomerId },
    { plan: 'premium', planExpiresAt: expiresAt, stripeSubscriptionId: subscriptionId }
  );
}

async function deactivatePremium(stripeCustomerId) {
  await User.findOneAndUpdate(
    { stripeCustomerId },
    { plan: 'free', planExpiresAt: null, stripeSubscriptionId: null }
  );
}

export default router;
