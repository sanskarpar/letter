// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, updateDoc, getDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);

// Plan configurations - using direct price IDs instead of env variables
function getPlanConfig(priceId: string) {
  // Create a mapping based on your actual Stripe price IDs
  const configs: { [key: string]: any } = {};
  
  // Monthly plan
  if (process.env.STRIPE_MONTHLY_PRICE_ID) {
    configs[process.env.STRIPE_MONTHLY_PRICE_ID] = {
      planType: "premium",
      credits: 100,
      durationMonths: 1,
      name: "Monthly Premium"
    };
  }
  
  // Semi-annual plan
  if (process.env.STRIPE_SEMIANNUAL_PRICE_ID) {
    configs[process.env.STRIPE_SEMIANNUAL_PRICE_ID] = {
      planType: "premium",
      credits: 600,
      durationMonths: 6,
      name: "Semi-Annual Premium"
    };
  }
  
  // Annual plan
  if (process.env.STRIPE_ANNUAL_PRICE_ID) {
    configs[process.env.STRIPE_ANNUAL_PRICE_ID] = {
      planType: "premium",
      credits: 1200,
      durationMonths: 12,
      name: "Annual Premium"
    };
  }
  
  return configs[priceId] || null;
}

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

  console.log(`🔔 Received webhook event: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        
        console.log("💳 Processing checkout.session.completed:", {
          sessionId: session.id,
          customerId: session.customer,
          metadata: session.metadata,
          mode: session.mode,
          subscriptionId: session.subscription,
        });

        const userId = session.metadata?.userId;
        
        if (!userId) {
          console.error("❌ No userId found in session metadata");
          return NextResponse.json({ error: "No userId in metadata" }, { status: 400 });
        }

        // Handle subscription purchase
        if (session.mode === "subscription" && session.subscription) {
          console.log("🔄 Handling subscription purchase for session:", session.id);
          await handleSubscriptionPurchase(session, userId);
        } else if (session.mode === "payment") {
          // Handle one-time credit purchase
          console.log("💰 Handling credits purchase for session:", session.id);
          await handleCreditsPurchase(session, userId);
        }
        
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        
        console.log("📄 Processing invoice.payment_succeeded:", {
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
        
        console.log(`🔄 Processing ${event.type}:`, {
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
        });

        await handleSubscriptionChange(subscription);
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("💥 Error processing webhook:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleSubscriptionPurchase(session: Stripe.Checkout.Session, userId: string) {
  try {
    console.log(`🚀 Starting handleSubscriptionPurchase for user: ${userId}`);

    // Get the subscription details
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) {
      console.error("❌ No subscription ID found in session");
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });
    
    console.log("📋 Retrieved subscription:", {
      id: subscription.id,
      status: subscription.status,
      items: subscription.items.data.length,
      metadata: subscription.metadata,
    });

    if (subscription.items.data.length === 0) {
      console.error("❌ No line items found in subscription");
      return;
    }

    const lineItem = subscription.items.data[0];
    const priceId = lineItem.price.id;
    
    console.log("💲 Price ID from subscription:", priceId);
    
    const planConfig = getPlanConfig(priceId);
    if (!planConfig) {
      console.error("❌ Unknown price ID:", priceId);
      console.error("Available price IDs:", {
        monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
        semiannual: process.env.STRIPE_SEMIANNUAL_PRICE_ID,
        annual: process.env.STRIPE_ANNUAL_PRICE_ID
      });
      return;
    }

    console.log("✅ Plan config found:", planConfig);

    // Calculate subscription end date
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    // Get current user data
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("❌ User document not found:", userId);
      return;
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    console.log("👤 Current user data:", {
      currentCredits,
      currentPlanType: currentUserData?.planType,
    });

    // Update user document
    const updateData = {
      planType: planConfig.planType,
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      updatedAt: new Date(),
    };

    console.log("📝 Updating user with data:", updateData);

    await updateDoc(userRef, updateData);

    console.log(`✅ Successfully updated user ${userId} with subscription:`, {
      planType: planConfig.planType,
      creditsAdded: planConfig.credits,
      totalCredits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate.toISOString(),
      subscriptionId: subscription.id,
    });

  } catch (error) {
    console.error("💥 Error handling subscription purchase:", error);
    throw error;
  }
}

async function handleCreditsPurchase(session: Stripe.Checkout.Session, userId: string) {
  try {
    console.log(`💰 Starting handleCreditsPurchase for user: ${userId}`);
    
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("❌ User document not found:", userId);
      return;
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;
    
    // Determine credits based on amount paid
    const amountPaid = session.amount_total || 0; // in cents
    let creditsToAdd = 0;
    
    // Based on your pricing: 5 credits = $5, 25 credits = $20
    if (amountPaid === 500) { // $5.00
      creditsToAdd = 5;
    } else if (amountPaid === 2000) { // $20.00
      creditsToAdd = 25;
    } else {
      // Fallback: $1 = 1 credit
      creditsToAdd = Math.floor(amountPaid / 100);
    }
    
    await updateDoc(userRef, {
      credits: currentCredits + creditsToAdd,
      updatedAt: new Date(),
    });

    console.log(`✅ Added ${creditsToAdd} credits to user ${userId}. Total: ${currentCredits + creditsToAdd}`);

  } catch (error) {
    console.error("💥 Error handling credits purchase:", error);
    throw error;
  }
}

async function handleSubscriptionRenewal(invoice: Stripe.Invoice) {
  try {
    console.log("🔄 Starting handleSubscriptionRenewal");

    // Get the customer's Firebase user ID
    const customer = await stripe.customers.retrieve(invoice.customer as string);
    const userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      console.error("❌ No Firebase user ID found for customer:", invoice.customer);
      return;
    }

    console.log("👤 Found user ID for renewal:", userId);

    // Get subscription details
    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) {
      console.error("❌ No subscription ID found on invoice:", invoice.id);
      return;
    }
    
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const lineItem = subscription.items.data[0];
    const priceId = lineItem.price.id;
    
    const planConfig = getPlanConfig(priceId);
    if (!planConfig) {
      console.error("❌ Unknown price ID for renewal:", priceId);
      return;
    }

    // Extend subscription and add credits
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("❌ User document not found for renewal:", userId);
      return;
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    await updateDoc(userRef, {
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate,
      updatedAt: new Date(),
    });

    console.log(`✅ Renewed subscription for user ${userId}. Added ${planConfig.credits} credits.`);

  } catch (error) {
    console.error("💥 Error handling subscription renewal:", error);
    throw error;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  try {
    console.log("🔄 Starting handleSubscriptionChange");

    // Get the customer's Firebase user ID
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    const userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      console.error("❌ No Firebase user ID found for customer:", subscription.customer);
      return;
    }

    console.log("👤 Found user ID for subscription change:", userId);

    const userRef = doc(db, "users", userId);
    
    if (subscription.status === "canceled" || subscription.status === "unpaid") {
      // Downgrade to free plan
      await updateDoc(userRef, {
        planType: "free",
        stripeSubscriptionId: null,
        subscriptionEndDate: null,
        updatedAt: new Date(),
      });
      
      console.log(`⬇️ Downgraded user ${userId} to free plan`);
    }

  } catch (error) {
    console.error("💥 Error handling subscription change:", error);
    throw error;
  }
}