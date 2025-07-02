// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);

// Plan configurations - using direct price IDs instead of env variables
function getPlanConfig(priceId: string) {
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
  
  console.log("🔍 Available plan configs:", Object.keys(configs));
  console.log("🔍 Looking for price ID:", priceId);
  
  return configs[priceId] || null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  console.log("🚀 Webhook received - starting processing");

  if (!signature) {
    console.error("❌ No Stripe signature found");
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
    console.log("✅ Webhook signature verified successfully");
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  console.log(`🔔 Received webhook event: ${event.type}`);
  console.log("📄 Event data object keys:", Object.keys(event.data.object));

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
          paymentStatus: session.payment_status,
        });

        const userId = session.metadata?.userId;
        
        if (!userId) {
          console.error("❌ No userId found in session metadata");
          console.error("Available metadata keys:", Object.keys(session.metadata || {}));
          return NextResponse.json({ error: "No userId in metadata" }, { status: 400 });
        }

        console.log("✅ Found userId in metadata:", userId);

        // Verify user exists in Firestore before processing
        const userRef = doc(db, "users", userId);
        const userDoc = await getDoc(userRef);
        
        if (!userDoc.exists()) {
          console.error("❌ User document not found in Firestore:", userId);
          return NextResponse.json({ error: "User not found" }, { status: 400 });
        }

        console.log("✅ User document found in Firestore");

        // Handle subscription purchase
        if (session.mode === "subscription" && session.subscription) {
          console.log("🔄 Handling subscription purchase for session:", session.id);
          await handleSubscriptionPurchase(session, userId);
        } else if (session.mode === "payment") {
          // Handle one-time credit purchase
          console.log("💰 Handling credits purchase for session:", session.id);
          await handleCreditsPurchase(session, userId);
        } else {
          console.warn("⚠️ Unknown session mode:", session.mode);
        }
        
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        
        console.log("📄 Processing invoice.payment_succeeded:", {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          subscriptionId: (invoice as any).subscription as string,
        });

        // Handle recurring subscription payments
        if ((invoice as any).subscription) {
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

    console.log("✅ Webhook processing completed successfully");
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("💥 Error processing webhook:", error);
    console.error("💥 Error stack:", error.stack);
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
      throw new Error("No subscription ID found in session");
    }

    console.log("🔍 Retrieving subscription:", subscriptionId);
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });
    
    console.log("📋 Retrieved subscription:", {
      id: subscription.id,
      status: subscription.status,
      items: subscription.items.data.length,
      customer: subscription.customer,
    });

    if (subscription.items.data.length === 0) {
      console.error("❌ No line items found in subscription");
      throw new Error("No line items found in subscription");
    }

    const lineItem = subscription.items.data[0];
    const priceId = lineItem.price.id;
    
    console.log("💲 Price ID from subscription:", priceId);
    console.log("💲 Available environment variables:", {
      monthly: process.env.STRIPE_MONTHLY_PRICE_ID ? "SET" : "NOT SET",
      semiannual: process.env.STRIPE_SEMIANNUAL_PRICE_ID ? "SET" : "NOT SET",
      annual: process.env.STRIPE_ANNUAL_PRICE_ID ? "SET" : "NOT SET"
    });
    
    const planConfig = getPlanConfig(priceId);
    if (!planConfig) {
      console.error("❌ Unknown price ID:", priceId);
      console.error("Available price IDs:", {
        monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
        semiannual: process.env.STRIPE_SEMIANNUAL_PRICE_ID,
        annual: process.env.STRIPE_ANNUAL_PRICE_ID
      });
      throw new Error(`Unknown price ID: ${priceId}`);
    }

    console.log("✅ Plan config found:", planConfig);

    // Calculate subscription end date
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    console.log("📅 Calculated subscription end date:", subscriptionEndDate.toISOString());

    // Get current user data
    const userRef = doc(db, "users", userId);
    console.log("🔍 Getting user document for:", userId);
    
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("❌ User document not found:", userId);
      throw new Error(`User document not found: ${userId}`);
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    console.log("👤 Current user data:", {
      currentCredits,
      currentPlanType: currentUserData?.planType,
      currentSubscriptionId: currentUserData?.stripeSubscriptionId,
      currentCustomerId: currentUserData?.stripeCustomerId,
    });

    // CRITICAL: Store the customer ID in Stripe customer metadata for future reference
    if (subscription.customer && typeof subscription.customer === 'string') {
      try {
        console.log("🔄 Updating Stripe customer metadata...");
        await stripe.customers.update(subscription.customer, {
          metadata: {
            firebaseUserId: userId
          }
        });
        console.log("✅ Updated Stripe customer metadata with Firebase user ID");
      } catch (error) {
        console.error("⚠️ Failed to update Stripe customer metadata:", error);
      }
    }

    // Prepare update data
    const updateData = {
      planType: planConfig.planType,
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      updatedAt: new Date(),
    };

    console.log("📝 Preparing to update user with data:", updateData);
    console.log("📝 User reference path:", userRef.path);

    // Update user document
    console.log("🔄 Executing Firestore update...");
    await updateDoc(userRef, updateData);
    console.log("✅ Firestore update completed successfully");

    // Verify the update by reading the document again
    const updatedUserDoc = await getDoc(userRef);
    if (updatedUserDoc.exists()) {
      const updatedData = updatedUserDoc.data();
      console.log("🔍 Verification - Updated user data:", {
        planType: updatedData?.planType,
        credits: updatedData?.credits,
        stripeSubscriptionId: updatedData?.stripeSubscriptionId,
        subscriptionEndDate: updatedData?.subscriptionEndDate,
      });
    } else {
      console.error("❌ User document not found after update - this shouldn't happen");
    }

    console.log(`✅ Successfully updated user ${userId} with subscription:`, {
      planType: planConfig.planType,
      creditsAdded: planConfig.credits,
      totalCredits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate.toISOString(),
      subscriptionId: subscription.id,
    });

  } catch (error) {
    console.error("💥 Error handling subscription purchase:", error);
    const err = error as any;
    console.error("💥 Error details:", {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
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
      throw new Error(`User document not found: ${userId}`);
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;
    
    // Determine credits based on amount paid
    const amountPaid = session.amount_total || 0; // in cents
    let creditsToAdd = 0;
    
    console.log("💵 Amount paid (in cents):", amountPaid);
    
    // Based on your pricing: 5 credits = $5, 25 credits = $20
    if (amountPaid === 500) { // $5.00
      creditsToAdd = 5;
    } else if (amountPaid === 2000) { // $20.00
      creditsToAdd = 25;
    } else {
      // Fallback: $1 = 1 credit
      creditsToAdd = Math.floor(amountPaid / 100);
    }
    
    console.log("💰 Credits to add:", creditsToAdd);
    
    const updateData = {
      credits: currentCredits + creditsToAdd,
      updatedAt: new Date(),
    };
    
    console.log("📝 Updating user with credits data:", updateData);
    
    await updateDoc(userRef, updateData);

    // Verify the update
    const updatedUserDoc = await getDoc(userRef);
    if (updatedUserDoc.exists()) {
      const updatedData = updatedUserDoc.data();
      console.log("🔍 Verification - Updated credits:", updatedData?.credits);
    }

    console.log(`✅ Added ${creditsToAdd} credits to user ${userId}. Total: ${currentCredits + creditsToAdd}`);

  } catch (error) {
    console.error("💥 Error handling credits purchase:", error);
    throw error;
  }
}

async function handleSubscriptionRenewal(invoice: Stripe.Invoice) {
  try {
    console.log("🔄 Starting handleSubscriptionRenewal");

    // Get the subscription details first
    const subscriptionId = (invoice as any).subscription as string;
    if (!subscriptionId) {
      console.error("❌ No subscription ID found on invoice:", invoice.id);
      throw new Error("No subscription ID found on invoice");
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price']
    });

    // Get the customer's Firebase user ID from Stripe customer metadata
    const customer = await stripe.customers.retrieve(invoice.customer as string);
    let userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      console.log("⚠️ No Firebase user ID in customer metadata, attempting to find by subscription ID");
      
      // Fallback: Try to find user by subscription ID in Firestore
      const usersRef = collection(db, "users");
      const q = query(
        usersRef,
        where("stripeSubscriptionId", "==", subscriptionId)
      );
      const userQuerySnapshot = await getDocs(q);
      if (!userQuerySnapshot.empty) {
        userId = userQuerySnapshot.docs[0].id;
        console.log("✅ Found user by subscription ID:", userId);

        // Update the Stripe customer metadata for future use
        try {
          await stripe.customers.update(invoice.customer as string, {
            metadata: {
              firebaseUserId: userId
            }
          });
          console.log("✅ Updated Stripe customer metadata with Firebase user ID");
        } catch (error) {
          console.error("⚠️ Failed to update Stripe customer metadata:", error);
        }
      }
    }
    
    if (!userId) {
      console.error("❌ No Firebase user ID found for customer:", invoice.customer);
      throw new Error(`No Firebase user ID found for customer: ${invoice.customer}`);
    }

    console.log("👤 Found user ID for renewal:", userId);

    const lineItem = subscription.items.data[0];
    const priceId = lineItem.price.id;
    
    const planConfig = getPlanConfig(priceId);
    if (!planConfig) {
      console.error("❌ Unknown price ID for renewal:", priceId);
      throw new Error(`Unknown price ID for renewal: ${priceId}`);
    }

    // Extend subscription and add credits
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + planConfig.durationMonths);

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("❌ User document not found for renewal:", userId);
      throw new Error(`User document not found for renewal: ${userId}`);
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    await updateDoc(userRef, {
      credits: currentCredits + planConfig.credits,
      subscriptionEndDate: subscriptionEndDate,
      updatedAt: new Date(),
    });

    console.log(`✅ Renewed subscription for user ${userId}. Added ${planConfig.credits} credits. Total: ${currentCredits + planConfig.credits}`);

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
    let userId = (customer as Stripe.Customer).metadata?.firebaseUserId;
    
    if (!userId) {
      console.log("⚠️ No Firebase user ID in customer metadata, attempting to find by subscription ID");
      
      // Fallback: Try to find user by subscription ID
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("stripeSubscriptionId", "==", subscription.id));
      const userQuerySnapshot = await getDocs(q);
      if (!userQuerySnapshot.empty) {
        userId = userQuerySnapshot.docs[0].id;
        console.log("✅ Found user by subscription ID:", userId);
      }
    }
    
    if (!userId) {
      console.error("❌ No Firebase user ID found for customer:", subscription.customer);
      throw new Error(`No Firebase user ID found for customer: ${subscription.customer}`);
    }

    console.log("👤 Found user ID for subscription change:", userId);

    const userRef = doc(db, "users", userId);
    
    if (subscription.status === "canceled" || subscription.status === "unpaid" || subscription.status === "incomplete_expired") {
      // Downgrade to free plan
      await updateDoc(userRef, {
        planType: "free",
        stripeSubscriptionId: null,
        subscriptionEndDate: null,
        updatedAt: new Date(),
      });
      
      console.log(`⬇️ Downgraded user ${userId} to free plan`);
    } else if (subscription.status === "active") {
      // Ensure the user is on premium plan (in case of reactivation)
      await updateDoc(userRef, {
        planType: "premium",
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      });
      
      console.log(`⬆️ Activated premium plan for user ${userId}`);
    }

  } catch (error) {
    console.error("💥 Error handling subscription change:", error);
    throw error;
  }
}