// app/api/webhooks/stripe/route.ts
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

// Calculate how many months have passed between two dates
function getMonthsDifference(startDate: Date, endDate: Date): number {
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth();
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

// Load up missed monthly credits when user logs in or on webhook
async function loadMissedMonthlyCredits(userId: string) {
  const userRef = doc(db, "users", userId);

  return runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists()) {
      throw new Error(`User not found: ${userId}`);
    }

    const userData = userDoc.data();

    // Only process for premium users
    if (userData.planType !== "premium") {
      logEvent("SkippedCreditLoad", { userId, reason: "Not premium user" });
      return;
    }

    const now = new Date();
    const subscriptionStart = userData.subscriptionStart?.toDate();
    const lastMonthlyCredit = userData.lastMonthlyCredit?.toDate() || subscriptionStart;

    if (!subscriptionStart || !lastMonthlyCredit) {
      logEvent("SkippedCreditLoad", { userId, reason: "Missing subscription or credit dates" });
      return;
    }

    // Calculate months since last credit allocation
    const monthsSinceLastCredit = getMonthsDifference(lastMonthlyCredit, now);

    if (monthsSinceLastCredit > 0) {
      const creditsToAdd = monthsSinceLastCredit * MONTHLY_CREDITS;
      const currentCredits = userData.credits || 0;

      // Create credit history entries for each missed month
      const creditHistoryEntries = [];
      for (let i = 1; i <= monthsSinceLastCredit; i++) {
        const creditDate = new Date(lastMonthlyCredit);
        creditDate.setMonth(creditDate.getMonth() + i);

        creditHistoryEntries.push({
          date: Timestamp.fromDate(creditDate),
          credits: MONTHLY_CREDITS,
          type: "monthly_backfill"
        });
      }

      // Update user document
      transaction.update(userRef, {
        credits: currentCredits + creditsToAdd,
        lastMonthlyCredit: Timestamp.now(),
        nextCreditDate: getNextCreditDate(now),
        creditHistory: arrayUnion(...creditHistoryEntries),
        updatedAt: Timestamp.now()
      });

      logEvent("MissedCreditsLoaded", {
        userId,
        monthsMissed: monthsSinceLastCredit,
        creditsAdded: creditsToAdd,
        newTotal: currentCredits + creditsToAdd,
        lastCreditDate: lastMonthlyCredit.toISOString(),
        currentDate: now.toISOString()
      });
    } else {
      logEvent("NoMissedCredits", { userId, lastCreditDate: lastMonthlyCredit.toISOString() });
    }
  });
}

// Updated checkMonthlyCredits function (replace the existing one)
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
    const subscriptionStart = userData.subscriptionStart?.toDate();
    const lastCreditDate = userData.lastMonthlyCredit?.toDate();

    // If no credits have been given yet, initialize with subscription start
    if (!lastCreditDate && subscriptionStart) {
      transaction.update(userRef, {
        lastMonthlyCredit: userData.subscriptionStart,
        nextCreditDate: getNextCreditDate(subscriptionStart)
      });
      return;
    }

    // Use the enhanced loading function to handle multiple months
    await loadMissedMonthlyCredits(userId);
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
  if (!session.subscription || !session.metadata?.userId) {
    throw new Error("Missing subscription or user ID in session");
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const priceId = subscription.items.data[0].price.id;
  const planConfig = getPlanConfig(priceId);
  const userId = session.metadata.userId;

  if (!planConfig) throw new Error(`Unknown price ID: ${priceId}`);

  const userRef = doc(db, "users", userId);
  const userDoc = await getDoc(userRef);
  const currentCredits = userDoc.exists() ? userDoc.data().credits || 0 : 0;

  await setDoc(userRef, {
    planType: planConfig.planType,
    credits: currentCredits + INITIAL_FREE_CREDITS,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer,
    subscriptionStart: Timestamp.now(),
    lastMonthlyCredit: Timestamp.now(),
    creditHistory: arrayUnion({
      date: Timestamp.now(),
      credits: INITIAL_FREE_CREDITS,
      type: "initial"
    }),
    updatedAt: Timestamp.now()
  }, { merge: true });

  logEvent("SubscriptionCreated", { 
    userId: userId, 
    plan: planConfig.name,
    initialCredits: INITIAL_FREE_CREDITS
  });
}

// Handle recurring payments
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // The subscription ID may be under invoice.subscription or invoice.subscription as a custom field depending on Stripe API version.
  const subscriptionId = (invoice as any).subscription;
  if (!subscriptionId) return;
  
  const subscription = await stripe.subscriptions.retrieve(subscriptionId as string);
  const userId = await getUserIdFromSubscription(subscription);
  
  // Check if monthly credits are due
  await checkMonthlyCredits(userId);
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
      updatedAt: Timestamp.now()
    });
    logEvent("SubscriptionCancelled", { userId });
  } else if (subscription.status === "active") {
    await updateDoc(userRef, {
      planType: "premium",
      stripeSubscriptionId: subscription.id,
      updatedAt: Timestamp.now()
    });
    // Check if credits are due after reactivation
    await checkMonthlyCredits(userId);
    logEvent("SubscriptionReactivated", { userId });
  }
}

// Function to call when user logs in (add this to your auth logic)
export async function handleUserLogin(userId: string) {
  try {
    await loadMissedMonthlyCredits(userId);
    logEvent("UserLoginCreditCheck", { userId });
  } catch (error: any) {
    logEvent("UserLoginCreditCheckError", { userId, error: error.message });
    // Don't throw - we don't want to block login if credit loading fails
  }
}