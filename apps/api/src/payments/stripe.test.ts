import { beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { constructStripeEvent } from "./stripe.js";

describe("stripe webhook signature verification", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  });

  it("accepts valid webhook signatures", () => {
    const payload = JSON.stringify({
      id: "evt_test_1",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          object: "checkout.session"
        }
      }
    });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_WEBHOOK_SECRET as string
    });

    const event = constructStripeEvent(Buffer.from(payload), signature);
    expect(event.type).toBe("checkout.session.completed");
  });

  it("rejects invalid webhook signatures", () => {
    const payload = JSON.stringify({
      id: "evt_test_2",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_2",
          object: "checkout.session"
        }
      }
    });

    expect(() => constructStripeEvent(Buffer.from(payload), "invalid-signature")).toThrow();
  });
});
