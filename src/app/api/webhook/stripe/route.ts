import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { 
  getFirestore, 
  doc, 
  updateDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  setDoc,
  runTransaction,
  Timestamp,
  writeBatch,
  arrayUnion,
  increment
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "@/firebase/config";

// Initialize Firebase
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

// Constants
const MONTHLY_CREDITS = 20;
const INITIAL_FREE_CREDITS = 5;

// Enhanced logging
function logEvent(eventName: string, data: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${eventName}:`, JSON.stringify(data, null, 2));
}

// Plan configurations
function getPlanConfig(priceId: string) {
  const configs = {
    [process.env.STRIPE_MONTHLY_PRICE_ID!]: {
      planType: "premium",
      durationMonths: 1,
      name: "Monthly Premium"
    },
    [process.env.STRIPE_SEMIANNUAL_PRICE_ID!]: {
      planType: "premium",
      durationMonths: 6,
      name: "Semi-Annual Premium"
    },
    [process.env.STRIPE_ANNUAL_PRICE_ID!]: {
      planType: "premium",
      durationMonths: 12,
      name: "Annual Premium"
    }
  };
  
  return configs[priceId] || null;
}

// Get user ID from subscription
async function getUserIdFromSubscription(subscription: Stripe.Subscription): Promise<string> {
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  let userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
  
  if (!userId) {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("stripeSubscriptionId", "==", subscription.id));
    const userQuerySnapshot = await getDocs(q);
    
    if (!userQuerySnapshot.empty) {
      userId = userQuerySnapshot.docs[0].id;
      await stripe.customers.update(subscription.customer as string, {
        metadata: { firebaseUserId: userId }
      });
    }
  }
  
  if (!userId) throw new Error(`No user ID found for customer: ${subscription.customer}`);
  return userId;
}

// Check and add monthly credits if due
async function checkMonthlyCredits(userId: string) {
  const userRef = doc(db, "users", userId);
  
  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error(`User not found: ${userId}`);
    }

    const userData = userDoc.data();
    if (userData.planType !== "premium") return;

    const now = new Date();
    const lastCreditDate = userData.lastMonthlyCredit?.toDate();
    const nextCreditDate = userData.nextCreditDate?.toDate();
    const subscriptionEndDate = userData.subscriptionEndDate?.toDate();

    // Check if subscription is still valid
    if (subscriptionEndDate && now >= subscriptionEndDate) {
      logEvent("CreditsSkipped", { 
        userId, 
        reason: "Subscription ended",
        subscriptionEndDate: subscriptionEndDate.toISOString()
      });
      return;
    }

    // If no credits have been given yet, initialize
    if (!lastCreditDate) {
      transaction.update(userRef, {
        lastMonthlyCredit: Timestamp.now(),
        nextCreditDate: getNextCreditDate(new Date())
      });
      return;
    }

    // Check if it's time for monthly credits
    if (now >= (nextCreditDate || new Date(0))) {
      transaction.update(userRef, {
        credits: increment(MONTHLY_CREDITS),
        lastMonthlyCredit: Timestamp.now(),
        nextCreditDate: getNextCreditDate(now),
        creditHistory: arrayUnion({
          date: Timestamp.now(),
          credits: MONTHLY_CREDITS,
          type: "monthly"
        })
      });

      logEvent("MonthlyCreditsAdded", { 
        userId, 
        creditsAdded: MONTHLY_CREDITS,
        nextCreditDate: getNextCreditDate(now).toDate().toISOString()
      });
    }
  });
}

// Calculate next credit date (30 days from now)
function getNextCreditDate(fromDate: Date): Timestamp {
  const nextDate = new Date(fromDate);
  nextDate.setDate(nextDate.getDate() + 30);
  return Timestamp.fromDate(nextDate);
}

// Webhook handler
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    logEvent("WebhookReceived", { type: event.type });
  } catch (err: any) {
    logEvent("WebhookVerificationFailed", { error: err.message });
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
        
      case "invoice.payment_succeeded":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
        
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
    }
    
    return NextResponse.json({ received: true });
  } catch (error: any) {
    logEvent("WebhookProcessingError", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Handle new subscription
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.metadata?.type === "credits") {
    await handleCreditPurchase(session);
    return;
  }

  if (!session.subscription || !session.metadata?.userId) {
    throw new Error("Missing subscription or user ID in session");
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const priceId = subscription.items.data[0].price.id;
  const planConfig = getPlanConfig(priceId);
  const userId = session.metadata.userId;

  if (!planConfig) throw new Error(`Unknown price ID: ${priceId}`);

  const userRef = doc(db, "users", userId);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error(`User not found: ${userId}`);
    }

    const userData = userDoc.data();
    const currentCredits = userData.credits || 0;
    const creditsToAdd = 25; // Initial subscription bonus credits

    // Calculate subscription end date
    let subscriptionStart = new Date();
    let subscriptionEndDate: Date;

    if (userData.subscriptionEndDate && userData.planType === "premium") {
      // Extend from current end date if in the future, else from now
      const currentEndDate = userData.subscriptionEndDate.toDate();
      if (currentEndDate > subscriptionStart) {
        subscriptionStart = currentEndDate;
      }
      subscriptionEndDate = new Date(subscriptionStart);
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);
    } else {
      subscriptionEndDate = new Date(subscriptionStart);
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);
    }

    transaction.update(userRef, {
      planType: planConfig.planType,
      credits: currentCredits + creditsToAdd,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      subscriptionStart: Timestamp.fromDate(new Date()), // always set to now
      subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
      lastMonthlyCredit: Timestamp.now(),
      nextCreditDate: getNextCreditDate(subscriptionStart), // <-- set to 1 month after subscriptionStart
      creditHistory: arrayUnion({
        date: Timestamp.now(),
        credits: creditsToAdd,
        type: "initial"
      }),
      updatedAt: Timestamp.now()
    });

    logEvent("SubscriptionCreated", { 
      userId: userId, 
      plan: planConfig.name,
      creditsAdded: creditsToAdd,
      totalCredits: currentCredits + creditsToAdd,
      subscriptionEndDate: subscriptionEndDate.toISOString(),
      extendedExisting: userData.subscriptionEndDate ? true : false
    });
  });
}

async function handleCreditPurchase(session: Stripe.Checkout.Session) {
  if (!session.metadata?.userId || !session.metadata?.credits || session.metadata?.type !== "credits") {
    throw new Error("Missing required metadata for credit purchase");
  }

  const userId = session.metadata.userId;
  const credits = parseInt(session.metadata.credits, 10);
  const userRef = doc(db, "users", userId);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error(`User not found: ${userId}`);
    }

    transaction.update(userRef, {
      credits: increment(credits),
      creditHistory: arrayUnion({
        date: Timestamp.now(),
        credits,
        type: "purchased"
      }),
      updatedAt: Timestamp.now()
    });
  });

  logEvent("CreditsPurchased", { userId, credits });
}

// Handle recurring payments
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // The subscription ID may be under invoice.subscription or invoice.subscription as a custom field depending on Stripe API version.
  const subscriptionId = (invoice as any).subscription;
  if (!subscriptionId) return;
  
  const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
  const userId = await getUserIdFromSubscription(subscription);
  const userRef = doc(db, "users", userId);
  
  // Get the subscription end date from Stripe
  const subscriptionEndDate = new Date((subscription as any).current_period_end * 1000);

  // Update subscription end date and check monthly credits
  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error(`User not found: ${userId}`);
    }

    const userData = userDoc.data();
    if (userData.planType !== "premium") return;

    transaction.update(userRef, {
      subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
      updatedAt: Timestamp.now()
    });

    logEvent("SubscriptionEndDateUpdated", {
      userId,
      subscriptionEndDate: subscriptionEndDate.toISOString()
    });

    // Check if monthly credits are due
    const now = new Date();
    const lastCreditDate = userData.lastMonthlyCredit?.toDate();
    const nextCreditDate = userData.nextCreditDate?.toDate();

    // If no credits have been given yet, initialize
    if (!lastCreditDate) {
      transaction.update(userRef, {
        lastMonthlyCredit: Timestamp.now(),
        nextCreditDate: getNextCreditDate(new Date())
      });
      return;
    }

    // Check if it's time for monthly credits
    if (now >= (nextCreditDate || new Date(0))) {
      transaction.update(userRef, {
        credits: increment(MONTHLY_CREDITS),
        lastMonthlyCredit: Timestamp.now(),
        nextCreditDate: getNextCreditDate(now),
        creditHistory: arrayUnion({
          date: Timestamp.now(),
          credits: MONTHLY_CREDITS,
          type: "monthly"
        })
      });

      logEvent("MonthlyCreditsAdded", { 
        userId, 
        creditsAdded: MONTHLY_CREDITS,
        nextCreditDate: getNextCreditDate(now).toDate().toISOString()
      });
    }
  });
}

// Handle subscription changes
async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const userId = await getUserIdFromSubscription(subscription);
  const userRef = doc(db, "users", userId);

  if (["canceled", "unpaid"].includes(subscription.status)) {
    await updateDoc(userRef, {
      planType: "free",
      stripeSubscriptionId: null,
      nextCreditDate: null,
      subscriptionEndDate: null, // Clear subscription end date
      updatedAt: Timestamp.now()
    });
    logEvent("SubscriptionCancelled", { userId });
  } else if (subscription.status === "active") {
    // Fetch the subscription to get the current period end
    const subscriptionEndDate = new Date((subscription as any).current_period_end * 1000);
    await updateDoc(userRef, {
      planType: "premium",
      stripeSubscriptionId: subscription.id,
      subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate), // Update end date
      updatedAt: Timestamp.now()
    });
    // Check if credits are due after reactivation
    await checkMonthlyCredits(userId);
    logEvent("SubscriptionReactivated", { userId });
  }
}