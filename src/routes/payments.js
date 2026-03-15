// routes/payments.js
import { Router } from "express";
import Stripe from "stripe";
import { pool } from "../connect.js";
import { authenticateToken } from "../middleware.js";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLANS = {
  subscription: process.env.STRIPE_PRICE_SUBSCRIPTION, // recurring monthly/annual price ID
  one_time: process.env.STRIPE_PRICE_ONE_TIME,          // one-time lifetime price ID
};

const CLIENT_URL = process.env.CLIENT_URL || "https://vedioz.netlify.app";

// ---------------------------------------------------------------------------
// GET /api/payments/status
// Returns the current user's creator_tier and tier_type
// ---------------------------------------------------------------------------
router.get("/status", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT creator_tier, tier_type FROM users WHERE user_id = $1",
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: "User not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching payment status:", err.message);
    res.status(500).json({ message: "Failed to fetch payment status." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/checkout
// Creates a Stripe Checkout session and returns { url }
// Body: { planType: 'subscription' | 'one_time' }
// ---------------------------------------------------------------------------
router.post("/checkout", authenticateToken, async (req, res) => {
  const { planType } = req.body;
  if (!["subscription", "one_time"].includes(planType)) {
    return res.status(400).json({ message: "Invalid plan type." });
  }

  const priceId = PLANS[planType];
  if (!priceId) {
    return res.status(500).json({ message: `Stripe price ID for '${planType}' is not configured.` });
  }

  try {
    // Retrieve or create Stripe customer
    const userResult = await pool.query(
      "SELECT stripe_customer_id, email, username FROM users WHERE user_id = $1",
      [req.user.id]
    );
    const user = userResult.rows[0];
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.username,
        metadata: { user_id: String(req.user.id) },
      });
      customerId = customer.id;
      await pool.query(
        "UPDATE users SET stripe_customer_id = $1 WHERE user_id = $2",
        [customerId, req.user.id]
      );
    }

    const sessionParams = {
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: planType === "subscription" ? "subscription" : "payment",
      success_url: `${CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/payment/cancel`,
      metadata: { user_id: String(req.user.id), plan_type: planType },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    res.status(500).json({ message: "Failed to create checkout session." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/payments/webhook
// Stripe sends events here — must be raw body (no JSON parsing)
// ---------------------------------------------------------------------------
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // One-time payment completed OR first subscription payment
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.user_id;
        const planType = session.metadata?.plan_type;
        if (!userId) break;

        const updates = {
          creator_tier: "creator",
          tier_type: planType,
          stripe_subscription_id: session.subscription ?? null,
        };
        await pool.query(
          `UPDATE users SET creator_tier = $1, tier_type = $2, stripe_subscription_id = $3 WHERE user_id = $4`,
          [updates.creator_tier, updates.tier_type, updates.stripe_subscription_id, userId]
        );
        console.log(`User ${userId} upgraded to creator (${planType})`);
        break;
      }

      // Subscription cancelled or payment failed → downgrade
      case "customer.subscription.deleted":
      case "invoice.payment_failed": {
        const obj = event.data.object;
        const customerId = obj.customer;
        await pool.query(
          `UPDATE users SET creator_tier = 'free', tier_type = NULL, stripe_subscription_id = NULL
           WHERE stripe_customer_id = $1`,
          [customerId]
        );
        console.log(`Customer ${customerId} downgraded to free`);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err.message);
    return res.status(500).json({ message: "Webhook handler failed." });
  }

  res.json({ received: true });
});

export default router;
