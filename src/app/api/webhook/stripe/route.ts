// app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, updateDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);

// Plan configurations with monthly credit allocation
function getPlanConfig(priceId: string) {
  const configs: { [key: string]: any } = {};
  
  // Monthly plan: 5 free + 20 bonus = 25 credits per month
  if (process.env.STRIPE_MONTHLY_PRICE_ID) {
    configs[process.env.STRIPE_MONTHLY_PRICE_ID] = {
      planType: "premium",
      monthlyCredits: 25, // Credits given each month
      durationMonths: 1,
      name: "Monthly Premium",
      freeCredits: 5,
      bonusCredits: 20
    };
  }
  
  // Semi-annual plan: 25 credits per month for 6 months
  if (process.env.STRIPE_SEMIANNUAL_PRICE_ID) {
    configs[process.env.STRIPE_SEMIANNUAL_PRICE_ID] = {
      planType: "premium",
      monthlyCredits: 25, // Credits given each month
      durationMonths: 6,
      name: "Semi-Annual Premium",
      freeCredits: 5,
      bonusCredits: 20
    };
  }
  
  // Annual plan: 25 credits per month for 12 months
  if (process.env.STRIPE_ANNUAL_PRICE_ID) {
    configs[process.env.STRIPE_ANNUAL_PRICE_ID] = {
      planType: "premium",
      monthlyCredits: 25, // Credits given each month
      durationMonths: 12,
      name: "Annual Premium",
      freeCredits: 5,
      bonusCredits: 20
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

        // Handle recurring subscription payments (monthly credit allocation)
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
    }) as Stripe.Subscription;
    
    console.log("📋 Retrieved subscription:", {
      id: subscription.id,
      status: subscription.status,
      items: subscription.items.data.length,
      customer: subscription.customer,
      current_period_start: (subscription as any).current_period_start,
      current_period_end: (subscription as any).current_period_end,
    });

    if (subscription.items.data.length === 0) {
      console.error("❌ No line items found in subscription");
      throw new Error("No line items found in subscription");
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
      throw new Error(`Unknown price ID: ${priceId}`);
    }

    console.log("✅ Plan config found:", planConfig);

    // Calculate subscription end date based on the plan duration
    const subscriptionEndDate = new Date((subscription as any).current_period_end * 1000);
    
    // For multi-month plans, calculate the actual end date
    if (planConfig.durationMonths > 1) {
      const startDate = new Date((subscription as any)["current_period_start"] * 1000);
      subscriptionEndDate.setMonth(startDate.getMonth() + planConfig.durationMonths);
    }

    console.log("📅 Calculated subscription end date:", subscriptionEndDate.toISOString());

    // Calculate next credit allocation date (monthly)
    const nextCreditDate = new Date((subscription as any).current_period_end * 1000);

    // Get current user data
    const userRef = doc(db, "users", userId);
    console.log("🔍 Getting user document for:", userId);
    
    let userDoc = await getDoc(userRef);
    
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

    // Store the customer ID in Stripe customer metadata for future reference
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

    // FIXED: Only give monthly credits (25), not the full plan amount
    const updateData: any = {
      planType: planConfig.planType,
      credits: currentCredits + planConfig.monthlyCredits, // Only monthly credits
      subscriptionEndDate: subscriptionEndDate,
      nextCreditAllocationDate: nextCreditDate, // Track when next credits should be given
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer,
      subscriptionPlan: {
        name: planConfig.name,
        durationMonths: planConfig.durationMonths,
        monthlyCredits: planConfig.monthlyCredits,
        freeCredits: planConfig.freeCredits,
        bonusCredits: planConfig.bonusCredits
      },
      updatedAt: new Date(),
      // Track credit breakdown for transparency
      lastCreditGrant: {
        date: new Date(),
        freeCredits: planConfig.freeCredits,
        bonusCredits: planConfig.bonusCredits,
        totalCredits: planConfig.monthlyCredits, // Monthly credits only
        planName: planConfig.name,
        type: 'initial_purchase'
      }
    };

    console.log("📝 Preparing to update user with data:", updateData);
    console.log("📝 Credit breakdown:", {
      previousCredits: currentCredits,
      monthlyFreeCredits: planConfig.freeCredits,
      monthlyBonusCredits: planConfig.bonusCredits,
      monthlyTotalCredits: planConfig.monthlyCredits,
      newTotalCredits: currentCredits + planConfig.monthlyCredits,
      planDuration: `${planConfig.durationMonths} months`,
      nextCreditDate: nextCreditDate.toISOString()
    });

    console.log("🔄 Executing Firestore update with merge...");
    
    try {
      await updateDoc(userRef, updateData);
      console.log("✅ Firestore updateDoc completed successfully");
    } catch (updateError: any) {
      console.warn("⚠️ updateDoc failed, trying setDoc with merge:", updateError.message);
      
      const { setDoc } = await import("firebase/firestore");
      await setDoc(userRef, updateData, { merge: true });
      console.log("✅ Firestore setDoc with merge completed successfully");
    }

    // Verification
    console.log("⏳ Waiting 1 second before verification...");
    await new Promise(resolve => setTimeout(resolve, 1000));

    const updatedUserDoc = await getDoc(userRef);
    if (updatedUserDoc.exists()) {
      const updatedData = updatedUserDoc.data();
      console.log("🔍 Verification - Updated user data:", {
        planType: updatedData?.planType,
        credits: updatedData?.credits,
        nextCreditAllocationDate: updatedData?.nextCreditAllocationDate,
        subscriptionEndDate: updatedData?.subscriptionEndDate,
      });
    }

    console.log(`✅ Successfully processed subscription for user ${userId}:`, {
      planType: planConfig.planType,
      monthlyCreditsAdded: planConfig.monthlyCredits,
      newTotalCredits: currentCredits + planConfig.monthlyCredits,
      subscriptionEndDate: subscriptionEndDate.toISOString(),
      nextCreditAllocation: nextCreditDate.toISOString(),
      subscriptionId: subscription.id,
      planDuration: `${planConfig.durationMonths} months`
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
    
    const updateData: any = {
      credits: currentCredits + creditsToAdd,
      updatedAt: new Date(),
    };
    
    console.log("📝 Updating user with credits data:", updateData);
    
    try {
      await updateDoc(userRef, updateData);
      console.log("✅ Credits updateDoc completed successfully");
    } catch (updateError: any) {
      console.warn("⚠️ Credits updateDoc failed, trying setDoc with merge:", updateError.message);
      
      const { setDoc } = await import("firebase/firestore");
      await setDoc(userRef, updateData, { merge: true });
      console.log("✅ Credits setDoc with merge completed successfully");
    }

    // Verify the update
    await new Promise(resolve => setTimeout(resolve, 1000));
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

    // Calculate next credit allocation date
    const nextCreditDate = new Date((subscription as any).current_period_end * 1000);

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error("❌ User document not found for renewal:", userId);
      throw new Error(`User document not found for renewal: ${userId}`);
    }

    const currentUserData = userDoc.data();
    const currentCredits = currentUserData?.credits || 0;

    // FIXED: Only add monthly credits on renewal, not full plan amount
    const renewalUpdateData: any = {
      credits: currentCredits + planConfig.monthlyCredits, // Monthly credits only
      nextCreditAllocationDate: nextCreditDate, // Update next allocation date
      updatedAt: new Date(),
      lastCreditGrant: {
        date: new Date(),
        freeCredits: planConfig.freeCredits,
        bonusCredits: planConfig.bonusCredits,
        totalCredits: planConfig.monthlyCredits, // Monthly credits only
        planName: planConfig.name,
        type: 'monthly_renewal'
      }
    };

    try {
      await updateDoc(userRef, renewalUpdateData);
      console.log("✅ Renewal updateDoc completed successfully");
    } catch (updateError: any) {
      console.warn("⚠️ Renewal updateDoc failed, trying setDoc with merge:", updateError.message);
      
      const { setDoc } = await import("firebase/firestore");
      await setDoc(userRef, renewalUpdateData, { merge: true });
      console.log("✅ Renewal setDoc with merge completed successfully");
    }

    console.log(`✅ Renewed subscription for user ${userId}:`, {
      monthlyCreditsAdded: planConfig.monthlyCredits,
      newTotalCredits: currentCredits + planConfig.monthlyCredits,
      nextCreditAllocation: nextCreditDate.toISOString(),
      planName: planConfig.name
    });

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
      const downgradeData: any = {
        planType: "free",
        stripeSubscriptionId: null,
        subscriptionEndDate: null,
        nextCreditAllocationDate: null, // Remove scheduled credit allocations
        subscriptionPlan: null, // Clear subscription plan details
        updatedAt: new Date(),
      };

      try {
        await updateDoc(userRef, downgradeData);
        console.log("✅ Downgrade updateDoc completed successfully");
      } catch (updateError: any) {
        console.warn("⚠️ Downgrade updateDoc failed, trying setDoc with merge:", updateError.message);
        
        const { setDoc } = await import("firebase/firestore");
        await setDoc(userRef, downgradeData, { merge: true });
        console.log("✅ Downgrade setDoc with merge completed successfully");
      }
      
      console.log(`⬇️ Downgraded user ${userId} to free plan`);
    } else if (subscription.status === "active") {
      // Ensure the user is on premium plan (in case of reactivation)
      const upgradeData: any = {
        planType: "premium",
        stripeSubscriptionId: subscription.id,
        updatedAt: new Date(),
      };

      try {
        await updateDoc(userRef, upgradeData);
        console.log("✅ Upgrade updateDoc completed successfully");
      } catch (updateError: any) {
        console.warn("⚠️ Upgrade updateDoc failed, trying setDoc with merge:", updateError.message);
        
        const { setDoc } = await import("firebase/firestore");
        await setDoc(userRef, upgradeData, { merge: true });
        console.log("✅ Upgrade setDoc with merge completed successfully");
      }
      
      console.log(`⬆️ Activated premium plan for user ${userId}`);
    }

  } catch (error) {
    console.error("💥 Error handling subscription change:", error);
    throw error;
  }
}