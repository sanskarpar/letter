// app/api/webhook/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, getDoc, updateDoc, increment, Timestamp, collection, getDocs, query, where } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  console.log("Webhook received");
  
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature || !webhookSecret) {
      console.error("Missing signature or webhook secret");
      return NextResponse.json(
        { error: "Webhook configuration error" },
        { status: 400 }
      );
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      console.log(`Processing event: ${event.type}`);
    } catch (err: any) {
      console.error("Webhook verification failed:", err.message);
      return NextResponse.json(
        { error: `Webhook verification failed: ${err.message}` },
        { status: 400 }
      );
    }

    // Enhanced event handling
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        
        case "customer.subscription.created":
          await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
          break;
        
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        
        case "invoice.payment_succeeded":
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error: any) {
      console.error(`Error handling ${event.type}:`, error.message);
      console.error(error.stack);
      // Don't return error response here to prevent Stripe retries for our bugs
    }

    return NextResponse.json({ received: true });
    
  } catch (error: any) {
    console.error("Webhook handler error:", error.message);
    console.error(error.stack);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  console.log("Handling checkout completed:", session.id);
  
  // Validate required data
  if (!session.customer || typeof session.customer !== 'string') {
    console.error("Invalid customer data in session");
    return;
  }

  const userId = session.metadata?.userId;
  const customerId = session.customer;

  try {
    // Ensure user has stripeCustomerId in Firestore
    if (userId) {
      await updateDoc(doc(db, "users", userId), {
        stripeCustomerId: customerId
      });
    }

    if (session.metadata?.type === "credits") {
      const credits = parseInt(session.metadata.credits || "0");
      if (credits > 0) {
        await updateDoc(doc(db, "users", userId || customerId), {
          credits: increment(credits),
        });
      }
    }
  } catch (error) {
    console.error("Error in checkout completed handler:", error);
  }
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log("Handling subscription created:", subscription.id);

  // Get userId from multiple possible sources
  let userId = subscription.metadata?.userId;
  if (!userId) {
    const fetchedUserId = await getUserIdFromCustomerId(subscription.customer as string);
    if (!fetchedUserId) {
      console.error("No userId found for subscription:", subscription.id);
      return;
    }
    userId = fetchedUserId;
  }

  if (!userId) {
    console.error("No userId found for subscription:", subscription.id);
    return;
  }

  try {
    const priceId = subscription.items.data[0]?.price.id;
    if (!priceId) {
      console.error("No price ID found in subscription");
      return;
    }

    const planType = getPlanTypeFromPriceId(priceId);
    const currentPeriodEnd = (subscription as any).current_period_end;

    if (!currentPeriodEnd) {
      console.error("No current_period_end in subscription");
      return;
    }

    const subscriptionEndDate = Timestamp.fromMillis(currentPeriodEnd * 1000);
    const updateData: any = {
      planType,
      subscriptionEndDate,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      status: subscription.status,
      // Only give signup bonus if this is a new subscription (not an update)
      ...(subscription.status === "active" && { credits: increment(25) })
    };

    // Add trial end date if this is a trial
    if (subscription.status === 'trialing' && subscription.trial_end) {
      updateData.trialEndDate = Timestamp.fromMillis(subscription.trial_end * 1000);
    }

    await updateDoc(doc(db, "users", userId), updateData, { merge: true });

    console.log(`Successfully updated user ${userId} with new subscription`, updateData);
  } catch (error) {
    console.error("Error in subscription created handler:", error);
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log("Handling subscription updated:", subscription.id);

  let userId = subscription.metadata?.userId;
  if (!userId) {
    const fetchedUserId = await getUserIdFromCustomerId(subscription.customer as string);
    if (!fetchedUserId) {
      console.error("No userId found for subscription:", subscription.id);
      return;
    }
    userId = fetchedUserId;
  }

  if (!userId) {
    console.error("No userId found for subscription:", subscription.id);
    return;
  }

  try {
    const priceId = subscription.items.data[0]?.price.id;
    if (!priceId) {
      console.error("No price ID found in subscription");
      return;
    }

    const planType = getPlanTypeFromPriceId(priceId);
    const currentPeriodEnd = (subscription as any).current_period_end;

    if (!currentPeriodEnd) {
      console.error("No current_period_end in subscription");
      return;
    }

    const updateData: any = {
      planType,
      subscriptionEndDate: Timestamp.fromMillis(currentPeriodEnd * 1000),
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      status: subscription.status
    };

    // Handle cancellation
    if (subscription.cancel_at_period_end) {
      updateData.subscriptionStatus = 'canceling';
    }

    await updateDoc(doc(db, "users", userId), updateData, { merge: true });

    console.log(`Successfully updated user ${userId} subscription data`, updateData);
  } catch (error) {
    console.error("Error in subscription updated handler:", error);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log("Handling subscription deleted:", subscription.id);
  
  const userId = await getUserIdFromCustomerId(subscription.customer as string);
  if (!userId) {
    console.error("No userId found for subscription:", subscription.id);
    return;
  }

  try {
    await updateDoc(
      doc(db, "users", userId),
      {
        planType: "free",
        subscriptionEndDate: null,
        stripeSubscriptionId: null,
        status: "canceled"
      }
    );

    console.log(`Successfully canceled subscription for user ${userId}`);
  } catch (error) {
    console.error("Error in subscription deleted handler:", error);
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log("Handling payment succeeded:", invoice.id);
  
  if (!invoice.customer || typeof invoice.customer !== 'string') {
    console.error("Invalid customer data in invoice");
    return;
  }

  const userId = await getUserIdFromCustomerId(invoice.customer);
  if (!userId) {
    console.error("No userId found for invoice:", invoice.id);
    return;
  }

  try {
    // Add monthly credits for subscription renewals
    if (invoice.billing_reason === "subscription_cycle") {
      await updateDoc(
        doc(db, "users", userId),
        {
          credits: increment(25),
          lastPaymentDate: Timestamp.now()
        }
      );
      console.log(`Added monthly credits to user ${userId}`);
    }
  } catch (error) {
    console.error("Error in payment succeeded handler:", error);
  }
}

async function getUserIdFromCustomerId(stripeCustomerId: string): Promise<string | null> {
  try {
    // First try to find a user document with this stripeCustomerId
    const usersRef = collection(db, "users");
    const querySnapshot = await getDocs(query(usersRef, where("stripeCustomerId", "==", stripeCustomerId)));
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id;
    }

    // Fallback to Stripe metadata if not found in Firestore
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if (customer.deleted) return null;
    
    return (customer as Stripe.Customer).metadata?.firebaseUserId || null;
  } catch (error) {
    console.error("Error getting user ID from customer ID:", error);
    return null;
  }
}

function getPlanTypeFromPriceId(priceId: string): string {
  const priceMap: Record<string, string> = {
    [process.env.STRIPE_MONTHLY_PRICE_ID!]: "monthly",
    [process.env.STRIPE_SEMIANNUAL_PRICE_ID!]: "semi-annual",
    [process.env.STRIPE_ANNUAL_PRICE_ID!]: "annual"
  };
  return priceMap[priceId] || "paid";
}