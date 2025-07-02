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

// Interfaces
interface CreditDistribution {
  id: string;
  credits: number;
  distributionDate: Timestamp;
  status: 'pending' | 'processed' | 'failed';
  createdAt: Timestamp;
  processedAt?: Timestamp;
  idempotencyKey?: string;
}

interface UserCreditSchedule {
  monthlyCredits: number;
  remainingMonths: number;
  lastDistribution: Timestamp | null;
}

// Enhanced logging function
function logEvent(eventName: string, data: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${eventName}:`, JSON.stringify(data, null, 2));
}

// Plan configurations with monthly credit distribution
function getPlanConfig(priceId: string) {
  const configs: Record<string, any> = {
    [process.env.STRIPE_MONTHLY_PRICE_ID!]: {
      planType: "premium",
      monthlyCredits: 20, // Bonus credits per month
      freeCredits: 5,     // One-time free credits
      durationMonths: 1,
      name: "Monthly Premium"
    },
    [process.env.STRIPE_SEMIANNUAL_PRICE_ID!]: {
      planType: "premium",
      monthlyCredits: 20, // Same monthly credits as monthly plan
      freeCredits: 5,     // One-time free credits
      durationMonths: 6,
      name: "Semi-Annual Premium"
    },
    [process.env.STRIPE_ANNUAL_PRICE_ID!]: {
      planType: "premium",
      monthlyCredits: 20, // Same monthly credits as monthly plan
      freeCredits: 5,     // One-time free credits
      durationMonths: 12,
      name: "Annual Premium"
    }
  };

  logEvent("PlanConfigLookup", {
    priceId,
    availablePlans: Object.keys(configs),
    foundConfig: configs[priceId] || null
  });

  return configs[priceId] || null;
}

// Transactional update helper
async function updateUserDocument(userId: string, updateData: any) {
  const userRef = doc(db, "users", userId);
  
  try {
    // First try with transaction for atomic update
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) {
        throw new Error(`User document ${userId} does not exist`);
      }
      
      // Add server timestamp
      updateData.updatedAt = Timestamp.now();
      updateData.lastWebhookUpdate = new Date().toISOString();
      
      transaction.update(userRef, updateData);
    });
    
    logEvent("FirestoreUpdateSuccess", { userId, updateData });
    return true;
  } catch (transactionError: any) {
    logEvent("FirestoreTransactionError", {
      userId,
      error: transactionError.message,
      stack: transactionError.stack
    });
    
    // Fallback to direct update
    try {
      await setDoc(userRef, updateData, { merge: true });
      logEvent("FirestoreFallbackUpdateSuccess", { userId, updateData });
      return true;
    } catch (fallbackError: any) {
      logEvent("FirestoreUpdateFailure", {
        userId,
        error: fallbackError.message,
        stack: fallbackError.stack
      });
      throw fallbackError;
    }
  }
}

// Schedule monthly credit distribution with idempotency
async function scheduleMonthlyCredits(userId: string, monthlyCredits: number, months: number) {
  const creditsRef = collection(db, `users/${userId}/scheduledCredits`);
  const now = new Date();
  const batch = writeBatch(db);
  
  for (let i = 1; i <= months; i++) {
    const distributionDate = new Date(now);
    distributionDate.setMonth(distributionDate.getMonth() + i);
    
    const distId = `dist_${i}_${distributionDate.getTime()}`;
    const distDoc = doc(creditsRef, distId);
    
    batch.set(distDoc, {
      id: distId,
      credits: monthlyCredits,
      distributionDate: Timestamp.fromDate(distributionDate),
      status: "pending",
      createdAt: Timestamp.now(),
      idempotencyKey: `${userId}_${distributionDate.getTime()}`
    });
  }
  
  await batch.commit();
  
  logEvent("MonthlyCreditsScheduled", {
    userId,
    monthlyCredits,
    months,
    firstDistribution: new Date(now.setMonth(now.getMonth() + 1)),
    lastDistribution: new Date(now.setMonth(now.getMonth() + months))
  });
}

// Process pending credit distributions
async function processPendingDistributions(userId: string) {
  const userRef = doc(db, "users", userId);
  const creditsRef = collection(db, `users/${userId}/scheduledCredits`);
  
  const now = Timestamp.now();
  const pendingQuery = query(
    creditsRef,
    where("status", "==", "pending"),
    where("distributionDate", "<=", now)
  );
  
  const pendingSnap = await getDocs(pendingQuery);
  
  if (pendingSnap.empty) {
    logEvent("NoPendingDistributions", { userId });
    return;
  }

  const userDoc = await getDoc(userRef);
  if (!userDoc.exists()) {
    throw new Error(`User document not found: ${userId}`);
  }

  const userData = userDoc.data();
  const currentCredits = userData?.credits || 0;
  const creditSchedule = userData?.creditSchedule as UserCreditSchedule | undefined;
  
  if (!creditSchedule) {
    throw new Error(`No credit schedule found for user: ${userId}`);
  }

  let totalCreditsToAdd = 0;
  const batch = writeBatch(db);

  pendingSnap.forEach((doc) => {
    const dist = doc.data() as CreditDistribution;
    totalCreditsToAdd += dist.credits;
    batch.update(doc.ref, {
      status: "processed",
      processedAt: now
    });
  });

  // Atomic update of credits and distribution status
  batch.update(userRef, {
    credits: currentCredits + totalCreditsToAdd,
    updatedAt: now,
    "creditSchedule.lastDistribution": now,
    "creditSchedule.remainingMonths": increment(-pendingSnap.size),
    lastCreditGrant: {
      date: now.toDate(),
      credits: totalCreditsToAdd,
      type: 'monthly',
      planName: userData.planType
    }
  });

  await batch.commit();
  
  logEvent("MonthlyCreditsDistributed", {
    userId,
    creditsAdded: totalCreditsToAdd,
    distributionsProcessed: pendingSnap.size,
    newTotalCredits: currentCredits + totalCreditsToAdd,
    remainingMonths: creditSchedule.remainingMonths - pendingSnap.size
  });
}

// Get user ID from subscription
async function getUserIdFromSubscription(subscription: Stripe.Subscription): Promise<string> {
  // First try customer metadata
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  let userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
  
  if (userId) return userId;

  // Fallback: Find user by subscription ID
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("stripeSubscriptionId", "==", subscription.id));
  const userQuerySnapshot = await getDocs(q);
  
  if (!userQuerySnapshot.empty) {
    userId = userQuerySnapshot.docs[0].id;
    // Update customer metadata for future reference
    await stripe.customers.update(subscription.customer as string, {
      metadata: { firebaseUserId: userId }
    });
    return userId;
  }
  
  throw new Error(`No Firebase user ID found for customer: ${subscription.customer}`);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  
  logEvent("WebhookReceived", {
    bodyLength: body.length,
    signaturePresent: signature.length > 0
  });

  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    logEvent("WebhookVerified", { type: event.type });
  } catch (err: any) {
    logEvent("WebhookVerificationFailed", {
      error: err.message,
      stack: err.stack
    });
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
        
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
        
      default:
        logEvent("UnhandledEventType", { type: event.type });
    }
    
    return NextResponse.json({ received: true });
  } catch (error: any) {
    logEvent("WebhookProcessingError", {
      error: error.message,
      stack: error.stack,
      eventType: event.type
    });
    
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  logEvent("CheckoutSessionCompleted", {
    id: session.id,
    mode: session.mode,
    payment_status: session.payment_status,
    metadata: session.metadata
  });

  const userId = session.metadata?.userId;
  if (!userId) {
    throw new Error("No userId found in session metadata");
  }

  if (session.mode === "subscription" && session.subscription) {
    await handleSubscriptionPurchase(session, userId);
  } else if (session.mode === "payment") {
    logEvent("CreditsPurchaseNotImplemented", { sessionId: session.id, userId });
  }
}

async function handleSubscriptionPurchase(session: Stripe.Checkout.Session, userId: string) {
  try {
    const subscriptionId = session.subscription as string;
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });
    
    const priceId = subscription.items.data[0].price.id;
    const planConfig = getPlanConfig(priceId);
    
    if (!planConfig) {
      throw new Error(`Unknown price ID: ${priceId}`);
    }

    // Calculate subscription end date
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    // Verify user exists
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error(`User document not found: ${userId}`);
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    // Update Stripe customer metadata
    if (subscription.customer && typeof subscription.customer === 'string') {
      await stripe.customers.update(subscription.customer, {
        metadata: { firebaseUserId: userId }
      });
    }

    // Prepare initial update with free credits only
    const updateData = {
      planType: planConfig.planType,
      credits: currentCredits + planConfig.freeCredits, // Only add free credits initially
      subscriptionEndDate,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      lastCreditGrant: {
        date: new Date(),
        credits: planConfig.freeCredits,
        type: 'initial',
        planName: planConfig.name
      },
      creditSchedule: {
        monthlyCredits: planConfig.monthlyCredits,
        remainingMonths: planConfig.durationMonths,
        lastDistribution: null
      }
    };

    // Update user document
    await updateUserDocument(userId, updateData);

    // Schedule monthly credit distributions
    await scheduleMonthlyCredits(
      userId,
      planConfig.monthlyCredits,
      planConfig.durationMonths
    );

    // Process any distributions that are already due (e.g., for annual plans)
    await processPendingDistributions(userId);

    // Verification
    const updatedDoc = await getDoc(userRef);
    logEvent("SubscriptionPurchaseVerification", {
      expected: updateData,
      actual: updatedDoc.data()
    });

  } catch (error: any) {
    logEvent("SubscriptionPurchaseError", {
      error: error.message,
      stack: error.stack,
      userId,
      sessionId: session.id
    });
    throw error;
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  try {
    // @ts-expect-error: Stripe.Invoice may not have 'subscription' in older types, but it exists in API response
    if (!invoice.subscription) {
      throw new Error("No subscription ID found on invoice object");
    }

    // @ts-expect-error: Stripe.Invoice may not have 'subscription' in older types, but it exists in API response
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string, {
      expand: ['items.data.price']
    });

    const userId = await getUserIdFromSubscription(subscription);
    await processPendingDistributions(userId);

  } catch (error: any) {
    logEvent("SubscriptionRenewalError", {
      error: error.message,
      stack: error.stack,
      invoiceId: invoice.id
    });
    throw error;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  try {
    const userId = await getUserIdFromSubscription(subscription);
    const userRef = doc(db, "users", userId);

    // Prepare update based on subscription status
    const updateData: any = {
      updatedAt: Timestamp.now(),
      lastSubscriptionStatusChange: {
        status: subscription.status,
        date: new Date()
      }
    };

    if (["canceled", "unpaid", "incomplete_expired"].includes(subscription.status)) {
      updateData.planType = "free";
      updateData.stripeSubscriptionId = null;
      updateData.subscriptionEndDate = null;
      updateData.creditSchedule = null;
      
      // Optionally: Cancel pending distributions
      const creditsRef = collection(db, `users/${userId}/scheduledCredits`);
      const pendingQuery = query(creditsRef, where("status", "==", "pending"));
      const pendingSnap = await getDocs(pendingQuery);
      
      const batch = writeBatch(db);
      pendingSnap.forEach(doc => {
        batch.update(doc.ref, { status: "canceled" });
      });
      await batch.commit();
      
    } else if (subscription.status === "active") {
      updateData.planType = "premium";
      updateData.stripeSubscriptionId = subscription.id;
    }

    await updateUserDocument(userId, updateData);

    // Verification
    const updatedDoc = await getDoc(userRef);
    logEvent("SubscriptionChangeVerification", {
      expected: updateData,
      actual: updatedDoc.data()
    });

  } catch (error: any) {
    logEvent("SubscriptionChangeError", {
      error: error.message,
      stack: error.stack,
      subscriptionId: subscription.id,
      status: subscription.status
    });
    throw error;
  }
}