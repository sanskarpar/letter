// app/api/create-subscription/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);

const PRICE_IDS = {
  monthly: process.env.STRIPE_MONTHLY_PRICE_ID!,
  "semi-annual": process.env.STRIPE_SEMIANNUAL_PRICE_ID!,
  annual: process.env.STRIPE_ANNUAL_PRICE_ID!,
};

export async function POST(request: NextRequest) {
  try {
    // Debug: Log environment variables (do not log secrets)
    console.log("Environment check:");
    console.log("STRIPE_MONTHLY_PRICE_ID:", process.env.STRIPE_MONTHLY_PRICE_ID ? "✓" : "✗");
    console.log("STRIPE_SEMIANNUAL_PRICE_ID:", process.env.STRIPE_SEMIANNUAL_PRICE_ID ? "✓" : "✗");
    console.log("STRIPE_ANNUAL_PRICE_ID:", process.env.STRIPE_ANNUAL_PRICE_ID ? "✓" : "✗");
    console.log("NEXT_PUBLIC_BASE_URL:", process.env.NEXT_PUBLIC_BASE_URL);

    // Ensure NEXT_PUBLIC_BASE_URL is set and valid
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (
      !baseUrl ||
      (!baseUrl.startsWith("https://") && !baseUrl.startsWith("http://"))
    ) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_BASE_URL must be set and start with http:// or https://" },
        { status: 500 }
      );
    }

    const { planId, userId, userEmail } = await request.json();

    console.log("Received subscription request:", { planId, userId, userEmail });

    if (!planId || !userId || !userEmail) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const priceId = PRICE_IDS[planId as keyof typeof PRICE_IDS];
    if (!priceId) {
      console.error("Invalid plan ID:", planId);
      console.error("Available plans:", Object.keys(PRICE_IDS));
      return NextResponse.json(
        { error: "Invalid plan ID" },
        { status: 400 }
      );
    }

    console.log("Using price ID:", priceId);

    // Get or create Stripe customer
    let stripeCustomerId: string;
    
    // Check if user already has a Stripe customer ID
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.data();
    
    if (userData?.stripeCustomerId) {
      stripeCustomerId = userData.stripeCustomerId;
      console.log("Using existing Stripe customer:", stripeCustomerId);
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          firebaseUserId: userId,
        },
      });
      stripeCustomerId = customer.id;
      console.log("Created new Stripe customer:", stripeCustomerId);
      
      // Save customer ID to Firebase
      await setDoc(doc(db, "users", userId), {
        ...userData,
        stripeCustomerId: customer.id,
      }, { merge: true });
    }

    // Create Stripe checkout session
    const sessionData = {
      customer: stripeCustomerId,
      payment_method_types: ["card"] as Stripe.Checkout.SessionCreateParams.PaymentMethodType[],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription" as const,
      success_url: `${baseUrl}/dashboard?success=subscription`,
      cancel_url: `${baseUrl}/payments?canceled=true`,
      metadata: {
        userId,
        planId,
        userEmail,
        priceId, // Add price ID to metadata for debugging
      },
    };

    console.log("Creating Stripe checkout session with data:", {
      ...sessionData,
      metadata: sessionData.metadata,
    });

    const session = await stripe.checkout.sessions.create(sessionData);

    console.log("Created Stripe session:", {
      id: session.id,
      customer: session.customer,
      metadata: session.metadata,
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error: any) {
    console.error("Error creating subscription:", error);
    // Return stack trace in development for easier debugging
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
        ...(process.env.NODE_ENV !== "production" && { stack: error.stack })
      },
      { status: 500 }
    );
  }
}