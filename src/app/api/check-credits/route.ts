// app/api/check-credits/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, doc, runTransaction, Timestamp, increment, arrayUnion } from "firebase/firestore";
import { initializeApp, getApps } from "firebase/app";
import { firebaseConfig } from "@/firebase/config";

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db = getFirestore(app);

const MONTHLY_CREDITS = 20;

function getNextCreditDate(fromDate: Date): Timestamp {
  const nextDate = new Date(fromDate);
  nextDate.setDate(nextDate.getDate() + 30);
  return Timestamp.fromDate(nextDate);
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const userRef = doc(db, "users", userId);
    
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists()) {
        throw new Error(`User not found: ${userId}`);
      }

      const userData = userDoc.data();
      if (userData.planType !== "premium") return;

      const now = new Date();
      const lastCreditDate = userData.lastMonthlyCredit?.toDate();
      const nextCreditDate = userData.nextCreditDate?.toDate();
      
      if (!lastCreditDate) {
        transaction.update(userRef, {
          lastMonthlyCredit: Timestamp.now(),
          nextCreditDate: getNextCreditDate(new Date())
        });
        return;
      }

      if (now >= (nextCreditDate || new Date(0))) {
        transaction.update(userRef, {
          credits: increment(MONTHLY_CREDITS),
          lastMonthlyCredit: Timestamp.now(),
          nextCreditDate: getNextCreditDate(now),
          creditHistory: arrayUnion({
            date: Timestamp.now(),
            credits: MONTHLY_CREDITS,
            type: "monthly"
          })
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Credit check error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}