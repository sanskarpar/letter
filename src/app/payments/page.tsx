"use client";
import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { app } from "@/firebase/config";
import { loadStripe } from "@stripe/stripe-js";

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface UserData {
  name: string;
  email: string;
  role: string;
  planType: string;
  subscriptionEndDate: Date;
  credits: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

const SUBSCRIPTION_PLANS = [
  {
    id: "monthly",
    name: "Monthly Plan",
    price: 10,
    duration: "1 month",
    credits: 20,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
  },
  {
    id: "semi-annual",
    name: "6 Months Plan",
    price: 8.5,
    originalPrice: 10,
    duration: "6 months",
    credits: 20,
    savings: "15% off",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_SEMIANNUAL_PRICE_ID,
  },
  {
    id: "annual",
    name: "Annual Plan",
    price: 7,
    originalPrice: 10,
    duration: "12 months",
    credits: 20,
    savings: "30% off",
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID,
  },
];

const CREDIT_PACKAGES = [
  { credits: 5, price: 1 },
  { credits: 25, price: 5 },
  { credits: 50, price: 10 },
  { credits: 100, price: 20 },
];

export default function PaymentsPage() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState<string | null>(null);
  const [error, setError] = useState("");
  
  const auth = getAuth(app);
  const db = getFirestore(app);
  const user = auth.currentUser;

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data() as UserData;
        setUserData(data);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      setError("Failed to load user data");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscription = async (planId: string) => {
    if (!user || !userData) return;
    
    setProcessingPayment(planId);
    setError("");

    try {
      const response = await fetch("/api/create-subscription", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId,
          userId: user.uid,
          userEmail: userData.email,
        }),
      });

      const { sessionId } = await response.json();
      
      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const stripe = await stripePromise;
      const { error } = await stripe!.redirectToCheckout({ sessionId });
      
      if (error) {
        throw error;
      }
    } catch (error: any) {
      setError(error.message || "Payment failed");
    } finally {
      setProcessingPayment(null);
    }
  };

  const handleCreditPurchase = async (credits: number, price: number) => {
    if (!user || !userData) return;
    
    setProcessingPayment(`credits-${credits}`);
    setError("");

    try {
      const response = await fetch("/api/buy-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          credits,
          price,
          userId: user.uid,
          userEmail: userData.email,
        }),
      });

      const { sessionId } = await response.json();
      
      if (!response.ok) {
        throw new Error("Failed to create checkout session");
      }

      const stripe = await stripePromise;
      const { error } = await stripe!.redirectToCheckout({ sessionId });
      
      if (error) {
        throw error;
      }
    } catch (error: any) {
      setError(error.message || "Payment failed");
    } finally {
      setProcessingPayment(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-black">Loading...</div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-red-600">Failed to load user data</div>
      </div>
    );
  }

  const isSubscribed = userData.planType !== "free";
  // Support Firestore Timestamp or JS Date or null
  let subscriptionEndDate: Date | null = null;
  if (userData.subscriptionEndDate) {
    // Firestore Timestamp objects have a toDate method, JS Dates do not
    if (
      typeof (userData.subscriptionEndDate as any).toDate === "function"
    ) {
      subscriptionEndDate = (userData.subscriptionEndDate as any).toDate();
    } else if (userData.subscriptionEndDate instanceof Date) {
      subscriptionEndDate = userData.subscriptionEndDate;
    } else {
      // fallback: try to parse as date
      subscriptionEndDate = new Date(userData.subscriptionEndDate as any);
    }
  }
  const isSubscriptionActive = subscriptionEndDate && subscriptionEndDate > new Date();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Payments & Upgrades
          </h1>
          <p className="text-lg text-black">
            Upgrade your plan or buy additional credits to enhance your MailFlow experience
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-lg text-center max-w-2xl mx-auto">
            {error}
          </div>
        )}

        {/* Current Plan Status */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8 max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-4 text-black">Current Plan Status</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {userData.planType.charAt(0).toUpperCase() + userData.planType.slice(1)}
              </div>
              <div className="text-black">Current Plan</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{userData.credits}</div>
              <div className="text-black">Available Credits</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-lg font-bold text-purple-600">
                {isSubscribed && isSubscriptionActive 
                  ? subscriptionEndDate?.toLocaleDateString()
                  : "No active subscription"
                }
              </div>
              <div className="text-black">
                {isSubscribed && isSubscriptionActive ? "Expires" : "Status"}
              </div>
            </div>
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8 text-black">Choose Your Plan</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl shadow-lg p-6 ${
                  plan.id === "semi-annual" ? "ring-2 ring-blue-500 transform scale-105" : ""
                }`}
              >
                {plan.id === "semi-annual" && (
                  <div className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-full mb-4 text-center">
                    MOST POPULAR
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold mb-2 text-black">{plan.name}</h3>
                  <div className="mb-2">
                    <span className="text-3xl font-bold text-black">€{plan.price}</span>
                    <span className="text-black">/month</span>
                  </div>
                  {plan.originalPrice && (
                    <div className="text-sm text-gray-500">
                      <span className="line-through">€{plan.originalPrice}/month</span>
                      <span className="text-green-600 ml-2 font-semibold">{plan.savings}</span>
                    </div>
                  )}
                  <div className="text-sm text-black">Billed every {plan.duration}</div>
                </div>
                
                <div className="space-y-3 mb-6">
                  <div className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-black">5 free credits every month</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-black">{plan.credits} bonus credits monthly</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-black">Priority support</span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-green-500 mr-2">✓</span>
                    <span className="text-black">Advanced features</span>
                  </div>
                </div>

                <button
                  onClick={() => handleSubscription(plan.id)}
                  disabled={processingPayment === plan.id}
                  className={`w-full py-3 rounded-full font-semibold transition-colors ${
                    plan.id === "semi-annual"
                      ? "bg-blue-600 text-white hover:bg-blue-700"
                      : "bg-gray-800 text-white hover:bg-gray-900"
                  } ${
                    processingPayment === plan.id ? "opacity-70 cursor-not-allowed" : ""
                  }`}
                >
                  {processingPayment === plan.id ? "Processing..." : "Choose Plan"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Credit Packages */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8 text-black">Buy Additional Credits</h2>
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="text-center mb-6">
              <p className="text-black">
                Need more credits? Purchase additional credits starting at €1 for 5 credits.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {CREDIT_PACKAGES.map((pkg) => (
                <div key={pkg.credits} className="border rounded-lg p-4 text-center hover:shadow-md transition-shadow">
                  <div className="text-2xl font-bold text-blue-600 mb-2">
                    {pkg.credits} Credits
                  </div>
                  <div className="text-xl font-semibold mb-3 text-black">€{pkg.price}</div>
                  <div className="text-sm text-black mb-4">
                    €{(pkg.price / pkg.credits).toFixed(2)} per credit
                  </div>
                  <button
                    onClick={() => handleCreditPurchase(pkg.credits, pkg.price)}
                    disabled={processingPayment === `credits-${pkg.credits}`}
                    className={`w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors ${
                      processingPayment === `credits-${pkg.credits}` ? "opacity-70 cursor-not-allowed" : ""
                    }`}
                  >
                    {processingPayment === `credits-${pkg.credits}` ? "Processing..." : "Buy Now"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Credit Usage Info */}
        <div className="max-w-4xl mx-auto mt-8">
          <div className="bg-blue-50 rounded-2xl p-6">
            <h3 className="text-xl font-bold mb-4 text-black">How Credits Work</h3>
            <div className="text-sm">
              <h4 className="font-semibold mb-2 text-black">Paid Plans:</h4>
              <ul className="space-y-1 text-black">
                <li>• 5 free credits + 20 bonus credits monthly</li>
                <li>• Credits accumulate (don't expire)</li>
                <li>• All premium features included</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}