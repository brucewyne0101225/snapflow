import type Stripe from "stripe";
import type { RequestHandler } from "express";
import { prisma } from "../lib/prisma.js";
import { constructStripeEvent } from "../payments/stripe.js";

async function markPurchasePaid(session: Stripe.Checkout.Session) {
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : null;
  const buyerEmail = session.customer_details?.email?.toLowerCase() ?? session.customer_email?.toLowerCase();

  await prisma.purchase.updateMany({
    where: {
      stripeSessionId: session.id
    },
    data: {
      status: "PAID",
      stripePaymentId: paymentIntentId,
      ...(buyerEmail ? { buyerEmail } : {})
    }
  });
}

async function markPurchaseFailed(session: Stripe.Checkout.Session) {
  await prisma.purchase.updateMany({
    where: {
      stripeSessionId: session.id,
      status: "PENDING"
    },
    data: {
      status: "FAILED"
    }
  });
}

export const stripeWebhookHandler: RequestHandler = async (req, res) => {
  const signature = req.header("stripe-signature");

  if (!signature) {
    res.status(400).json({ error: "Missing Stripe signature header." });
    return;
  }

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Invalid webhook payload." });
    return;
  }

  let event: Stripe.Event;

  try {
    event = constructStripeEvent(req.body, signature);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid Stripe signature."
    });
    return;
  }

  const session = event.data.object as Stripe.Checkout.Session;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await markPurchasePaid(session);
      break;
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      await markPurchaseFailed(session);
      break;
    default:
      break;
  }

  res.json({ received: true });
};
