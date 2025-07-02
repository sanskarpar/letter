// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, updateDoc, getDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);

// Plan configurations
const PLAN_CONFIGS = {
  [process.env.STRIPE_MONTHLY_PRICE_ID!]: {
    planType: "premium",
    credits: 100,
    durationMonths: 1,
  },
  [process.env.STRIPE_SEMIANNUAL_PRICE_ID!]: {
    planType: "premium",
    credits: 600,
    durationMonths: 6,
  },
  [process.env.STRIPE_ANNUAL_PRICE_ID!]: {
    planType: "premium",
    credits: 1200,
    durationMonths: 12,
  },
};

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("No Stripe signature found");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  console.log(`Received webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log("Processing checkout.session.completed:", {
          sessionId: session.id,
          customerId: session.customer,
          metadata: session.metadata,
          mode: session.mode,
          subscriptionId: session.subscription,
        });

        const userId = session.metadata?.userId;
        
        if (!userId) {
          console.error("No userId found in session metadata");
          return NextResponse.json({ error: "No userId in metadata" }, { status: 400 });
        }

        // Handle subscription purchase
        if (session.mode === "subscription" && session.subscription) {
          console.log("Handling subscription purchase for session:", session.id);
          await handleSubscriptionPurchase(session, userId);
        } else if (session.mode === "payment") {
          // Handle one-time credit purchase
          await handleCreditsPurchase(session, userId);
        }
        
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        
        console.log("Processing invoice.payment_succeeded:", {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: (invoice as any).subscription,
        });

        // Handle recurring subscription payments
        const subscriptionId = (invoice as any).subscription as string | undefined;
        if (subscriptionId) {
          await handleSubscriptionRenewal(invoice);
        }
        
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        
        console.log(`Processing ${event.type}:`, {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
        });

        await handleSubscriptionChange(subscription);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleSubscriptionPurchase(session: Stripe.Checkout.Session, userId: string) {
  try {
    console.log(`Starting handleSubscriptionPurchase for user: ${userId}`);

    // Get the subscription details
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) {
      console.error("No subscription ID found in session");
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    console.log("Retrieved subscription:", {
      id: subscription.id,
      status: subscription.status,
      items: subscription.items.data.length,
      metadata: subscription.metadata,
    });

    const lineItem = subscription.items.data[0];
    const priceId = lineItem.price.id;
    
    console.log("Price ID from subscription:", priceId);
    console.log("Available plan configs:", Object.keys(PLAN_CONFIGS));
    
    const planConfig = PLAN_CONFIGS[priceId];
    if (!planConfig) {
      console.error("Unknown price ID:", priceId);
      console.error("Available price IDs:", Object.keys(PLAN_CONFIGS));
      
      // Try to get plan info from subscription metadata as fallback
      const planId = subscription.metadata?.planId || session.metadata?.planId;
      if (planId) {
        console.log("Trying to use planId from metadata:", planId);
        const fallbackPriceId = process.env[`STRIPE_${planId.toUpperCase().replace('-', '')}_PRICE_ID`];
        if (fallbackPriceId && PLAN_CONFIGS[fallbackPriceId]) {
          console.log("Using fallback plan config");
        } else {
          console.error("No fallback plan config found");
          return;
        }
      } else {
        return;
      }
    }

    console.log("Plan config found:", planConfig);

    // Calculate subscription end date
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    // Get current user data
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("User document not found:", userId);
      return;
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    console.log("Current user data:", {
      currentCredits,
      currentPlanType: currentUserData?.planType,
    });

    // Update user document
    const updateData = {
      planType: planConfig.planType,
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate,
      stripeSubscriptionId: subscription.id,
      updatedAt: new Date(),
    };

    console.log("Updating user with data:", updateData);

    await updateDoc(userRef, updateData);

    console.log(`Successfully updated user ${userId} with subscription:`, {
      planType: planConfig.planType,
      creditsAdded: planConfig.credits,
      totalCredits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate.toISOString(),
      subscriptionId: subscription.id,
    });

  } catch (error) {
    console.error("Error handling subscription purchase:", error);
    throw error;
  }
}

async function handleCreditsPurchase(session: Stripe.Checkout.Session, userId: string) {
  try {
    console.log(`Starting handleCreditsPurchase for user: ${userId}`);
    
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("User document not found:", userId);
      return;
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;
    
    // You'll need to determine credits based on the amount paid
    // This is a simple example - adjust based on your pricing
    const amountPaid = session.amount_total || 0;
    const creditsToAdd = Math.floor(amountPaid / 100); // Example: $1 = 1 credit
    
    await updateDoc(userRef, {
      credits: currentCredits + creditsToAdd,
      updatedAt: new Date(),
    });

    console.log(`Added ${creditsToAdd} credits to user ${userId}`);

  } catch (error) {
    console.error("Error handling credits purchase:", error);
    throw error;
  }
}

async function handleSubscriptionRenewal(invoice: Stripe.Invoice) {
  try {
    console.log("Starting handleSubscriptionRenewal");

    // Get the customer's Firebase user ID
    const customer = await stripe.customers.retrieve(invoice.customer as string);
    const userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      console.error("No Firebase user ID found for customer:", invoice.customer);
      return;
    }

    console.log("Found user ID for renewal:", userId);

    // Get subscription details
    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) {
      console.error("No subscription ID found on invoice:", invoice.id);
      return;
    }
    
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const lineItem = subscription.items.data[0];
    const priceId = lineItem.price.id;
    
    const planConfig = PLAN_CONFIGS[priceId];
    if (!planConfig) {
      console.error("Unknown price ID for renewal:", priceId);
      return;
    }

    // Extend subscription and add credits
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("User document not found for renewal:", userId);
      return;
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    await updateDoc(userRef, {
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate,
      updatedAt: new Date(),
    });

    console.log(`Renewed subscription for user ${userId}`);

  } catch (error) {
    console.error("Error handling subscription renewal:", error);
    throw error;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  try {
    console.log("Starting handleSubscriptionChange");

    // Get the customer's Firebase user ID
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    const userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      console.error("No Firebase user ID found for customer:", subscription.customer);
      return;
    }

    console.log("Found user ID for subscription change:", userId);

    const userRef = doc(db, "users", userId);
    
    if (subscription.status === "canceled" || subscription.status === "unpaid") {
      // Downgrade to free plan
      await updateDoc(userRef, {
        planType: "free",
        stripeSubscriptionId: null,
        subscriptionEndDate: new Date("2100-01-01"), // Far future date for free plan
        updatedAt: new Date(),
      });
      
      console.log(`Downgraded user ${userId} to free plan`);
    }

  } catch (error) {
    console.error("Error handling subscription change:", error);
    throw error;
  }
}