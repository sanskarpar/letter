// app/api/buy-credits/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY is not set. Please check your .env.local file.");
}
const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);

// Credit packages (must match frontend)
const CREDIT_PACKAGES = [
  { credits: 5, price: 1 },
  { credits: 25, price: 5 },
  { credits: 50, price: 9 },
  { credits: 100, price: 17 },
];

export async function POST(request: NextRequest) {
  try {
    const { credits, price, userId, userEmail } = await request.json();

    if (!credits || !price || !userId || !userEmail) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Validate credit package
    const packageConfig = CREDIT_PACKAGES.find(
      (pkg) => pkg.credits === credits && pkg.price === price
    );
    if (!packageConfig) {
      return NextResponse.json(
        { error: "Invalid credit package" },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    let stripeCustomerId: string;
    const userDoc = await getDoc(doc(db, "users", userId));
    const userData = userDoc.data();

    if (userData?.stripeCustomerId) {
      stripeCustomerId = userData.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          firebaseUserId: userId,
        },
      });
      stripeCustomerId = customer.id;

      await setDoc(
        doc(db, "users", userId),
        { stripeCustomerId: customer.id },
        { merge: true }
      );
    }

    // Create Stripe checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `${credits} MailFlow Credits`,
              description: `Purchase ${credits} credits for your MailFlow account`,
            },
            unit_amount: price * 100, // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?success=credits`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payments?canceled=true`,
      metadata: {
        userId,
        credits: credits.toString(),
        type: "credits",
      },
    });

    return NextResponse.json({ sessionId: session.id });
  } catch (error: any) {
    console.error("Error creating credit purchase session:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}