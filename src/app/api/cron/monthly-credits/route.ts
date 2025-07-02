// app/api/cron/monthly-credits/route.ts
// This endpoint should be called monthly via a cron job to give free credits to all users

import { NextRequest, NextResponse } from "next/server";
import { getFirestore, collection, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { app } from "@/firebase/config";

const db = getFirestore(app);

export async function POST(request: NextRequest) {
  try {
    // Verify this is from a cron job (add authentication as needed)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log("🎁 Starting monthly free credits distribution");

    const usersRef = collection(db, "users");
    const usersSnapshot = await getDocs(usersRef);
    
    let processedUsers = 0;
    let errors = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userId = userDoc.id;
        const userData = userDoc.data();
        const currentCredits = userData?.credits || 0;
        const planType = userData?.planType || "free";
        
        // Every user gets 5 free credits monthly
        const freeCreditsToAdd = 5;
        
        // Premium users get additional 20 bonus credits
        const bonusCreditsToAdd = planType === "premium" ? 20 : 0;
        
        const totalCreditsToAdd = freeCreditsToAdd + bonusCreditsToAdd;
        
        // Check if user already received credits this month
        const lastMonthlyGrant = userData?.lastMonthlyGrant;
        const now = new Date();
        
        if (lastMonthlyGrant && lastMonthlyGrant.toDate) {
          const lastGrantDate = lastMonthlyGrant.toDate();
          const daysSinceLastGrant = Math.floor((now.getTime() - lastGrantDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // Skip if already granted this month (less than 25 days ago to avoid edge cases)
          if (daysSinceLastGrant < 25) {
            console.log(`⏭️ Skipping user ${userId} - already received credits this month`);
            continue;
          }
        }

        const updateData = {
          credits: currentCredits + totalCreditsToAdd,
          lastMonthlyGrant: now,
          updatedAt: now
        };

        await updateDoc(doc(db, "users", userId), updateData);
        
        console.log(`✅ Added ${totalCreditsToAdd} credits to user ${userId} (${planType}): ${freeCreditsToAdd} free + ${bonusCreditsToAdd} bonus`);
        processedUsers++;
        
      } catch (error) {
        console.error(`❌ Error processing user ${userDoc.id}:`, error);
        errors++;
      }
    }

    console.log(`🎁 Monthly credits distribution completed: ${processedUsers} users processed, ${errors} errors`);
    
    return NextResponse.json({
      success: true,
      processedUsers,
      errors,
      message: "Monthly credits distributed successfully"
    });

  } catch (error) {
    console.error("💥 Error in monthly credits distribution:", error);
    return NextResponse.json(
      { error: (error instanceof Error ? error.message : "Internal server error") },
      { status: 500 }
    );
  }
}

// GET endpoint for manual testing
export async function GET() {
  return NextResponse.json({
    message: "Monthly credits endpoint is working. Use POST with proper authentication to run.",
    info: {
      freeUsers: "5 credits per month",
      premiumUsers: "25 credits per month (5 free + 20 bonus)"
    }
  });
}