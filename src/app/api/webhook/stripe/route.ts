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
  runTransaction
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "@/firebase/config";

// Initialize Firebase
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

// Enhanced logging function
function logEvent(eventName: string, data: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${eventName}:`, JSON.stringify(data, null, 2));
}

// Plan configurations with proper credit system
function getPlanConfig(priceId: string) {
  const configs: Record<string, any> = {
    [process.env.STRIPE_MONTHLY_PRICE_ID!]: {
      planType: "premium",
      credits: 25,
      durationMonths: 1,
      name: "Monthly Premium",
      freeCredits: 5,
      bonusCredits: 20
    },
    [process.env.STRIPE_SEMIANNUAL_PRICE_ID!]: {
      planType: "premium",
      credits: 150,
      durationMonths: 6,
      name: "Semi-Annual Premium",
      freeCredits: 30,
      bonusCredits: 120
    },
    [process.env.STRIPE_ANNUAL_PRICE_ID!]: {
      planType: "premium",
      credits: 300,
      durationMonths: 12,
      name: "Annual Premium",
      freeCredits: 60,
      bonusCredits: 240
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
      updateData.updatedAt = new Date();
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
    await handleCreditsPurchase(session, userId);
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

    // Prepare update data
    const updateData = {
      planType: planConfig.planType,
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      lastCreditGrant: {
        date: new Date(),
        freeCredits: planConfig.freeCredits,
        bonusCredits: planConfig.bonusCredits,
        totalCredits: planConfig.credits,
        planName: planConfig.name
      }
    };

    // Update user document
    await updateUserDocument(userId, updateData);

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

async function handleCreditsPurchase(session: Stripe.Checkout.Session, userId: string) {
  try {
    const amountPaid = session.amount_total || 0;
    let creditsToAdd = 0;
    
    if (amountPaid === 500) {
      creditsToAdd = 5;
    } else if (amountPaid === 2000) {
      creditsToAdd = 25;
    } else {
      creditsToAdd = Math.floor(amountPaid / 100);
    }

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error(`User document not found: ${userId}`);
    }

    const currentCredits = userDoc.data()?.credits || 0;
    const updateData = {
      credits: currentCredits + creditsToAdd,
      lastCreditPurchase: {
        date: new Date(),
        amountPaid,
        creditsAdded: creditsToAdd,
        sessionId: session.id
      }
    };

    await updateUserDocument(userId, updateData);

    // Verification
    const updatedDoc = await getDoc(userRef);
    logEvent("CreditsPurchaseVerification", {
      expected: updateData,
      actual: updatedDoc.data()
    });

  } catch (error: any) {
    logEvent("CreditsPurchaseError", {
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
    const subscriptionId = (invoice as any).subscription as string | undefined;
    if (!subscriptionId) {
      throw new Error(`No subscription ID found on invoice: ${invoice.id}`);
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });

    // Get customer metadata
    const customer = await stripe.customers.retrieve(invoice.customer as string);
    let userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      // Fallback: Find user by subscription ID
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("stripeSubscriptionId", "==", subscriptionId));
      const userQuerySnapshot = await getDocs(q);
      
      if (!userQuerySnapshot.empty) {
        userId = userQuerySnapshot.docs[0].id;
        // Update customer metadata for future reference
        await stripe.customers.update(invoice.customer as string, {
          metadata: { firebaseUserId: userId }
        });
      }
    }
    
    if (!userId) {
      throw new Error(`No Firebase user ID found for customer: ${invoice.customer}`);
    }

    const priceId = subscription.items.data[0].price.id;
    const planConfig = getPlanConfig(priceId);
    
    if (!planConfig) {
      throw new Error(`Unknown price ID for renewal: ${priceId}`);
    }

    // Extend subscription
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    // Get current credits
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error(`User document not found: ${userId}`);
    }

    const currentCredits = userDoc.data()?.credits || 0;

    // Prepare update data
    const updateData = {
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate,
      lastCreditGrant: {
        date: new Date(),
        freeCredits: planConfig.freeCredits,
        bonusCredits: planConfig.bonusCredits,
        totalCredits: planConfig.credits,
        planName: planConfig.name,
        type: 'renewal'
      }
    };

    await updateUserDocument(userId, updateData);

    // Verification
    const updatedDoc = await getDoc(userRef);
    logEvent("SubscriptionRenewalVerification", {
      expected: updateData,
      actual: updatedDoc.data()
    });

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
    // Get customer metadata
    const customer = await stripe.customers.retrieve(subscription.customer as string);
    let userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      // Fallback: Find user by subscription ID
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("stripeSubscriptionId", "==", subscription.id));
      const userQuerySnapshot = await getDocs(q);
      
      if (!userQuerySnapshot.empty) {
        userId = userQuerySnapshot.docs[0].id;
      }
    }
    
    if (!userId) {
      throw new Error(`No Firebase user ID found for customer: ${subscription.customer}`);
    }

    // Prepare update based on subscription status
    const updateData: any = {
      updatedAt: new Date(),
      lastSubscriptionStatusChange: {
        status: subscription.status,
        date: new Date()
      }
    };

    if (["canceled", "unpaid", "incomplete_expired"].includes(subscription.status)) {
      updateData.planType = "free";
      updateData.stripeSubscriptionId = null;
      updateData.subscriptionEndDate = null;
    } else if (subscription.status === "active") {
      updateData.planType = "premium";
      updateData.stripeSubscriptionId = subscription.id;
    }

    await updateUserDocument(userId, updateData);

    // Verification
    const userRef = doc(db, "users", userId);
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