// app/api/users/check-credits/route.ts
import { NextRequest, NextResponse } from "next/server";
import { 
  getFirestore, 
  doc, 
  runTransaction, 
  Timestamp,
  arrayUnion,
} from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "@/firebase/config";

// Initialize Firebase
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const MONTHLY_CREDITS = 20;

// Enhanced logging
function logEvent(eventName: string, data: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${eventName}:`, JSON.stringify(data, null, 2));
}

// Calculate how many months have passed between two dates
function getMonthsDifference(startDate: Date, endDate: Date): number {
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const endYear = endDate.getFullYear();
  const endMonth = endDate.getMonth();
  
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

// Calculate next credit date (30 days from now)
function getNextCreditDate(fromDate: Date): Timestamp {
  const nextDate = new Date(fromDate);
  nextDate.setDate(nextDate.getDate() + 30);
  return Timestamp.fromDate(nextDate);
}

// Load up missed monthly credits when user logs in
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
      return { creditsAdded: 0, monthsProcessed: 0 };
    }

    const now = new Date();
    const subscriptionStart = userData.subscriptionStart?.toDate();
    const lastMonthlyCredit = userData.lastMonthlyCredit?.toDate() || subscriptionStart;
    
    if (!subscriptionStart || !lastMonthlyCredit) {
      logEvent("SkippedCreditLoad", { userId, reason: "Missing subscription or credit dates" });
      return { creditsAdded: 0, monthsProcessed: 0 };
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

      return { creditsAdded: creditsToAdd, monthsProcessed: monthsSinceLastCredit };
    } else {
      logEvent("NoMissedCredits", { userId, lastCreditDate: lastMonthlyCredit.toISOString() });
      return { creditsAdded: 0, monthsProcessed: 0 };
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }

    const result = await loadMissedMonthlyCredits(userId);
    
    return NextResponse.json({
      success: true,
      creditsAdded: result.creditsAdded,
      monthsProcessed: result.monthsProcessed,
      message: result.creditsAdded > 0 
        ? `Added ${result.creditsAdded} credits for ${result.monthsProcessed} missed months`
        : "No missed credits to add"
    });

  } catch (error: any) {
    logEvent("CreditCheckError", { error: error.message });
    return NextResponse.json(
      { error: "Failed to check credits", details: error.message }, 
      { status: 500 }
    );
  }
}