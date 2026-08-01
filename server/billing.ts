import Stripe from "stripe";
import { ENV } from "./_core/env";
import { getSubscription, getSubscriptionByCustomer, upsertSubscription } from "./db";
import { TRPCError } from "@trpc/server";

const PLAN_TO_PRICE: Record<string, { priceId: string; label: string }> = {
  pro: { priceId: ENV.stripePricePro, label: "Pro" },
  enterprise: { priceId: ENV.stripePriceEnterprise, label: "Enterprise" },
};

function getClient(): Stripe | null {
  if (!ENV.stripeSecretKey) return null;
  return new Stripe(ENV.stripeSecretKey);
}

export function stripeConfigured(): boolean {
  return Boolean(ENV.stripeSecretKey);
}

export function planFromPriceId(priceId: string): string {
  if (priceId && priceId === ENV.stripePriceEnterprise) return "enterprise";
  return "pro";
}

export async function createCheckoutSession(userId: number, email: string, plan: string) {
  const stripe = getClient();
  if (!stripe) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured. Add STRIPE_SECRET_KEY to your server environment." });
  }
  const planConfig = PLAN_TO_PRICE[plan];
  if (!planConfig) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown plan: ${plan}` });
  }
  if (!planConfig.priceId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Stripe price ID missing for ${planConfig.label}. Set STRIPE_PRICE_${plan.toUpperCase()} in your environment.` });
  }

  let subscription = await getSubscription(userId);

  // If this user already has a Stripe customer, reuse it so billing history stays unified.
  let customerId: string | undefined = subscription?.stripeCustomerId || undefined;
  if (!customerId) {
    try {
      const customers = await stripe.customers.list({ email, limit: 1 });
      customerId = customers.data[0]?.id;
    } catch {
      customerId = undefined;
    }
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    customer_email: customerId ? undefined : email,
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    allow_promotion_codes: true,
    client_reference_id: String(userId),
    metadata: { userId: String(userId), plan },
    subscription_data: { metadata: { userId: String(userId), plan } },
    success_url: `${ENV.appUrl}/subscription?checkout=success`,
    cancel_url: `${ENV.appUrl}/subscription?checkout=cancelled`,
  });

  // Persist the customer + plan intent immediately so a successful webhook
  // only needs to flip status.
  await upsertSubscription(userId, {
    plan,
    stripeCustomerId: customerId || (typeof session.customer === "string" ? session.customer : ""),
    status: "incomplete",
  });

  return { url: session.url };
}

export async function createBillingPortalSession(userId: number) {
  const stripe = getClient();
  if (!stripe) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured. Add STRIPE_SECRET_KEY to your server environment." });
  }
  const subscription = await getSubscription(userId);
  if (!subscription?.stripeCustomerId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No Stripe customer yet. Start a checkout first." });
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${ENV.appUrl}/subscription`,
  });
  return { url: session.url };
}

export async function getCurrentPlan(userId: number) {
  const subscription = await getSubscription(userId);
  if (!subscription || !subscription.stripeSubscriptionId) {
    return { plan: "starter", status: "active", stripeConfigured: stripeConfigured() };
  }
  return {
    plan: subscription.plan,
    status: subscription.status,
    currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    stripeConfigured: stripeConfigured(),
  };
}

export async function handleStripeWebhook(payload: Buffer | string, signature: string): Promise<{ received: boolean }> {
  const stripe = getClient();
  if (!stripe) return { received: true };

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, ENV.stripeWebhookSecret);
  } catch (e: any) {
    throw new Error(`Webhook signature verification failed: ${e?.message || e}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = Number(session.metadata?.userId || session.client_reference_id);
      const plan = session.metadata?.plan || "pro";
      if (userId) {
        await upsertSubscription(userId, {
          plan,
          status: "active",
          stripeCustomerId: typeof session.customer === "string" ? session.customer : "",
          stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : "",
        });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : "";
      const existing = await getSubscriptionByCustomer(customerId);
      if (existing) {
        const plan = planFromPriceId(sub.items.data[0]?.price?.id || "");
        const periodEnd = sub.items.data[0]?.current_period_end;
        await upsertSubscription(existing.userId, {
          plan,
          status: sub.status,
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          priceId: sub.items.data[0]?.price?.id || "",
          currentPeriodEnd: typeof periodEnd === "number" ? periodEnd : null,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : "";
      const existing = await getSubscriptionByCustomer(customerId);
      if (existing) {
        const periodEnd = sub.items.data[0]?.current_period_end;
        await upsertSubscription(existing.userId, {
          plan: "starter",
          status: "canceled",
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          currentPeriodEnd: typeof periodEnd === "number" ? periodEnd : null,
        });
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : "";
      const existing = await getSubscriptionByCustomer(customerId);
      if (existing) {
        await upsertSubscription(existing.userId, { plan: existing.plan, status: "past_due" });
      }
      break;
    }
    default:
      break;
  }

  return { received: true };
}
