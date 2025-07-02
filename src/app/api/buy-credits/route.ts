// app/api/buy-credits/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-06-30.basil",
});

const db = getFirestore(app);

export async function POST(request: NextRequest) {
  try {
    const { credits, price, userId, userEmail } = await request.json();

    if (!credits || !price || !userId || !userEmail) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Validate credit package (€1 for 5 credits ratio)
    const expectedPrice = Math.ceil(credits / 5);
    if (price !== expectedPrice) {
      return NextResponse.json(
        { error: "Invalid credit package pricing" },
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
      
      await setDoc(doc(db, "users", userId), {
        ...userData,
        stripeCustomerId: customer.id,
      }, { merge: true });
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